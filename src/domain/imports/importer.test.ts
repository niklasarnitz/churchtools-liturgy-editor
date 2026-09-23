import { describe, expect, it } from 'vitest';

import type { HymnalDefinition } from '../../data/hymnals';
import type { NativeArrangement, NativeSong, NativeSongCategory, NativeSongCreate } from '../../churchtools/types';
import { HymnalImporter, type HymnalSongPort } from './importer';
import type { HymnalImportState, HymnalImportStateRepository } from './types';

const hymnal: HymnalDefinition = {
    id: 'demo',
    version: 1,
    name: 'Demo',
    shortName: 'Demo',
    organizationIds: ['ekiba'],
    language: 'de',
    songs: [{ id: 'demo:1', number: '1', title: 'Song' }],
};

class MemoryState implements HymnalImportStateRepository {
    value?: HymnalImportState;

    async load(): Promise<HymnalImportState | undefined> {
        return this.value;
    }

    async save(state: HymnalImportState): Promise<void> {
        this.value = structuredClone(state);
    }

    async delete(): Promise<void> {
        this.value = undefined;
    }
}

class FakeSongs implements HymnalSongPort {
    createCount = 0;
    arrangementCount = 0;
    arrangementListCount = 0;
    lastCreateInput?: NativeSongCreate;
    private song?: NativeSong;

    async listCategories(): Promise<NativeSongCategory[]> {
        return [{ id: 1, name: 'demo' }];
    }

    async createCategory(): Promise<NativeSongCategory> {
        return { id: 1, name: 'demo' };
    }

    async get(songId: number): Promise<NativeSong> {
        if (!this.song || this.song.id !== songId) throw new Error('missing');
        return this.song;
    }

    async list(): Promise<NativeSong[]> {
        return this.song ? [this.song] : [];
    }

    async create(input: NativeSongCreate): Promise<NativeSong> {
        this.createCount += 1;
        this.lastCreateInput = input;
        this.song = {
            id: 42,
            name: 'Song',
            category: { id: 1, name: 'demo' },
            arrangements: input.arrangements?.map((arrangement, index) => ({
                ...arrangement,
                id: 99 + index,
                files: [],
                links: [],
                meta: {} as NativeArrangement['meta'],
                source: {} as NativeArrangement['source'],
            })),
        };
        return this.song;
    }

    async update(_songId: number, input: { name: string }): Promise<NativeSong> {
        this.song = { ...this.song, id: 42, name: input.name, category: { id: 1, name: 'demo' } };
        return this.song;
    }

    async delete(): Promise<void> {
        this.song = undefined;
    }

    async listArrangements(): Promise<NativeArrangement[]> {
        this.arrangementListCount += 1;
        return [];
    }

    async createArrangement(): Promise<NativeArrangement> {
        this.arrangementCount += 1;
        return {
            id: 99,
            name: 'Standard',
            isDefault: true,
            files: [],
            links: [],
            meta: {} as NativeArrangement['meta'],
            source: {} as NativeArrangement['source'],
        };
    }
}

describe('HymnalImporter', () => {
    it('verifies state persistence before creating native categories or songs', async () => {
        const songs = new FakeSongs();
        let categoryCreates = 0;
        songs.listCategories = async () => [];
        songs.createCategory = async () => {
            categoryCreates += 1;
            return { id: 1, name: 'demo' };
        };
        const state: HymnalImportStateRepository = {
            load: async () => undefined,
            save: async () => { throw new Error('state is not writable'); },
            delete: async () => undefined,
        };
        const importer = new HymnalImporter(songs, state);

        await expect(importer.import(hymnal)).rejects.toThrow('state is not writable');
        expect(categoryCreates).toBe(0);
        expect(songs.createCount).toBe(0);
    });

    it('is resumable and idempotent after the mapping was persisted', async () => {
        const songs = new FakeSongs();
        const state = new MemoryState();
        const importer = new HymnalImporter(songs, state);

        await importer.import(hymnal, { now: () => '2026-01-01T00:00:00.000Z' });
        await importer.import(hymnal, { now: () => '2026-01-01T00:00:01.000Z' });

        expect(songs.createCount).toBe(1);
        expect(songs.lastCreateInput?.arrangements).toEqual([{ name: 'Standard', isDefault: true }]);
        expect(songs.arrangementListCount).toBe(0);
        expect(songs.arrangementCount).toBe(0);
        expect(state.value?.status).toBe('completed');
        expect(state.value?.mappings['demo:1'].churchToolsSongId).toBe(42);
        expect(state.value?.mappings['demo:1'].churchToolsArrangementId).toBe(99);
    });

    it('does not create a duplicate after an ambiguous create response', async () => {
        const songs = new FakeSongs();
        const state = new MemoryState();
        const importer = new HymnalImporter(songs, state);
        songs.create = async () => {
            songs.createCount += 1;
            throw Object.assign(new Error('connection lost after request'), { status: undefined });
        };

        const first = await importer.import(hymnal, { now: () => '2026-01-01T00:00:00.000Z' });
        const second = await importer.import(hymnal, { now: () => '2026-01-01T00:00:01.000Z' });

        expect(songs.createCount).toBe(1);
        expect(first.pendingCreates?.['demo:1']).toBeDefined();
        expect(second.failures[0]).toMatchObject({ hymnalSongId: 'demo:1', kind: 'conflict' });
    });
});
