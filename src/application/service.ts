import type { JsonStateStore } from '../churchtools/customModuleStore';
import { toChurchToolsError } from '../churchtools/errors';
import type { NativeAgenda, NativeAgendaItemInput, NativeEvent, NativeSong } from '../churchtools/types';
import { ChurchToolsAgendaSongUsageChecker } from '../churchtools/agendas';
import { HymnalImporter } from '../domain/imports/importer';
import { JsonHymnalImportStateRepository } from '../domain/imports/state-store';
import { HymnalUninstaller, type HymnalUsageChecker, type UninstallProgress } from '../domain/imports/uninstaller';
import type { HymnalImportState, ImportProgress } from '../domain/imports/types';
import { generateNormalizedAgenda } from '../domain/agenda-generation/renderer';
import { parseSavedBlocks, type SavedBlock } from '../domain/liturgies/blocks';
import { ManagedAgendaStateStore } from '../domain/managed-agendas/state';
import { ManagedAgendaConflictError, ManagedAgendaSynchronizer } from '../domain/managed-agendas/sync';
import type { GeneratedAgendaItem, ManagedAgenda } from '../domain/managed-agendas/types';
import { agendaFingerprint, reconcileManagedAgenda } from '../domain/reconciliation/fingerprint';
import { toIsoDate } from '../domain/lectionary/resolver';
import type { LiturgicalDayOverrides } from '../domain/lectionary/resolver';
import type { HymnalDefinition } from '../data/hymnals/types';
import type { LiturgicalDay } from '../data/lectionaries/types';
import type { LiturgyDefinition } from '../data/liturgies/types';
import { resourceRegistry, type ResourceRegistry } from '../data/registry';
import { ShardedJsonStateStore } from './state';
import type {
    AgendaConflictDecision,
    ApplicationDependencies,
    BootstrapState,
    HymnalOperationResult,
    HymnalUninstallResult,
    InstallationSettings,
    LectionarySourceOptions,
    LiturgicalSuggestion,
    SaveAgendaInput,
    SaveAgendaResult,
    SongSearchResult,
    UpcomingService,
} from './types';

const MANAGEMENT_NODE_ID = '__liturgy-editor-management-hint';
const MANAGEMENT_HINT = 'Dieser Ablauf wird über den Liturgie-Editor verwaltet. Änderungen sollten möglichst dort vorgenommen werden.';
// The ChurchTools event endpoint documents a generic limit parameter. The
// official client uses 100 for getAllPages; keep that bounded value here
// instead of relying on an undocumented larger limit.
const USAGE_EVENT_PAGE_LIMIT = 100;
const USAGE_EVENT_PAGE_CAP = 100;
const USAGE_EVENT_COVERAGE_FAILURE = 'Die Event-Abdeckung der Nutzungsprüfung konnte nicht vollständig geladen werden.';
const INSTALLATION_SETTINGS_KEY = 'settings:installation';
const personalBlocksKey = (organizationId: string, userId: number) => `blocks:${organizationId}:${userId}`;

function calendarIdOf(event: NativeEvent): number {
    const calendarId = Number(event.calendar.domainIdentifier);
    if (!Number.isSafeInteger(calendarId) || calendarId <= 0) {
        throw new Error(`Der ChurchTools-Kalender hat keine gültige numerische ID: "${event.calendar.domainIdentifier}".`);
    }
    return calendarId;
}

/** Application-facing orchestration. UI code talks to this class, never to REST adapters directly. */
export class LiturgyEditorApplication {
    readonly repositories: {
        imports: JsonHymnalImportStateRepository;
        managed: ManagedAgendaStateStore;
    };

    private readonly deps: ApplicationDependencies;
    private readonly resources: ResourceRegistry;
    private readonly state: JsonStateStore;
    private readonly synchronizer: ManagedAgendaSynchronizer;
    private readonly now: () => string;
    private searchImportStates?: Promise<HymnalImportState[]>;
    private searchImportStatesLoadedAt = 0;

