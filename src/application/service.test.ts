import { describe, expect, it } from 'vitest';
import { ChurchToolsError } from '../churchtools/errors';
import type { JsonStateStore } from '../churchtools/customModuleStore';
import type { NativeAgenda, NativeEvent } from '../churchtools/types';
import type { EventListQuery } from '../churchtools/events';
import { resourceRegistry } from '../data/registry';
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

describe('LiturgyEditorApplication workflow', () => {
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
});
