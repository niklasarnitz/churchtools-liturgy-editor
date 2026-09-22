import { describe, expect, it } from 'vitest';

import type { NativeArrangement, NativeSong, NativeSongCategory } from '../../churchtools/types';
import { ChurchToolsAgendaSongUsageChecker, type AgendaSongUsageCoverage } from '../../churchtools/agendas';
import { nativeSongFingerprint } from './fingerprint';
import { HymnalUninstaller, type HymnalUsageChecker } from './uninstaller';
import type { HymnalImportState, HymnalImportStateRepository } from './types';
import type { HymnalSongPort } from './importer';

const nativeSong: NativeSong = {
    id: 42,
    name: 'Lobe den Herren',
    category: { id: 7, name: 'Demo' },
};

function importState(): HymnalImportState {
    const now = '2026-09-22T00:00:00.000Z';
    return {
        operationId: 'demo:1',
        hymnalId: 'demo',
        hymnalVersion: 1,
        status: 'completed',
        total: 1,
        completed: 1,
        failed: 0,
        mappings: {
            'demo:1': {
                hymnalSongId: 'demo:1',
                churchToolsSongId: nativeSong.id,
                importedFingerprint: nativeSongFingerprint(nativeSong),
                sourceFingerprint: 'source',
                hymnalVersion: 1,
                createdAt: now,
                updatedAt: now,
            },
        },
        failures: [],
        startedAt: now,
        updatedAt: now,
    };
}

class MemoryState implements HymnalImportStateRepository {
    value: HymnalImportState;

    constructor(value = importState()) {
        this.value = structuredClone(value);
    }

    async load(): Promise<HymnalImportState> {
        return structuredClone(this.value);
    }

    async save(state: HymnalImportState): Promise<void> {
        this.value = structuredClone(state);
    }
}

class FakeSongs implements HymnalSongPort {
    deleteCount = 0;
    private current: NativeSong | undefined = nativeSong;

    async listCategories(): Promise<NativeSongCategory[]> {
        return [];
    }

    async createCategory(): Promise<NativeSongCategory> {
        return { id: 7, name: 'Demo' };
    }

    async get(songId: number): Promise<NativeSong> {
        if (!this.current || this.current.id !== songId) throw new Error('missing');
        return structuredClone(this.current);
    }

    async create(): Promise<NativeSong> {
        return nativeSong;
    }

    async update(): Promise<NativeSong> {
        return nativeSong;
    }

    async delete(songId: number): Promise<void> {
        if (!this.current || this.current.id !== songId) throw new Error('missing');
        this.deleteCount += 1;
        this.current = undefined;
    }

    async listArrangements(): Promise<NativeArrangement[]> {
        return [];
    }

    async createArrangement(): Promise<NativeArrangement> {
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

class ToggleUsage implements HymnalUsageChecker {
    calls = 0;

    async getCoverage(): Promise<AgendaSongUsageCoverage> {
        return { complete: true, checkedEventIds: [1, 2, 3] };
    }

    async isSongUsed(): Promise<boolean> {
        this.calls += 1;
        // Dry-run sees the song as unused; the immediate pre-delete check sees
        // a concurrent native agenda use and must block the DELETE.
        return this.calls >= 2;
    }
}

describe('HymnalUninstaller', () => {
    it('fails closed when event pagination/coverage is incomplete', async () => {
        const songs = new FakeSongs();
        const state = new MemoryState();
        const usage: HymnalUsageChecker = {
            async getCoverage() {
                return {
                    complete: false,
                    reason: 'Event-Seiten konnten nicht vollständig geladen werden.',
                };
            },
            async isSongUsed() {
                return false;
            },
        };

        const plan = await new HymnalUninstaller(songs, state, usage).dryRun('demo');

        expect(plan.safeCount).toBe(0);
        expect(plan.conflicts).toMatchObject([
            { hymnalSongId: 'demo:1', churchToolsSongId: 42, reason: 'lookup-failed' },
        ]);
        expect(songs.deleteCount).toBe(0);
    });

    it('checks every event id supplied by a complete paginated event query', async () => {
        const checked: number[] = [];
        const agendas = {
            async listSongs(eventId: number) {
                checked.push(eventId);
                return eventId === 3 ? [nativeSong] : [];
            },
        } as never;
        const checker = new ChurchToolsAgendaSongUsageChecker(agendas, [1, 2, 3], {
            complete: true,
            checkedEventIds: [1, 2, 3],
        });

        await expect(checker.isSongUsed(nativeSong.id)).resolves.toBe(true);
        expect(checked).toEqual([1, 2, 3]);
        await expect(checker.getCoverage()).resolves.toMatchObject({ complete: true });
    });

    it('revalidates usage immediately before DELETE', async () => {
        const songs = new FakeSongs();
        const state = new MemoryState();
        const usage = new ToggleUsage();
        const result = await new HymnalUninstaller(songs, state, usage).uninstall('demo', {
            now: () => '2026-09-22T00:00:01.000Z',
        });

        expect(usage.calls).toBe(2);
        expect(songs.deleteCount).toBe(0);
        expect(result.status).toBe('failed');
        expect(result.completed).toBe(0);
        expect(result.failed).toBe(1);
        expect(state.value.mappings['demo:1']).toBeDefined();
    });
});