    constructor(deps: ApplicationDependencies) {
        this.deps = deps;
        this.resources = deps.resources ?? resourceRegistry;
        // All application state goes through this boundary. Import mappings and
        // managed agendas can therefore grow beyond one custom-data value.
        this.state = new ShardedJsonStateStore(deps.state, 'liturgy-editor');
        this.repositories = {
            imports: new JsonHymnalImportStateRepository(this.state),
            managed: new ManagedAgendaStateStore(this.state),
        };
        this.synchronizer = new ManagedAgendaSynchronizer(deps.agendas);
        this.now = deps.now ?? (() => new Date().toISOString());
    }

    async bootstrap(options: { from?: string; limit?: number; page?: number } = {}): Promise<BootstrapState> {
        try {
            const upcoming = await this.getUpcomingServices(options);
            return { status: 'ready', resources: this.resources, upcoming, installedHymnals: await this.loadImportStates() };
        } catch (error) {
            const normalized = toChurchToolsError(error);
            return { status: 'error', resources: this.resources, upcoming: [], installedHymnals: [], error: normalized.message };
        }
    }

    async getInstallationSettings(): Promise<InstallationSettings> {
        return await this.state.get<InstallationSettings>(INSTALLATION_SETTINGS_KEY) ?? { version: 1 };
    }

    async updateInstallationSettings(input: { organizationId?: string }): Promise<InstallationSettings> {
        await this.deps.permissions.assertSettingsWrite();
        if (input.organizationId && !this.resources.organizations.some((candidate) => candidate.id === input.organizationId)) {
            throw new Error(`Organization "${input.organizationId}" is not installed.`);
        }
        const settings: InstallationSettings = { version: 1, organizationId: input.organizationId };
        await this.state.set(INSTALLATION_SETTINGS_KEY, settings);
        return settings;
    }

    async getPersonalBlocks(organizationId: string, userId: number): Promise<SavedBlock[]> {
        if (!this.resources.organizations.some((item) => item.id === organizationId) || !Number.isSafeInteger(userId) || userId <= 0) {
            throw new Error('Bausteinbibliothek benötigt einen gültigen Kirchenkörper und Nutzer.');
        }
        const stored = await this.state.get<unknown>(personalBlocksKey(organizationId, userId));
        if (stored === undefined) return [];
        const parsed = parseSavedBlocks(JSON.stringify(stored));
        if (!Array.isArray(stored) || parsed.length !== stored.length) throw new Error('Die gespeicherte Bausteinbibliothek ist beschädigt.');
        return parsed;
    }

    async savePersonalBlocks(eventId: number, organizationId: string, userId: number, blocks: SavedBlock[]): Promise<void> {
        const event = await this.deps.events.get(eventId);
        await this.deps.permissions.assertAgendaWrite(calendarIdOf(event));
        if (!this.resources.organizations.some((item) => item.id === organizationId) || !Number.isSafeInteger(userId) || userId <= 0) {
            throw new Error('Bausteinbibliothek benötigt einen gültigen Kirchenkörper und Nutzer.');
        }
        if (parseSavedBlocks(JSON.stringify(blocks)).length !== blocks.length) throw new Error('Ungültiger Baustein in der Bibliothek.');
        await this.state.set(personalBlocksKey(organizationId, userId), blocks);
    }

    async getUpcomingEvents(options: { from?: string; limit?: number; page?: number } = {}): Promise<NativeEvent[]> {
        const from = options.from ?? this.now().slice(0, 10);
        return this.deps.events.list({
            from,
            direction: 'forward',
            limit: options.limit ?? 10,
            page: options.page ?? 1,
            canceled: false,
        });
    }

    async getUpcomingServices(options: { from?: string; limit?: number; page?: number } = {}): Promise<UpcomingService[]> {
        const events = await this.getUpcomingEvents(options);
        const services: UpcomingService[] = [];
        for (const event of events) services.push(await this.inspectEvent(event));
        return services;
    }

