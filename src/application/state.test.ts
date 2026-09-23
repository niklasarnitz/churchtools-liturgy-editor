import { describe, expect, it } from 'vitest';
import { ShardedJsonStateStore } from './state';
import type { JsonStateStore } from '../churchtools/customModuleStore';

class MemoryStore implements JsonStateStore {
    values = new Map<string, unknown>();
    writes: string[] = [];
    async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
    async set<T>(key: string, value: T): Promise<void> { this.writes.push(key); this.values.set(key, value); }
    async delete(key: string): Promise<void> { this.values.delete(key); }
}

describe('ShardedJsonStateStore', () => {
    it('round-trips large state and removes obsolete shards', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        await store.set('mapping', { values: Array.from({ length: 2_000 }, (_, index) => `song-${index}`) });
        expect((await store.get<{ values: string[] }>('mapping'))?.values).toHaveLength(2_000);
        const firstShardCount = [...backing.values.keys()].filter((key) => key.includes(':chunk:')).length;
        expect(firstShardCount).toBeGreaterThan(1);
        await store.set('mapping', { ok: true });
        expect(await store.get('mapping')).toEqual({ ok: true });
        expect([...backing.values.keys()].some((key) => key.includes(':chunk:'))).toBe(false);
    });

    it('only rewrites changed shards and publishes the manifest last', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        const first = { values: Array.from({ length: 500 }, (_, index) => `song-${index}`) };
        await store.set('mapping', first);
        backing.writes = [];

        await store.set('mapping', { values: [...first.values, 'one-more-song'] });

        const chunkWrites = backing.writes.filter((key) => key.includes(':chunk:'));
        expect(chunkWrites.length).toBeLessThan(
            [...backing.values.keys()].filter((key) => key.includes(':chunk:')).length,
        );
        expect(backing.writes.at(-1)).toBe('test:manifest:mapping');
    });
});
