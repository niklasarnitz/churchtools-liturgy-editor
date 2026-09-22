import { describe, expect, it } from 'vitest';
import { ChurchToolsError } from '../churchtools/errors';
import type { JsonStateStore } from '../churchtools/customModuleStore';
import type { NativeAgenda, NativeEvent } from '../churchtools/types';
import type { EventListQuery } from '../churchtools/events';
import { resourceRegistry } from '../data/registry';
import type { HymnalUsageChecker } from '../domain/imports/uninstaller';
import { LiturgyEditorApplication } from './service';

class MemoryStore implements JsonStateStore {
    values = new Map<string, unknown>();
    async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
    async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
    async delete(key: string): Promise<void> { this.values.delete(key); }
}

const event = { id: 10, name: 'Sonntag', startDate: '2026-09-27T10:00:00Z', calendar: { id: 4 } } as unknown as NativeEvent;

function dependencies(overrides: Record<string, unknown> = {}) {
    let agenda: NativeAgenda | undefined;
    let nextId = 100;
    const agendas = {
        get: async () => { if (!agenda) throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 }); return agenda; },
        upsert: async (_eventId: number, input: { calendarId: number; eventStartPosition?: number; series?: string | null; items?: NativeAgenda['items'] }) => {
            agenda = { id: 20, calendarId: input.calendarId, eventStartPosition: input.eventStartPosition, series: input.series, items: (input.items ?? []).map((item) => ({ ...item, id: nextId++ })) as NativeAgenda['items'] };
            return agenda;
        },
        createItem: async () => { throw new Error('not needed in initial workflow'); },
        updateItem: async () => { throw new Error('not needed in initial workflow'); },
        deleteItem: async () => undefined,
    };
    const songs = {
        listCategories: async () => [], createCategory: async () => ({ id: 1, name: 'Demo' }), get: async () => ({ id: 1, name: 'Song' }),
        create: async () => ({ id: 1, name: 'Song' }), update: async () => ({ id: 1, name: 'Song' }), delete: async () => undefined,
        listArrangements: async () => [], createArrangement: async () => ({ id: 50, name: 'Standard', isDefault: true }), list: async () => [],
    };
    const permissions = { assertAgendaRead: async () => undefined, assertAgendaWrite: async () => undefined, assertSongRead: async () => undefined, assertSongWrite: async () => undefined };
    return {
        events: { get: async () => event, list: async () => [event] }, agendas, songs, permissions,
        state: new MemoryStore(), resources: resourceRegistry,
        ...overrides,
    } as never;
}

function usageChecker(app: LiturgyEditorApplication): Promise<HymnalUsageChecker> {
    return (app as unknown as { createUsageChecker(): Promise<HymnalUsageChecker> }).createUsageChecker();
}