    async inspectEvent(eventOrId: NativeEvent | number): Promise<UpcomingService> {
        const event = typeof eventOrId === 'number' ? await this.deps.events.get(eventOrId) : eventOrId;
        const eventId = event.id;
        if (eventId === undefined) throw new Error('ChurchTools event has no id.');
        let agenda: NativeAgenda | undefined;
        try {
            await this.deps.permissions.assertAgendaRead(calendarIdOf(event));
            agenda = await this.deps.agendas.get(eventId);
        } catch (error) {
            if (toChurchToolsError(error).kind !== 'not-found') return { event, status: 'unavailable' };
        }
        const managedAgenda = await this.repositories.managed.get(eventId);
        if (!agenda) {
            if (managedAgenda) {
                const reconciliation = reconcileManagedAgenda(undefined, managedAgenda);
                return { event, managedAgenda, status: 'externally-changed', reconciliation };
            }
            return { event, status: 'no-agenda' };
        }
        if (!managedAgenda) return { event, agenda, status: 'managed' };
        const reconciliation = reconcileManagedAgenda(agenda, managedAgenda);
        return {
            event,
            agenda,
            managedAgenda,
            reconciliation,
            status: reconciliation.status === 'unchanged' ? 'complete' : 'externally-changed',
        };
    }

    async installHymnal(hymnalId: string, options: { categoryId?: number; categoryName?: string; concurrency?: number; onProgress?: (progress: ImportProgress) => void | Promise<void> } = {}): Promise<HymnalOperationResult> {
        await this.deps.permissions.assertSongWrite();
        this.searchImportStates = undefined;
        const hymnal = this.requireHymnal(hymnalId);
        const progress: ImportProgress[] = [];
        const importer = new HymnalImporter(this.deps.songs, this.repositories.imports);
        try {
            const state = await importer.import(hymnal, {
                ...this.deps.importOptions,
                ...options,
                categoryName: options.categoryName ?? hymnal.shortName,
                now: this.now,
                onProgress: async (entry) => { progress.push(entry); await options.onProgress?.(entry); },
            });
            return { state, progress };
        } finally {
            this.searchImportStates = undefined;
        }
    }

    updateHymnal(hymnalId: string, options: Parameters<LiturgyEditorApplication['installHymnal']>[1] = {}): Promise<HymnalOperationResult> {
        return this.installHymnal(hymnalId, options);
    }

    retryHymnal(hymnalId: string, options: Parameters<LiturgyEditorApplication['installHymnal']>[1] = {}): Promise<HymnalOperationResult> {
        return this.installHymnal(hymnalId, options);
    }

    async uninstallHymnalDryRun(hymnalId: string): Promise<HymnalUninstallResult> {
        await this.deps.permissions.assertSongWrite();
        const usageChecker = await this.createUsageChecker();
        const uninstaller = new HymnalUninstaller(this.deps.songs, this.repositories.imports, usageChecker);
        const states = await this.loadImportStates();
        return { plan: await uninstaller.dryRun(hymnalId, states.filter((state) => state.hymnalId !== hymnalId)) };
    }

    async uninstallHymnal(
        hymnalId: string,
        options: { confirmed: boolean; onProgress?: (progress: UninstallProgress) => void | Promise<void> },
    ): Promise<HymnalUninstallResult> {
        if (!options.confirmed) throw new Error('Deinstallation muss ausdrücklich bestätigt werden.');
        await this.deps.permissions.assertSongWrite();
        const usageChecker = await this.createUsageChecker();
        const uninstaller = new HymnalUninstaller(this.deps.songs, this.repositories.imports, usageChecker);
        const states = await this.loadImportStates();
        const plan = await uninstaller.dryRun(hymnalId, states.filter((state) => state.hymnalId !== hymnalId));
        try {
            const state = await uninstaller.uninstall(hymnalId, {
                otherStates: states.filter((entry) => entry.hymnalId !== hymnalId),
                now: this.now,
                plan,
                onProgress: options.onProgress,
            });
            return { plan, state };
        } finally {
            this.searchImportStates = undefined;
        }
    }

