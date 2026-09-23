import { describe, expect, it } from 'vitest';
import { ChurchToolsError } from '../churchtools/errors';
import type { JsonStateStore } from '../churchtools/customModuleStore';
import type { NativeAgenda, NativeEvent } from '../churchtools/types';
import type { EventListQuery } from '../churchtools/events';
import type { HymnalUsageChecker } from '../domain/imports/uninstaller';
import { testBadenLiturgy, testResourceRegistry } from '../test-fixtures/resources';
import { LiturgyEditorApplication } from './service';
import { agendaFingerprint } from '../domain/reconciliation/fingerprint';
import { instantiateNode, type SavedBlock } from '../domain/liturgies/blocks';

class MemoryStore implements JsonStateStore {
    values = new Map<string, unknown>();
    async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
    async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
    async delete(key: string): Promise<void> { this.values.delete(key); }
}

const event = { id: 10, name: 'Sonntag', startDate: '2026-09-27T10:00:00Z', calendar: { domainIdentifier: '4' } } as unknown as NativeEvent;

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
        listCategories: async () => [], createCategory: async () => ({ id: 1, name: 'Test' }), get: async () => ({ id: 1, name: 'Song' }),
        create: async () => ({ id: 1, name: 'Song' }), update: async () => ({ id: 1, name: 'Song' }), delete: async () => undefined,
        listArrangements: async () => [], createArrangement: async () => ({ id: 50, name: 'Standard', isDefault: true }), list: async () => [],
    };
    const permissions = { assertAgendaRead: async () => undefined, assertAgendaWrite: async () => undefined, assertSongRead: async () => undefined, assertSongWrite: async () => undefined, assertSettingsWrite: async () => undefined };
    return {
        events: { get: async () => event, list: async () => [event] }, agendas, songs, permissions,
        state: new MemoryStore(), resources: testResourceRegistry,
        ...overrides,
    } as never;
}

function usageChecker(app: LiturgyEditorApplication): Promise<HymnalUsageChecker> {
    return (app as unknown as { createUsageChecker(): Promise<HymnalUsageChecker> }).createUsageChecker();
}

