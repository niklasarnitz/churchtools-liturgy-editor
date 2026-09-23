import type { JsonStateStore } from '../churchtools/customModuleStore';

/**
 * ChurchTools custom data values are deliberately kept below the platform's
 * 10k value limit. Large import mappings are split into deterministic shards.
 * The manifest is itself a normal JSON value and makes recovery/diagnostics
 * possible without a second database.
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
        const chunkCount = manifest.chunkCount ?? 0;
        for (let index = 0; index < chunkCount; index += 1) {
            const chunk = await this.store.get<ShardChunk>(this.chunkKey(key, index));
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
        const previous = await this.store.get<ShardManifest>(this.manifestKey(key));
        if (encoded.length <= this.chunkSize) {
            await this.store.set(this.manifestKey(key), { version: 1, inline: value } satisfies ShardManifest);
            await this.removeChunks(key, previous?.chunkCount ?? 0);
            return;
        }
        const count = Math.ceil(encoded.length / this.chunkSize);
        const chunks = Array.from(
            { length: count },
            (_, index) => encoded.slice(index * this.chunkSize, (index + 1) * this.chunkSize),
        );
        const chunkChecksums = chunks.map(checksum);
        const manifest: ShardManifest = {
            version: 1,
            chunkCount: count,
            checksum: checksum(encoded),
            chunkChecksums,
        };
        for (let index = 0; index < count; index += 1) {
            if (previous?.chunkChecksums?.[index] === chunkChecksums[index]) continue;
            await this.store.set(this.chunkKey(key, index), { version: 1, data: chunks[index] });
        }
        // Publish only after every referenced shard is durable.
        await this.store.set(this.manifestKey(key), manifest);
        if (previous?.chunkCount && previous.chunkCount > count) await this.removeChunks(key, previous.chunkCount - count, count);
    }

    async delete(key: string): Promise<void> {
        await this.enqueue(key, async () => this.remove(key));
    }

    private async remove(key: string): Promise<void> {
        const previous = await this.store.get<ShardManifest>(this.manifestKey(key));
        await this.store.delete(this.manifestKey(key));
        await this.removeChunks(key, previous?.chunkCount ?? 0);
    }

    private async enqueue(key: string, operation: () => Promise<void>): Promise<void> {
        const previous = this.queues.get(key) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        this.queues.set(key, current);
        try { await current; } finally { if (this.queues.get(key) === current) this.queues.delete(key); }
    }

    private manifestKey(key: string): string { return `${this.namespace}:manifest:${key}`; }
    private chunkKey(key: string, index: number): string { return `${this.namespace}:chunk:${key}:${index}`; }

    private async removeChunks(key: string, count: number, start = 0): Promise<void> {
        for (let index = start; index < start + count; index += 1) await this.store.delete(this.chunkKey(key, index));
    }
}

type ShardManifest = { version: 1; inline?: unknown; chunkCount?: number; checksum?: string; chunkChecksums?: string[] };
type ShardChunk = { version: 1; data: string };

function checksum(value: string): string {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