    async suggestLiturgicalDay(input: { date: string | Date; organizationId: string; liturgyId?: string; lectionaryId?: string; overrides?: LiturgicalDayOverrides }): Promise<LiturgicalSuggestion> {
        const organization = this.resources.organizations.find((candidate) => candidate.id === input.organizationId);
        if (!organization) throw new Error(`Organization "${input.organizationId}" is not installed.`);
        const liturgy = input.liturgyId ? this.requireLiturgy(input.liturgyId) : undefined;
        const date = toIsoDate(input.date);
        const external = await this.fetchExternalLiturgicalDay(date, organization.id, input.lectionaryId ?? liturgy?.lectionaryId);
        return { day: applyLiturgicalDayOverrides(external, input.overrides), source: external ? 'external' : 'none', overrides: input.overrides ?? {} };
    }

    async searchSongs(query: string, options: { limit?: number } = {}): Promise<SongSearchResult[]> {
        await this.deps.permissions.assertSongRead();
        const limit = options.limit ?? 50;
        const normalized = query.trim().toLocaleLowerCase();
        const native = await this.deps.songs.list({ query: query.trim() || undefined, include: ['arrangements'], limit });
        const byId = new Map<number, NativeSong>();
        for (const song of native) byId.set(song.id, song);
        // Import mappings add hymn numbers to native results. Only a nonempty
        // search may request further IDs, and only up to the remaining limit.
        const imported = await this.getSearchImportStates();
        const staticMatches = new Map<number, { hymnalId: string; hymnalName: string; number: string }>();
        for (const state of imported) {
            const hymnal = this.resources.hymnals.find((candidate) => candidate.id === state.hymnalId);
            if (!hymnal) continue;
            for (const source of hymnal.songs) {
                const numberNeedle = `${hymnal.shortName} ${source.number}`.toLocaleLowerCase();
                const queryTokens = normalized.split(/\s+/).filter(Boolean);
                if (!normalized || source.title.toLocaleLowerCase().includes(normalized) || queryTokens.every((token) => numberNeedle.includes(token)) || source.number.toLocaleLowerCase() === normalized) {
                    const mapping = state.mappings[source.id];
                    if (mapping) staticMatches.set(mapping.churchToolsSongId, { hymnalId: hymnal.id, hymnalName: hymnal.name, number: source.number });
                }
            }
        }
        const missingIds = normalized
            ? [...staticMatches.keys()].filter((songId) => !byId.has(songId)).slice(0, Math.max(0, limit - byId.size))
            : [];
        for (let offset = 0; offset < missingIds.length; offset += 200) {
            const songs = await this.deps.songs.list({
                ids: missingIds.slice(offset, offset + 200),
                include: ['arrangements'],
                limit: 200,
            });
            for (const song of songs) byId.set(song.id, song);
        }
        return [...byId.values()].slice(0, limit).map((song) => {
            const match = staticMatches.get(song.id);
            const arrangement = song.arrangements?.find((candidate) => candidate.isDefault) ?? song.arrangements?.[0];
            return { song, ...match, defaultArrangementId: arrangement?.id };
        });
    }

    async createSongArrangement(songId: number, input: { name: string; description?: string | null }) {
        await this.deps.permissions.assertSongWrite();
        if (!Number.isSafeInteger(songId) || songId <= 0 || !input.name.trim()) throw new Error('Bitte ein Lied und einen Namen für das Arrangement angeben.');
        return this.deps.songs.createArrangement(songId, { name: input.name.trim(), description: input.description?.trim() || null });
    }

