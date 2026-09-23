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
        const firstShardCount = [...backing.values.keys()].filter((key) => key.includes(':chunk')).length;
        expect(firstShardCount).toBeGreaterThan(1);
        await store.set('mapping', { ok: true });
        expect(await store.get('mapping')).toEqual({ ok: true });
        expect([...backing.values.keys()].some((key) => key.includes(':chunk'))).toBe(false);
    });

    it('only writes changed immutable shards and publishes the manifest last', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        const first = { values: Array.from({ length: 500 }, (_, index) => `song-${index}`) };
        await store.set('mapping', first);
        backing.writes = [];

        await store.set('mapping', { values: [...first.values, 'one-more-song'] });

        const chunkWrites = backing.writes.filter((key) => key.includes(':chunk'));
        expect(chunkWrites.length).toBeLessThan(
            [...backing.values.keys()].filter((key) => key.includes(':chunk')).length,
        );
        expect(backing.writes.at(-1)).toBe('test:manifest:mapping');
    });

    it('keeps the previous state readable when a shard write fails', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        const original = { values: Array.from({ length: 200 }, (_, index) => `song-${index}`) };
        await store.set('mapping', original);
        const oldManifest = backing.values.get('test:manifest:mapping');
        const originalSet = backing.set.bind(backing);
        backing.set = async (key, value) => {
            if (key.includes(':chunk')) throw new Error('interrupted write');
            await originalSet(key, value);
        };

        await expect(store.set('mapping', { values: [...original.values, 'another-song'] })).rejects.toThrow('interrupted write');
        expect(backing.values.get('test:manifest:mapping')).toEqual(oldManifest);
        expect(await store.get('mapping')).toEqual(original);
    });

    it('keeps the previous state readable when manifest publication fails', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        const original = { text: 'old'.repeat(1000) };
        await store.set('mapping', original);
        const priorKeys = new Set(backing.values.keys());
        const originalSet = backing.set.bind(backing);
        backing.set = async (key, value) => {
            if (key === 'test:manifest:mapping') throw new Error('manifest unavailable');
            await originalSet(key, value);
        };
        await expect(store.set('mapping', { text: 'new'.repeat(1000) })).rejects.toThrow('manifest unavailable');
        expect(await store.get('mapping')).toEqual(original);
        expect(new Set(backing.values.keys())).toEqual(priorKeys);
    });

    it('reads old manifests and migrates them when next written', async () => {
        const backing = new MemoryStore();
        backing.values.set('test:manifest:mapping', { version: 1, inline: { old: true } });
        const store = new ShardedJsonStateStore(backing, 'test', 512);
        expect(await store.get('mapping')).toEqual({ old: true });
        await store.set('mapping', { current: true });
        expect(await store.get('mapping')).toEqual({ current: true });
    });

    it('keeps each CT value below the real 10000 character limit after escaping', async () => {
        const backing = new MemoryStore();
        const store = new ShardedJsonStateStore(backing, 'test', 7000);
        await store.set('mapping', { text: '"\\'.repeat(5000) });
        for (const [key, value] of backing.values) {
            expect(JSON.stringify({ key, data: value }).length).toBeLessThanOrEqual(10_000);
        }
    });
});
