import { describe, expect, it } from 'vitest';
import { ShardedJsonStateStore } from './state';
import type { JsonStateStore } from '../churchtools/customModuleStore';

class MemoryStore implements JsonStateStore {
    values = new Map<string, unknown>();
    async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
    async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
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
});
