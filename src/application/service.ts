import type { JsonStateStore } from '../churchtools/customModuleStore';
import { toChurchToolsError } from '../churchtools/errors';
import type { NativeAgenda, NativeAgendaItemInput, NativeEvent, NativeSong } from '../churchtools/types';
import { ChurchToolsAgendaSongUsageChecker } from '../churchtools/agendas';
import { HymnalImporter } from '../domain/imports/importer';
import { JsonHymnalImportStateRepository } from '../domain/imports/state-store';
import { HymnalUninstaller, type HymnalUsageChecker } from '../domain/imports/uninstaller';
import type { HymnalImportState, ImportProgress } from '../domain/imports/types';
import { generateNormalizedAgenda } from '../domain/agenda-generation';
import { ManagedAgendaStateStore } from '../domain/managed-agendas/state';
import { ManagedAgendaConflictError, ManagedAgendaSynchronizer } from '../domain/managed-agendas/sync';
import type { GeneratedAgendaItem, ManagedAgenda } from '../domain/managed-agendas/types';
import { agendaFingerprint, reconcileManagedAgenda } from '../domain/reconciliation/fingerprint';
import { resolveLiturgicalDay, toIsoDate } from '../domain/lectionary';
import type { HymnalDefinition } from '../data/hymnals';
import type { LiturgicalDay } from '../data/lectionaries';
import type { LiturgyDefinition } from '../data/liturgies';
import { resourceRegistry, type ResourceRegistry } from '../data/registry';
import { ShardedJsonStateStore } from './state';
import type {
    AgendaConflictDecision,
    ApplicationDependencies,
    BootstrapState,
    HymnalOperationResult,
    HymnalUninstallResult,
    LectionarySourceOptions,
    LiturgicalSuggestion,
    SaveAgendaInput,
    SaveAgendaResult,
    SongSearchResult,
    UpcomingService,
} from './types';