describe('LiturgyEditorApplication workflow', () => {
    it('persists independently duplicated blocks in the managed agenda snapshot', async () => {
        const app = new LiturgyEditorApplication(dependencies());
        const source = { id: 'block', type: 'serviceBlock' as const, blockKey: 'festival', label: 'Festteil', nodes: [
            { id: 'song', type: 'songSlot' as const, slot: 'festivalSong', label: 'Festlied', required: true },
        ] };
        let index = 0;
        const nextId = (type: string) => `${type}-${++index}`;
        const first = instantiateNode(source, { festivalSong: { kind: 'song', songId: 1, arrangementId: 2 } }, nextId);
        const second = instantiateNode(source, { festivalSong: { kind: 'song', songId: 3, arrangementId: 4 } }, nextId);
        const saved = await app.saveAgenda({ eventId: 10, organizationId: 'ekiba', liturgyId: testBadenLiturgy.id,
            nodes: [first.node, second.node], slots: { ...first.slots, ...second.slots } });
        expect(Object.keys(saved.managedAgenda.nodeMappings)).toHaveLength(3);
        expect(saved.managedAgenda.editorSnapshot?.nodes).toEqual([first.node, second.node]);
        expect(saved.agenda.items.filter((item) => item.type === 'song').map((item) => item.arrangementId)).toEqual([2, 4]);
    });
    it('stores personal blocks per user and organization and requires agenda write permission', async () => {
        const state = new MemoryStore();
        const saved: SavedBlock = { id: 'personal-1', name: 'Eigener Teil', block: {
            id: 'block-1', type: 'serviceBlock', blockKey: 'own-part', label: 'Eigener Teil',
            nodes: [{ id: 'line-1', type: 'heading', text: 'Beginn' }],
        }, slots: {} };
        const app = new LiturgyEditorApplication(dependencies({ state }));
        await app.savePersonalBlocks(10, 'ekiba', 7, [saved]);
        const reopened = new LiturgyEditorApplication(dependencies({ state }));
        await expect(reopened.getPersonalBlocks('ekiba', 7)).resolves.toEqual([saved]);
        await expect(reopened.getPersonalBlocks('ekiba', 8)).resolves.toEqual([]);
        await expect(reopened.getPersonalBlocks('selk', 7)).resolves.toEqual([]);
        const denied = new LiturgyEditorApplication(dependencies({
            state,
            permissions: { assertAgendaWrite: async () => { throw new ChurchToolsError('forbidden', { kind: 'forbidden', status: 403 }); } },
        }));
        await expect(denied.savePersonalBlocks(10, 'ekiba', 7, [])).rejects.toMatchObject({ kind: 'forbidden' });
        await expect(reopened.getPersonalBlocks('ekiba', 7)).resolves.toEqual([saved]);
    });
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

    it('requires settings write permission before changing the installation organization', async () => {
        const state = new MemoryStore();
        const app = new LiturgyEditorApplication(dependencies({
            state,
            permissions: { assertSettingsWrite: async () => { throw new ChurchToolsError('forbidden', { kind: 'forbidden', status: 403 }); } },
        }));
        await expect(app.updateInstallationSettings({ organizationId: 'ekiba' })).rejects.toMatchObject({ kind: 'forbidden' });
        await expect(app.getInstallationSettings()).resolves.toEqual({ version: 1 });
    });

    it('loads upcoming services in pages of ten by default', async () => {
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

        await app.getUpcomingEvents({ from: '2026-09-20' });

        expect(receivedQuery).toEqual({
            from: '2026-09-20',
            direction: 'forward',
            limit: 10,
            page: 1,
            canceled: false,
        });
    });

    it('requests later upcoming-service pages from the same start date', async () => {
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

        await app.getUpcomingEvents({ from: '2026-09-20', page: 3 });

        expect(receivedQuery).toEqual({
            from: '2026-09-20',
            direction: 'forward',
            limit: 10,
            page: 3,
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
        const saved = await app.saveAgenda({ eventId: 10, organizationId: 'ekiba', liturgyId: testBadenLiturgy.id, slots: values });
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

    it('uses the node order arranged in the visual editor', async () => {
        const app = new LiturgyEditorApplication(dependencies());

        const saved = await app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: testBadenLiturgy.id,
            nodes: [
                { id: 'closing', type: 'heading', text: 'Sendung und Segen' },
                { id: 'opening', type: 'heading', text: 'Eröffnung' },
            ],
        });

        expect(saved.agenda.items.map((item) => item.title)).toEqual([
            'Liturgie-Editor',
            'Sendung und Segen',
            'Eröffnung',
        ]);
        expect(saved.managedAgenda.editorSnapshot?.nodes.map((node) => node.id)).toEqual(['closing', 'opening']);
        expect((await app.repositories.managed.get(10))?.editorSnapshot?.nodes.map((node) => node.id)).toEqual(['closing', 'opening']);
    });

    it('keeps an existing native agenda until its replacement is explicitly forced', async () => {
        const existing: NativeAgenda = {
            id: 20,
            calendarId: 4,
            items: [{ id: 77, type: 'text', title: 'Bestehender Ablauf' }],
        };
        let upserted = false;
        const app = new LiturgyEditorApplication(dependencies({
            agendas: {
                get: async () => existing,
                upsert: async (_eventId: number, input: { items: NativeAgenda['items'] }) => {
                    upserted = true;
                    existing.items = input.items.map((item, index) => ({ ...item, id: index + 100 }));
                    return existing;
                },
            },
        }));
        const input = {
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: testBadenLiturgy.id,
            nodes: [{ id: 'opening', type: 'heading' as const, text: 'Eröffnung' }],
            variantKey: 'service',
            selectedDate: '2026-09-27',
        };
        await expect(app.saveAgenda(input)).rejects.toThrow('außerhalb');
        expect(upserted).toBe(false);
        expect(existing.items[0]?.title).toBe('Bestehender Ablauf');

        const reviewedFingerprint = agendaFingerprint(existing);
        existing.items[0]!.title = 'Nochmals geändert';
        await expect(app.saveAgenda({ ...input, force: true, expectedNativeFingerprint: reviewedFingerprint })).rejects.toThrow('außerhalb');
        expect(upserted).toBe(false);

        const saved = await app.saveAgenda({ ...input, force: true });
        expect(upserted).toBe(true);
        expect(saved.managedAgenda.editorSnapshot).toMatchObject({
            nodes: input.nodes,
            variantKey: 'service',
            selectedDate: '2026-09-27',
        });
    });

    it('recreates a deleted managed agenda only after confirmed reapply', async () => {
        let agenda: NativeAgenda | undefined;
        let writes = 0;
        const app = new LiturgyEditorApplication(dependencies({
            agendas: {
                get: async () => {
                    if (!agenda) throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 });
                    return agenda;
                },
                upsert: async (_eventId: number, input: { calendarId: number; items: NativeAgenda['items'] }) => {
                    writes += 1;
                    agenda = { id: writes + 20, calendarId: input.calendarId, items: input.items.map((item, index) => ({ ...item, id: writes * 100 + index })) };
                    return agenda;
                },
            },
        }));
        const input = { eventId: 10, organizationId: 'ekiba', liturgyId: testBadenLiturgy.id, nodes: [{ id: 'opening', type: 'heading' as const, text: 'Eröffnung' }] };
        await app.saveAgenda(input);
        agenda = undefined;
        await expect(app.saveAgenda(input)).rejects.toThrow();
        expect(writes).toBe(1);
        const restored = await app.saveAgenda({ ...input, force: true });
        expect(writes).toBe(2);
        expect(restored.managedAgenda.agendaId).toBe(22);
    });

    it('rejects a forced managed update when the native agenda changed after review', async () => {
        let agenda: NativeAgenda | undefined;
        const app = new LiturgyEditorApplication(dependencies({
            agendas: {
                get: async () => { if (!agenda) throw new ChurchToolsError('missing', { kind: 'not-found', status: 404 }); return agenda; },
                upsert: async (_eventId: number, input: { calendarId: number; items: NativeAgenda['items'] }) => {
                    agenda = { id: 20, calendarId: input.calendarId, items: input.items.map((item, index) => ({ ...item, id: index + 100 })) };
                    return agenda;
                },
                updateItem: async () => { throw new Error('should not write after stale review'); },
            },
        }));
        const input = { eventId: 10, organizationId: 'ekiba', liturgyId: testBadenLiturgy.id, nodes: [{ id: 'opening', type: 'heading' as const, text: 'Eröffnung' }] };
        await app.saveAgenda(input);
        const reviewedFingerprint = agendaFingerprint(agenda!);
        agenda!.items[0]!.title = 'Neue Änderung';
        await expect(app.saveAgenda({ ...input, force: true, expectedNativeFingerprint: reviewedFingerprint })).rejects.toThrow('außerhalb');
    });

    it('writes song comments, structured sermon data, and service placeholders to native agenda fields', async () => {
        const customResources = structuredClone(testResourceRegistry);
        customResources.liturgies = [{
            id: 'storage-mapping-test',
            version: 1,
            organizationId: 'ekiba',
            name: 'Storage mapping test',
            tags: [],
            language: 'de',
            nodes: [
                { id: 'song', type: 'songSlot', slot: 'openingSong', required: true, label: 'Eingangslied', responsible: '[Musik]' },
                { id: 'sermon', type: 'sermonSlot', required: true, label: 'Predigt', responsible: '[Predigt]' },
            ],
        }];
        const app = new LiturgyEditorApplication(dependencies({ resources: customResources }));

        const saved = await app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: 'storage-mapping-test',
            slots: {
                openingSong: { kind: 'song', songId: 1, arrangementId: 50, title: 'Jesus nimmt die Sünder an', comment: 'Strophen 1, 3 und 4' },
                sermon: { kind: 'sermon', title: 'Schuld erlassen!', text: 'Micha 7,18–20' },
            },
        });

        expect(saved.agenda.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'song', title: 'Eingangslied', note: 'Strophen 1, 3 und 4', responsible: '[Musik]' }),
            expect.objectContaining({ type: 'text', title: 'Schuld erlassen!', note: 'Micha 7,18–20', responsible: '[Predigt]' }),
        ]));
    });

    it('creates an agenda using the calendar domain identifier from the event API', async () => {
        const calendarIds: Array<number | undefined> = [];
        const apiEvent = {
            id: 10,
            name: 'Sonntag',
            startDate: '2026-09-27T10:00:00Z',
            calendar: { domainIdentifier: '4', title: 'Gottesdienste' },
        } as unknown as NativeEvent;
        const app = new LiturgyEditorApplication(dependencies({
            events: { get: async () => apiEvent, list: async () => [apiEvent] },
            permissions: {
                assertAgendaRead: async () => undefined,
                assertAgendaWrite: async (calendarId?: number) => { calendarIds.push(calendarId); },
                assertSongRead: async () => undefined,
                assertSongWrite: async () => undefined,
            },
        }));

        const saved = await app.saveAgenda({
            eventId: 10,
            organizationId: 'ekiba',
            liturgyId: testBadenLiturgy.id,
            slots: {
                openingSong: { kind: 'song', songId: 1, arrangementId: 50, title: 'Morgenlicht' },
                closingSong: { kind: 'song', songId: 3, arrangementId: 52, title: 'Segen' },
                sermon: 'Mt 22,34–46',
            },
        });

        expect(calendarIds).toEqual([4]);
        expect(saved.agenda.calendarId).toBe(4);
    });

    it('translates missing write permission before an import starts', async () => {
        const deps = dependencies({ permissions: { assertAgendaRead: async () => undefined, assertAgendaWrite: async () => undefined, assertSongRead: async () => undefined, assertSongWrite: async () => { throw new ChurchToolsError('forbidden', { kind: 'forbidden', status: 403 }); } } });
        const app = new LiturgyEditorApplication(deps);
        await expect(app.installHymnal('eg-baden')).rejects.toMatchObject({ kind: 'forbidden' });
    });

    it('creates a named native song arrangement after checking song write permission', async () => {
        const calls: Array<{ songId: number; name: string }> = [];
        const app = new LiturgyEditorApplication(dependencies({
            songs: { createArrangement: async (songId: number, input: { name: string }) => {
                calls.push({ songId, name: input.name });
                return { id: 81, name: input.name };
            } },
        }));
        await expect(app.createSongArrangement(42, { name: ' Strophen 1, 3 ' })).resolves.toMatchObject({ id: 81, name: 'Strophen 1, 3' });
        expect(calls).toEqual([{ songId: 42, name: 'Strophen 1, 3' }]);
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

    it('does not fall back to bundled lectionary data', async () => {
        const app = new LiturgyEditorApplication(dependencies());

        await expect(app.suggestLiturgicalDay({
            date: '2026-09-20',
            organizationId: 'ekiba',
            liturgyId: testBadenLiturgy.id,
        })).resolves.toEqual({ day: undefined, source: 'none', overrides: {} });
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
            liturgyId: testBadenLiturgy.id,
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
            liturgyId: testBadenLiturgy.id,
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
            liturgyId: testBadenLiturgy.id,
            slots: values,
        })).rejects.toThrow('abweichende Arrangement-ID');

        const inspected = await app.inspectEvent(10);
        expect(inspected.managedAgenda).toBeUndefined();
    });
});