    async saveAgenda(input: SaveAgendaInput): Promise<SaveAgendaResult> {
        const event = await this.deps.events.get(input.eventId);
        const calendarId = calendarIdOf(event);
        await this.deps.permissions.assertAgendaWrite(calendarId);
        const registeredLiturgy = this.requireLiturgy(input.liturgyId);
        if (registeredLiturgy.organizationId !== input.organizationId) throw new Error(`Liturgie "${input.liturgyId}" gehört nicht zur Organisation "${input.organizationId}".`);
        const liturgy = input.nodes ? { ...registeredLiturgy, nodes: input.nodes } : registeredLiturgy;
        const generated = generateNormalizedAgenda({ template: liturgy, slots: input.slots, optionalSections: input.optionalSections, liturgicalDay: input.liturgicalDay, series: input.series });
        const generatedItems: GeneratedAgendaItem[] = [
            { nodeId: MANAGEMENT_NODE_ID, item: { type: 'text', title: 'Liturgie-Editor', note: MANAGEMENT_HINT } },
            ...generated.items.map((item) => ({ nodeId: item.nodeId, item: normalizedToNative(item) })),
        ];
        const existingManaged = await this.repositories.managed.get(input.eventId);
        if (!existingManaged) {
            let existing: NativeAgenda | undefined;
            try { existing = await this.deps.agendas.get(input.eventId); } catch (error) { if (toChurchToolsError(error).kind !== 'not-found') throw error; }
            if (existing && (!input.force || (input.expectedNativeFingerprint !== undefined && agendaFingerprint(existing) !== input.expectedNativeFingerprint))) throw new ManagedAgendaConflictError({ status: 'externally-changed', currentFingerprint: agendaFingerprint(existing), reasons: [{ kind: 'agenda-changed' }] });
            if (!existing && input.force && input.expectedNativeFingerprint !== undefined && input.expectedNativeFingerprint !== null) throw new ManagedAgendaConflictError({ status: 'missing-agenda', reasons: [] });
            const agenda = await this.deps.agendas.upsert(input.eventId, {
                calendarId,
                eventStartPosition: generated.eventStartPosition,
                series: generated.series ?? input.series ?? null,
                items: generatedItems.map((entry) => entry.item),
            });
            const refreshed = agenda.items.length ? agenda : await this.deps.agendas.get(input.eventId);
            const managedAgenda = this.createManagedState(input, refreshed, generatedItems);
            await this.repositories.managed.save(managedAgenda);
            return { managedAgenda, agenda: refreshed, generatedItemCount: generatedItems.length };
        }
        let managedAgenda: ManagedAgenda;
        try {
            managedAgenda = await this.synchronizer.apply(input.eventId, existingManaged, generatedItems, { force: input.force, expectedNativeFingerprint: input.expectedNativeFingerprint, now: this.now });
        } catch (error) {
            // An explicitly confirmed reapply may recreate an agenda that was
            // deleted in ChurchTools. A new native agenda appearing meanwhile
            // still reaches the normal unmanaged conflict guard.
            if (!input.force || toChurchToolsError(error).kind !== 'not-found') throw error;
            await this.repositories.managed.delete(input.eventId);
            return this.saveAgenda({ ...input, force: false });
        }
        managedAgenda.templateId = input.liturgyId;
        managedAgenda.templateVersion = registeredLiturgy.version;
        managedAgenda.editorSnapshot = this.createEditorSnapshot(input);
        await this.repositories.managed.save(managedAgenda);
        const agenda = await this.deps.agendas.get(input.eventId);
        return { managedAgenda, agenda, generatedItemCount: generatedItems.length };
    }

    async resolveAgendaConflict(eventId: number, decision: AgendaConflictDecision, input?: Omit<SaveAgendaInput, 'eventId'>): Promise<UpcomingService | SaveAgendaResult> {
        const inspected = await this.inspectEvent(eventId);
        if (inspected.status !== 'externally-changed' || !inspected.managedAgenda || !inspected.reconciliation) return inspected;
        if (decision === 'keep') {
            if (!inspected.agenda) return inspected;
            const managedIds = new Set(Object.values(inspected.managedAgenda.nodeMappings).flatMap((mapping) => mapping.agendaItemIds));
            const acceptedExternalItemIds = inspected.agenda.items.filter((item) => !managedIds.has(item.id)).map((item) => item.id);
            const accepted = { ...inspected.managedAgenda, acceptedExternalItemIds, lastAppliedFingerprint: agendaFingerprint(inspected.agenda), updatedAt: this.now() };
            await this.repositories.managed.save(accepted);
            return { ...inspected, managedAgenda: accepted, status: 'complete', reconciliation: reconcileManagedAgenda(inspected.agenda, accepted) };
        }
        if (!input) throw new Error('Für "Liturgie neu anwenden" werden die Editorwerte benötigt.');
        if (!inspected.agenda) {
            // A deleted native agenda cannot be updated through the native
            // item API. Remove only the extension metadata, then recreate it
            // through the normal initial-create path.
            await this.repositories.managed.delete(eventId);
        }
        return this.saveAgenda({ ...input, eventId, force: true });
    }