const MANAGEMENT_NODE_ID = '__liturgy-editor-management-hint';
const MANAGEMENT_HINT = 'Dieser Ablauf wird über den Liturgie-Editor verwaltet. Änderungen sollten möglichst dort vorgenommen werden.';

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

    async bootstrap(options: { from?: string; to?: string; limit?: number } = {}): Promise<BootstrapState> {
        try {
            const upcoming = await this.getUpcomingServices(options);
            return { status: 'ready', resources: this.resources, upcoming, installedHymnals: await this.loadImportStates() };
        } catch (error) {
            const normalized = toChurchToolsError(error);
            return { status: 'error', resources: this.resources, upcoming: [], installedHymnals: [], error: normalized.message };
        }
    }

    async getUpcomingServices(options: { from?: string; to?: string; limit?: number } = {}): Promise<UpcomingService[]> {
        const from = options.from ?? this.now().slice(0, 10);
        const query = options.to
            ? { from, to: options.to, canceled: false }
            : { from, direction: 'forward' as const, limit: options.limit ?? 100, canceled: false };
        const events = await this.deps.events.list(query);
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
            await this.deps.permissions.assertAgendaRead(event.calendar?.id);
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
        const hymnal = this.requireHymnal(hymnalId);
        const progress: ImportProgress[] = [];
        const importer = new HymnalImporter(this.deps.songs, this.repositories.imports);
        const state = await importer.import(hymnal, {
            ...this.deps.importOptions,
            ...options,
            categoryName: options.categoryName ?? hymnal.shortName,
            now: this.now,
            onProgress: async (entry) => { progress.push(entry); await options.onProgress?.(entry); },
        });
        return { state, progress };
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

    async uninstallHymnal(hymnalId: string, options: { confirmed: boolean }): Promise<HymnalUninstallResult> {
        if (!options.confirmed) throw new Error('Deinstallation muss ausdrücklich bestätigt werden.');
        await this.deps.permissions.assertSongWrite();
        const usageChecker = await this.createUsageChecker();
        const uninstaller = new HymnalUninstaller(this.deps.songs, this.repositories.imports, usageChecker);
        const states = await this.loadImportStates();
        const plan = await uninstaller.dryRun(hymnalId, states.filter((state) => state.hymnalId !== hymnalId));
        const state = await uninstaller.uninstall(hymnalId, { otherStates: states.filter((entry) => entry.hymnalId !== hymnalId), now: this.now });
        return { plan, state };
    }

    async suggestLiturgicalDay(input: { date: string | Date; organizationId: string; liturgyId?: string; lectionaryId?: string; overrides?: Parameters<typeof resolveLiturgicalDay>[0]['overrides'] }): Promise<LiturgicalSuggestion> {
        const organization = this.resources.organizations.find((candidate) => candidate.id === input.organizationId);
        if (!organization) throw new Error(`Organization "${input.organizationId}" is not installed.`);
        const liturgy = input.liturgyId ? this.requireLiturgy(input.liturgyId) : undefined;
        const date = toIsoDate(input.date);
        const local = resolveLiturgicalDay({ date, organization, liturgy, lectionaryId: input.lectionaryId, lectionaries: this.resources.lectionaries, overrides: input.overrides });
        if (local) return { day: local, source: 'local', overrides: input.overrides ?? {} };
        const external = await this.fetchExternalLiturgicalDay(date, organization.id, input.lectionaryId ?? liturgy?.lectionaryId);
        return { day: external, source: external ? 'external' : 'none', overrides: input.overrides ?? {} };
    }

    async searchSongs(query: string, options: { limit?: number } = {}): Promise<SongSearchResult[]> {
        await this.deps.permissions.assertSongRead();
        const limit = options.limit ?? 50;
        const normalized = query.trim().toLocaleLowerCase();
        const imported = await this.loadImportStates();
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
        const native = await this.deps.songs.list({ query: query.trim() || undefined, include: ['arrangements'], limit });
        const byId = new Map<number, NativeSong>();
        for (const song of native) byId.set(song.id, song);
        for (const songId of staticMatches.keys()) if (!byId.has(songId)) byId.set(songId, await this.deps.songs.get(songId));
        return [...byId.values()].slice(0, limit).map((song) => {
            const match = staticMatches.get(song.id);
            const arrangement = song.arrangements?.find((candidate) => candidate.isDefault) ?? song.arrangements?.[0];
            return { song, ...match, defaultArrangementId: arrangement?.id };
        });
    }

    async saveAgenda(input: SaveAgendaInput): Promise<SaveAgendaResult> {
        const event = await this.deps.events.get(input.eventId);
        await this.deps.permissions.assertAgendaWrite(event.calendar?.id);
        if (event.calendar?.id === undefined) throw new Error('Der ChurchTools-Termin hat keinen Kalender und kann daher keinen Ablauf erhalten.');
        const liturgy = this.requireLiturgy(input.liturgyId);
        if (liturgy.organizationId !== input.organizationId) throw new Error(`Liturgie "${input.liturgyId}" gehört nicht zur Organisation "${input.organizationId}".`);
        const generated = generateNormalizedAgenda({ template: liturgy, slots: input.slots, optionalSections: input.optionalSections, liturgicalDay: input.liturgicalDay, series: input.series });
        const generatedItems: GeneratedAgendaItem[] = [
            { nodeId: MANAGEMENT_NODE_ID, item: { type: 'text', title: 'Liturgie-Editor', note: MANAGEMENT_HINT } },
            ...generated.items.map((item) => ({ nodeId: item.nodeId, item: normalizedToNative(item) })),
        ];
        const existingManaged = await this.repositories.managed.get(input.eventId);
        if (!existingManaged) {
            let existing: NativeAgenda | undefined;
            try { existing = await this.deps.agendas.get(input.eventId); } catch (error) { if (toChurchToolsError(error).kind !== 'not-found') throw error; }
            if (existing) throw new ManagedAgendaConflictError({ status: 'externally-changed', currentFingerprint: agendaFingerprint(existing), reasons: [{ kind: 'agenda-changed' }] });
            const agenda = await this.deps.agendas.upsert(input.eventId, {
                calendarId: event.calendar.id,
                eventStartPosition: generated.eventStartPosition,
                series: generated.series ?? input.series ?? null,
                items: generatedItems.map((entry) => entry.item),
            });
            const refreshed = agenda.items.length ? agenda : await this.deps.agendas.get(input.eventId);
            const managedAgenda = this.createManagedState(input, refreshed, generatedItems);
            await this.repositories.managed.save(managedAgenda);
            return { managedAgenda, agenda: refreshed, generatedItemCount: generatedItems.length };
        }
        const managedAgenda = await this.synchronizer.apply(input.eventId, existingManaged, generatedItems, { force: input.force, now: this.now });
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
        const nodeMappings: ManagedAgenda['nodeMappings'] = {};
        generated.forEach((entry, index) => { const item = agenda.items[index]; if (item) nodeMappings[entry.nodeId] = { agendaItemIds: [item.id] }; });
        return { eventId: input.eventId, agendaId: agenda.id, templateId: input.liturgyId, templateVersion: this.requireLiturgy(input.liturgyId).version, nodeMappings, lastAppliedFingerprint: agendaFingerprint(agenda), updatedAt: this.now() };
    }

    private requireHymnal(id: string): HymnalDefinition { const hymnal = this.resources.hymnals.find((candidate) => candidate.id === id); if (!hymnal) throw new Error(`Hymnal "${id}" is not installed in this extension.`); return hymnal; }
    private requireLiturgy(id: string): LiturgyDefinition { const liturgy = this.resources.liturgies.find((candidate) => candidate.id === id); if (!liturgy) throw new Error(`Liturgy "${id}" is not installed.`); return liturgy; }

    private async loadImportStates(): Promise<HymnalImportState[]> {
        const states: HymnalImportState[] = [];
        for (const hymnal of this.resources.hymnals) { const state = await this.repositories.imports.load(hymnal.id); if (state) states.push(state); }
        return states;
    }

    private async createUsageChecker(): Promise<HymnalUsageChecker> {
        const events = await this.deps.events.list({ limit: 500 });
        return new ChurchToolsAgendaSongUsageChecker(this.deps.agendas, events.flatMap((event) => event.id === undefined ? [] : [event.id]));
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

function normalizedToNative(item: { type: 'header' | 'text' | 'song'; title: string; note?: string; arrangementId?: number | null }): NativeAgendaItemInput {
    if (item.type === 'header') return { type: 'header', title: item.title };
    if (item.type === 'song') {
        if (item.arrangementId === undefined || item.arrangementId === null) throw new Error(`Song agenda item "${item.title}" has no arrangementId.`);
        return { type: 'song', title: item.title, note: item.note, arrangementId: item.arrangementId };
    }
    return { type: 'text', title: item.title, note: item.note };
}
