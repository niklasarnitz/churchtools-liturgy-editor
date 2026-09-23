import type { JsonStateStore } from '../churchtools/customModuleStore';

/**
 * ChurchTools limits each custom data value to 10k characters. Shards are
 * immutable; replacing a manifest is the only publishing step. A failed write
 * therefore leaves the previous manifest and all of its shards readable.
 */
export class ShardedJsonStateStore implements JsonStateStore {
    private readonly store: JsonStateStore;
    private readonly namespace: string;
    private readonly chunkSize: number;
    private readonly queues = new Map<string, Promise<void>>();

    constructor(store: JsonStateStore, namespace = 'application', chunkSize = 7_000) {
        if (chunkSize < 512 || chunkSize >= 9_000) throw new Error('Shard size must be between 512 and 8999 characters.');
        this.store = store;
        this.namespace = namespace;
        this.chunkSize = chunkSize;
    }

    async get<T>(key: string): Promise<T | undefined> {
        await this.queues.get(key);
        const manifest = await this.store.get<ShardManifest>(this.manifestKey(key));
        if (!manifest) return undefined;
        if (manifest.inline !== undefined) return manifest.inline as T;
        const parts: string[] = [];
        const chunkKeys = manifest.version === 2
            ? manifest.chunkKeys ?? []
            : Array.from({ length: manifest.chunkCount ?? 0 }, (_, index) => this.legacyChunkKey(key, index));
        for (let index = 0; index < chunkKeys.length; index += 1) {
            const chunk = await this.store.get<ShardChunk>(chunkKeys[index]);
            if (!chunk || typeof chunk.data !== 'string') throw new Error(`State shard is missing: ${key}#${index}`);
            parts.push(chunk.data);
        }
        const encoded = parts.join('');
        if (checksum(encoded) !== manifest.checksum) throw new Error(`State shard checksum mismatch: ${key}`);
        return JSON.parse(encoded) as T;
    }

    async set<T>(key: string, value: T): Promise<void> {
        await this.enqueue(key, async () => this.write(key, value));
    }

    private async write<T>(key: string, value: T): Promise<void> {
        const encoded = JSON.stringify(value);
        if (encoded === undefined) throw new Error(`State value cannot be serialized: ${key}`);
        const manifestKey = this.manifestKey(key);
        const previous = await this.store.get<ShardManifest>(manifestKey);
        const inline: ShardManifest = { version: 2, inline: value };
        if (encoded.length <= this.chunkSize && this.storedLength(manifestKey, inline) <= 10_000) {
            await this.store.set(manifestKey, inline);
            await this.removePreviousChunks(key, previous, []);
            return;
        }
        const previousKeys = previous?.version === 2 ? previous.chunkKeys ?? [] : [];
        const previousChecksums = previous?.version === 2 ? previous.chunkChecksums ?? [] : [];
        const chunkKeys: string[] = [];
        const chunkChecksums: string[] = [];
        const stagedKeys: string[] = [];
        let offset = 0;
        try {
            while (offset < encoded.length) {
                const candidateKey = this.newChunkKey(key);
                const size = this.nextChunkSize(encoded, offset, candidateKey);
                const data = encoded.slice(offset, offset + size);
                const chunkChecksum = checksum(data);
                const index = chunkKeys.length;
                if (previousKeys[index] && previousChecksums[index] === chunkChecksum) {
                    chunkKeys.push(previousKeys[index]);
                } else {
                    await this.store.set(candidateKey, { version: 2, data });
                    stagedKeys.push(candidateKey);
                    chunkKeys.push(candidateKey);
                }
                chunkChecksums.push(chunkChecksum);
                offset += size;
            }
            const manifest: ShardManifest = { version: 2, chunkKeys, checksum: checksum(encoded), chunkChecksums };
            if (this.storedLength(manifestKey, manifest) > 10_000) throw new Error(`State manifest exceeds ChurchTools value limit: ${key}`);
            await this.store.set(manifestKey, manifest);
        } catch (error) {
            await Promise.allSettled(stagedKeys.map((chunkKey) => this.store.delete(chunkKey)));
            throw error;
        }
        await this.removePreviousChunks(key, previous, chunkKeys);
    }

    async delete(key: string): Promise<void> {
        await this.enqueue(key, async () => this.remove(key));
    }

    private async remove(key: string): Promise<void> {
        const previous = await this.store.get<ShardManifest>(this.manifestKey(key));
        await this.store.delete(this.manifestKey(key));
        await this.removePreviousChunks(key, previous, []);
    }

    private async enqueue(key: string, operation: () => Promise<void>): Promise<void> {
        const previous = this.queues.get(key) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        this.queues.set(key, current);
        try { await current; } finally { if (this.queues.get(key) === current) this.queues.delete(key); }
    }

    private manifestKey(key: string): string { return `${this.namespace}:manifest:${key}`; }
    private legacyChunkKey(key: string, index: number): string { return `${this.namespace}:chunk:${key}:${index}`; }
    private newChunkKey(key: string): string { return `${this.namespace}:chunk2:${key}:${crypto.randomUUID()}`; }
    private storedLength(key: string, data: unknown): number { return JSON.stringify({ key, data }).length; }

    private nextChunkSize(encoded: string, offset: number, key: string): number {
        let low = 0;
        let high = Math.min(this.chunkSize, encoded.length - offset);
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (this.storedLength(key, { version: 2, data: encoded.slice(offset, offset + middle) }) <= 10_000) low = middle;
            else high = middle - 1;
        }
        if (low === 0) throw new Error('State shard cannot fit in a ChurchTools custom data value.');
        return low;
    }

    private async removePreviousChunks(key: string, previous: ShardManifest | undefined, retainedKeys: readonly string[]): Promise<void> {
        if (!previous || previous.inline !== undefined) return;
        const oldKeys = previous.version === 2
            ? previous.chunkKeys ?? []
            : Array.from({ length: previous.chunkCount ?? 0 }, (_, index) => this.legacyChunkKey(key, index));
        const retained = new Set(retainedKeys);
        for (const oldKey of oldKeys) if (!retained.has(oldKey)) await this.store.delete(oldKey);
    }
}

type ShardManifest =
    | { version: 1; inline?: unknown; chunkCount?: number; checksum?: string; chunkChecksums?: string[] }
    | { version: 2; inline?: unknown; chunkKeys?: string[]; checksum?: string; chunkChecksums?: string[] };
type ShardChunk = { version: 1 | 2; data: string };

function checksum(value: string): string {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