describe('LiturgyEditorApplication workflow', () => {
    it('stores one installation-wide organization and rejects unknown organizations', async () => {
        const state = new MemoryStore();
        const app = new LiturgyEditorApplication(dependencies({ state }));

        await expect(app.getInstallationSettings()).resolves.toEqual({ version: 1 });
        await expect(app.updateInstallationSettings({ organizationId: 'selk' })).resolves.toEqual({
            version: 1,
            organizationId: 'selk',
        });
        await expect(app.getInstallationSettings()).resolves.toEqual({ version: 1, organizationId: 'selk' });
        await expect(app.updateInstallationSettings({ organizationId: 'unknown' })).rejects.toThrow(
            'Organization "unknown" is not installed.',
        );
    });

    it('queries upcoming services with the ChurchTools forward direction', async () => {
        let receivedQuery: EventListQuery | undefined;
        const app = new LiturgyEditorApplication(dependencies({
            events: {
                get: async () => event,
                list: async (query: EventListQuery) => {
                    receivedQuery = query;
                    return [event];
                },
            },
        }));

        await app.getUpcomingServices({ from: '2026-09-20', limit: 25 });

        expect(receivedQuery?.direction).toBe('forward');
    });

    it('uses a bounded date range without direction because ChurchTools ignores to when direction is present', async () => {
        let receivedQuery: EventListQuery | undefined;
        const app = new LiturgyEditorApplication(dependencies({
            events: {
                get: async () => event,
                list: async (query: EventListQuery) => {
                    receivedQuery = query;
                    return [event];
                },
            },
        }));

        await app.getUpcomingServices({ from: '2026-09-20', to: '2027-01-18', limit: 25 });

        expect(receivedQuery).toEqual({
            from: '2026-09-20',
            to: '2027-01-18',
            canceled: false,
        });
    });

    it('fully paginates past and future events with canceled events and deduplicates event ids', async () => {
        const queries: EventListQuery[] = [];
        const app = new LiturgyEditorApplication(dependencies({
            now: () => '2026-09-22T12:00:00.000Z',
            events: {
                get: async () => event,
                list: async (query: EventListQuery) => {
                    queries.push(query);
                    const page = query.page ?? 1;
                    if (query.direction === 'backward') {
                        return page === 1
                            ? Array.from({ length: 100 }, (_, index) => ({ ...event, id: index + 1 }))
                            : [{ ...event, id: 100 }];
                    }
                    return page === 1
                        ? Array.from({ length: 100 }, (_, index) => ({ ...event, id: index + 100 }))
                        : [{ ...event, id: 199 }];
                },
            },
        }));

        const checker = await usageChecker(app);
        await expect(checker.getCoverage?.()).resolves.toMatchObject({
            complete: true,
            checkedEventIds: Array.from({ length: 199 }, (_, index) => index + 1),
        });
        expect(queries).toEqual([
            { from: '2026-09-22', direction: 'backward', limit: 100, page: 1, canceled: true },
            { from: '2026-09-22', direction: 'backward', limit: 100, page: 2, canceled: true },
            { from: '2026-09-22', direction: 'forward', limit: 100, page: 1, canceled: true },
            { from: '2026-09-22', direction: 'forward', limit: 100, page: 2, canceled: true },
        ]);
    });

    it('fails closed when event pagination repeats or errors', async () => {
        const page = Array.from({ length: 100 }, (_, index) => ({ ...event, id: index + 1 }));
        const repeated = new LiturgyEditorApplication(dependencies({
            events: { get: async () => event, list: async () => page },
        }));
        const repeatedChecker = await usageChecker(repeated);
        await expect(repeatedChecker.getCoverage?.()).resolves.toMatchObject({ complete: false });

        const failed = new LiturgyEditorApplication(dependencies({
            events: {
                get: async () => event,
                list: async (query: EventListQuery) => {
                    if (query.direction === 'backward') return [{ ...event, id: 1 }];
                    throw new Error('network');
                },
            },
        }));
        const failedChecker = await usageChecker(failed);
        await expect(failedChecker.getCoverage?.()).resolves.toMatchObject({ complete: false, checkedEventIds: [1] });
        await expect(failedChecker.isSongUsed(42)).rejects.toThrow('Event-Abdeckung');
    });

    it('fails closed at the event pagination safety cap', async () => {
        const queries: EventListQuery[] = [];
        const app = new LiturgyEditorApplication(dependencies({
            events: {
                get: async () => event,
                list: async (query: EventListQuery) => {
                    queries.push(query);
                    const page = query.page ?? 1;
                    return Array.from({ length: 100 }, (_, index) => ({ ...event, id: (page - 1) * 100 + index + 1 }));
                },
            },
        }));

        const checker = await usageChecker(app);
        await expect(checker.getCoverage?.()).resolves.toMatchObject({ complete: false });
        expect(queries).toHaveLength(100);
        expect(queries.every((query) => query.direction === 'backward' && query.limit === 100)).toBe(true);
    });

    it('creates a native agenda, persists ManagedAgenda, and detects drift', async () => {
        const app = new LiturgyEditorApplication(dependencies());
        const values = {
            openingSong: { kind: 'song' as const, songId: 1, arrangementId: 50, title: 'Morgenlicht' },
            afterSermonSong: { kind: 'song' as const, songId: 2, arrangementId: 51, title: 'Licht' },
            closingSong: { kind: 'song' as const, songId: 3, arrangementId: 52, title: 'Segen' },
            sermon: 'Mt 22,34–46',
        };
        const saved = await app.saveAgenda({ eventId: 10, organizationId: 'ekiba', liturgyId: 'baden-predigtgottesdienst-demo', slots: values });
        expect(saved.agenda.items[0].type).toBe('text');
        expect(saved.agenda.items.some((item) => item.type === 'song' && item.arrangementId === 50)).toBe(true);
        expect((await app.inspectEvent(10)).status).toBe('complete');

        // A native client change is visible and is never silently overwritten.
        saved.agenda.items.push({ id: 999, type: 'text', title: 'Extern hinzugefügt' });
        const inspected = await app.inspectEvent(10);
        expect(inspected.status).toBe('externally-changed');
        const kept = await app.resolveAgendaConflict(10, 'keep');
        expect('status' in kept && kept.status).toBe('complete');
    });

    it('translates missing write permission before an import starts', async () => {
        const deps = dependencies({ permissions: { assertAgendaRead: async () => undefined, assertAgendaWrite: async () => undefined, assertSongRead: async () => undefined, assertSongWrite: async () => { throw new ChurchToolsError('forbidden', { kind: 'forbidden', status: 403 }); } } });
        const app = new LiturgyEditorApplication(deps);
        await expect(app.installHymnal('eg-baden-demo')).rejects.toMatchObject({ kind: 'forbidden' });
    });

    it('uses an external lectionary source and applies manual overrides last', async () => {
        const app = new LiturgyEditorApplication(dependencies({
            lectionary: {
                source: {
                    fetchDay: async () => ({
                        id: 'ekd:2026-11-29',
                        date: '2026-11-29',
                        name: '1. Sonntag im Advent',
                        readings: { gospel: { reference: 'Mt 21,1–11' } },
                        sermonSeries: 'Automatisch',
                    }),
                },
            },
        }));

        await expect(app.suggestLiturgicalDay({
            date: '2026-11-29',
            organizationId: 'ekiba',
            lectionaryId: 'ekd',
            overrides: { sermonSeries: 'Manuell', readings: { gospel: { reference: 'Joh 3,16' } } },
        })).resolves.toMatchObject({
            source: 'external',
            day: { sermonSeries: 'Manuell', readings: { gospel: { reference: 'Joh 3,16' } } },
        });
    });

    it('rejects initial agenda save if native agenda items count does not match generated items', async () => {
        const deps = dependencies({
            agendas: {
                get: async () => { throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 }); },
                upsert: async () => ({ id: 20, calendarId: 1, items: [{ id: 101, type: 'text', title: 'Liturgie-Editor' }] }),
            },
        });
        const app = new LiturgyEditorApplication(deps);
        const values = {
            openingSong: { kind: 'song' as const, songId: 1, arrangementId: 50, title: 'Morgenlicht' },
            closingSong: { kind: 'song' as const, songId: 3, arrangementId: 52, title: 'Segen' },
            sermon: 'Mt 22,34–46',
        };

        await expect(app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: 'baden-predigtgottesdienst-demo',
            slots: values,
        })).rejects.toThrow('erwartet wurden');

        // Managed state must not have been persisted
        const inspected = await app.inspectEvent(10);
        expect(inspected.managedAgenda).toBeUndefined();
    });

    it('rejects initial agenda save if native agenda items are reordered or have mismatched titles/types', async () => {
        let nextId = 100;
        const deps = dependencies({
            agendas: {
                get: async () => { throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 }); },
                upsert: async (_eventId: number, input: { items?: NativeAgenda['items'] }) => {
                    const items = (input.items ?? []).map((item) => ({ ...item, id: nextId++ }));
                    // Swap the first two items to simulate server-side reordering
                    const swapped = [items[1], items[0], ...items.slice(2)];
                    return { id: 20, calendarId: 1, items: swapped as NativeAgenda['items'] };
                },
            },
        });
        const app = new LiturgyEditorApplication(deps);
        const values = {
            openingSong: { kind: 'song' as const, songId: 1, arrangementId: 50, title: 'Morgenlicht' },
            closingSong: { kind: 'song' as const, songId: 3, arrangementId: 52, title: 'Segen' },
            sermon: 'Mt 22,34–46',
        };

        await expect(app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: 'baden-predigtgottesdienst-demo',
            slots: values,
        })).rejects.toThrow('Ablaufpunkt an Position 1 hat');

        const inspected = await app.inspectEvent(10);
        expect(inspected.managedAgenda).toBeUndefined();
    });

    it('rejects initial agenda save if song arrangementId does not match generated item', async () => {
        let nextId = 100;
        const deps = dependencies({
            agendas: {
                get: async () => { throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 }); },
                upsert: async (_eventId: number, input: { items?: NativeAgenda['items'] }) => {
                    const items = (input.items ?? []).map((item) => {
                        if (item.type === 'song') {
                            return { ...item, id: nextId++, arrangementId: 99999 }; // altered arrangement ID
                        }
                        return { ...item, id: nextId++ };
                    });
                    return { id: 20, calendarId: 1, items: items as NativeAgenda['items'] };
                },
            },
        });
        const app = new LiturgyEditorApplication(deps);
        const values = {
            openingSong: { kind: 'song' as const, songId: 1, arrangementId: 50, title: 'Morgenlicht' },
            closingSong: { kind: 'song' as const, songId: 3, arrangementId: 52, title: 'Segen' },
            sermon: 'Mt 22,34–46',
        };

        await expect(app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: 'baden-predigtgottesdienst-demo',
            slots: values,
        })).rejects.toThrow('abweichende Arrangement-ID');

        const inspected = await app.inspectEvent(10);
        expect(inspected.managedAgenda).toBeUndefined();
    });
});