    private createManagedState(input: SaveAgendaInput, agenda: NativeAgenda, generated: readonly GeneratedAgendaItem[]): ManagedAgenda {
        if (agenda.items.length !== generated.length) {
            throw new Error(`Die vom ChurchTools-Server zurückgegebene Agenda weicht von den generierten Elementen ab: erwartet wurden ${generated.length} Elemente, erhalten wurden ${agenda.items.length}. Der Ablauf wurde nicht als verwaltet markiert.`);
        }
        const nodeMappings: ManagedAgenda['nodeMappings'] = {};
        for (let index = 0; index < generated.length; index += 1) {
            const item = agenda.items[index];
            const entry = generated[index];
            if (!item) {
                throw new Error(`Ablaufpunkt an Position ${index + 1} (${entry.item.title}) fehlt in der ChurchTools-Antwort.`);
            }
            if (item.type !== entry.item.type) {
                throw new Error(`Ablaufpunkt an Position ${index + 1} hat unerwarteten Typ: erwartet "${entry.item.type}", erhalten "${item.type}".`);
            }
            if (item.title !== entry.item.title) {
                throw new Error(`Ablaufpunkt an Position ${index + 1} hat abweichenden Titel: erwartet "${entry.item.title}", erhalten "${item.title}".`);
            }
            if (entry.item.type === 'song') {
                if (entry.item.arrangementId !== undefined && item.arrangementId !== entry.item.arrangementId) {
                    throw new Error(`Lied an Position ${index + 1} ("${item.title}") hat abweichende Arrangement-ID: erwartet ${entry.item.arrangementId}, erhalten ${item.arrangementId}.`);
                }
            }
            nodeMappings[entry.nodeId] = { agendaItemIds: [item.id] };
        }
        return { eventId: input.eventId, agendaId: agenda.id, templateId: input.liturgyId, templateVersion: this.requireLiturgy(input.liturgyId).version, nodeMappings, lastAppliedFingerprint: agendaFingerprint(agenda), updatedAt: this.now(), editorSnapshot: this.createEditorSnapshot(input) };
    }

    private createEditorSnapshot(input: SaveAgendaInput): ManagedAgenda['editorSnapshot'] {
        // Editor values can arrive as Vue reactive proxies; JSON is also the
        // representation persisted by the ChurchTools custom-module store.
        const persistable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
        return {
            nodes: persistable(input.nodes ?? this.requireLiturgy(input.liturgyId).nodes),
            slots: persistable(input.slots ?? {}),
            series: input.series,
            variantKey: input.variantKey,
            selectedDate: input.selectedDate,
            liturgicalDay: input.liturgicalDay ? persistable(input.liturgicalDay) : undefined,
        };
    }

    private requireHymnal(id: string): HymnalDefinition { const hymnal = this.resources.hymnals.find((candidate) => candidate.id === id); if (!hymnal) throw new Error(`Hymnal "${id}" is not installed in this extension.`); return hymnal; }
    private requireLiturgy(id: string): LiturgyDefinition { const liturgy = this.resources.liturgies.find((candidate) => candidate.id === id); if (!liturgy) throw new Error(`Liturgy "${id}" is not installed.`); return liturgy; }

    private async loadImportStates(): Promise<HymnalImportState[]> {
        const states: HymnalImportState[] = [];
        for (const hymnal of this.resources.hymnals) { const state = await this.repositories.imports.load(hymnal.id); if (state) states.push(state); }
        return states;
    }

    private getSearchImportStates(): Promise<HymnalImportState[]> {
        if (Date.now() - this.searchImportStatesLoadedAt >= 60_000) this.searchImportStates = undefined;
        if (!this.searchImportStates) {
            this.searchImportStatesLoadedAt = Date.now();
            this.searchImportStates = this.loadImportStates().catch((error) => {
                this.searchImportStates = undefined;
                throw error;
            });
        }
        return this.searchImportStates;
    }

    private async createUsageChecker(): Promise<HymnalUsageChecker> {
        const eventIds = new Set<number>();
        let complete = true;
        let reason: string | undefined;
        try {
            const from = this.now().slice(0, 10);
            for (const direction of ['backward', 'forward'] as const) {
                const pages = new Set<string>();
                for (let page = 1; page <= USAGE_EVENT_PAGE_CAP; page += 1) {
                    const events = await this.deps.events.list({
                        from,
                        direction,
                        limit: USAGE_EVENT_PAGE_LIMIT,
                        page,
                        canceled: true,
                    });
                    if (!Array.isArray(events) || events.length > USAGE_EVENT_PAGE_LIMIT) {
                        throw new Error('ChurchTools returned an invalid event page.');
                    }
                    const pageIds = events.map((event) => event.id);
                    if (pageIds.some((eventId) => !Number.isInteger(eventId))) {
                        throw new Error('ChurchTools returned an event without a usable id.');
                    }
                    const pageSignature = [...new Set(pageIds)].sort((left, right) => left - right).join(',');
                    if (pages.has(pageSignature)) {
                        throw new Error('ChurchTools returned a repeated event page.');
                    }
                    pages.add(pageSignature);
                    for (const eventId of pageIds) eventIds.add(eventId);
                    if (events.length < USAGE_EVENT_PAGE_LIMIT) break;
                    if (page === USAGE_EVENT_PAGE_CAP) {
                        throw new Error('ChurchTools event pagination exceeded the safety cap.');
                    }
                }
            }
        } catch {
            complete = false;
            reason = USAGE_EVENT_COVERAGE_FAILURE;
        }
        const checkedEventIds = [...eventIds];
        return new ChurchToolsAgendaSongUsageChecker(this.deps.agendas, checkedEventIds, {
            complete,
            checkedEventIds,
            reason,
        });
    }

    private async fetchExternalLiturgicalDay(date: string, organizationId: string, lectionaryId?: string): Promise<LiturgicalDay | undefined> {
        const options: LectionarySourceOptions | undefined = this.deps.lectionary;
        if (options?.source) return options.source.fetchDay({ date, organizationId, lectionaryId });
        if (!options?.url || !options.client) return undefined;
        const response = await options.client.get<LiturgicalDay | { data?: LiturgicalDay }>(options.url, { date, organizationId, lectionaryId });
        if (typeof response === 'object' && response !== null && 'data' in response) return response.data;
        return response as LiturgicalDay;
    }
}

function applyLiturgicalDayOverrides(day: LiturgicalDay | undefined, overrides: LiturgicalDayOverrides | undefined): LiturgicalDay | undefined {
    if (!day || !overrides) return day;
    return {
        ...structuredClone(day),
        ...overrides,
        readings: {
            ...day.readings,
            ...overrides.readings,
        },
    };
}

function normalizedToNative(item: { type: 'header' | 'text' | 'song'; title: string; note?: string; responsible?: string; arrangementId?: number | null }): NativeAgendaItemInput {
    if (item.type === 'header') return { type: 'header', title: item.title };
    if (item.type === 'song') {
        if (item.arrangementId === undefined || item.arrangementId === null) throw new Error(`Song agenda item "${item.title}" has no arrangementId.`);
        return { type: 'song', title: item.title, note: item.note, responsible: item.responsible, arrangementId: item.arrangementId };
    }
    return { type: 'text', title: item.title, note: item.note, responsible: item.responsible };
}
