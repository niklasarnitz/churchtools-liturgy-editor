import { computed, reactive, ref } from 'vue';

import { ChurchToolsAgendasAdapter, ChurchToolsClientAdapter, ChurchToolsCustomModuleStore, ChurchToolsEventsAdapter, ChurchToolsPermissionsAdapter, ChurchToolsSongsAdapter, type NativeEvent } from '../churchtools';
import { userFacingChurchToolsMessage } from '../churchtools/errors';
import { FetchLectionarySource, LiturgyEditorApplication, type InstallationSettings } from '../application';
import { scopeResourceRegistry } from '../application/resource-scope';
import type { HymnalImportState } from '../domain/imports';
import type { AgendaSlotValue } from '../domain/agenda-generation';
import type { HymnalDefinition } from '../data/hymnals';
import type { LectionaryDefinition } from '../data/lectionaries';
import type { OrganizationDefinition } from '../data/organizations';
import { demoEgBaden } from '../data/hymnals/demo-eg-baden';
import { resourceRegistry } from '../data/registry';
import type { LiturgyDefinition } from '../data/liturgies';
import type { ManagedAgenda } from '../domain/managed-agendas';
import type { WorkspaceEvent, WorkspaceSong, WorkspaceStatus, ImportProgressView, AgendaDriftView } from './types';

const extensionKey = import.meta.env.VITE_KEY || 'liturgy-editor';
const statePrefix = 'liturgy-editor:';

const demoSongs: WorkspaceSong[] = demoEgBaden.songs.map((song, index) => ({
    id: 7000 + index,
    name: song.title,
    author: song.author ?? null,
    copyright: song.copyright ?? null,
    ccli: song.ccli ?? null,
    category: { id: 700, name: demoEgBaden.shortName },
    arrangements: [{ id: 8000 + index, name: 'Standard', isDefault: true }],
}));

const demoEvents: WorkspaceEvent[] = [
    { id: 92001, name: 'Gottesdienst am Sonntag', startDate: '2026-09-27T08:00:00Z', calendar: { id: 1 } as NativeEvent['calendar'], status: 'no-agenda' },
    { id: 92002, name: 'Abendgottesdienst', startDate: '2026-10-04T16:00:00Z', calendar: { id: 1 } as NativeEvent['calendar'], status: 'no-agenda' },
];

type JsonStore = { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void>; delete(key: string): Promise<void> };

const memoryFallback = new Map<string, string>();
const localStore = (): JsonStore => ({
    async get<T>(key: string) {
        if (typeof localStorage === 'undefined') {
            const raw = memoryFallback.get(`${statePrefix}${key}`);
            if (!raw) return undefined;
            try { return JSON.parse(raw) as T; } catch { return undefined; }
        }
        const raw = localStorage.getItem(`${statePrefix}${key}`);
        if (!raw) return undefined;
        try { return JSON.parse(raw) as T; } catch { return undefined; }
    },
    async set<T>(key: string, value: T) {
        if (typeof localStorage === 'undefined') {
            memoryFallback.set(`${statePrefix}${key}`, JSON.stringify(value));
            return;
        }
        localStorage.setItem(`${statePrefix}${key}`, JSON.stringify(value));
    },
    async delete(key: string) {
        if (typeof localStorage === 'undefined') {
            memoryFallback.delete(`${statePrefix}${key}`);
            return;
        }
        localStorage.removeItem(`${statePrefix}${key}`);
    },
});

type WorkspaceOptions = { baseUrl?: string; notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void };

const lectionaryApiUrl = import.meta.env.VITE_LECTIONAR_API_URL as string | undefined;

export const useWorkspace = (options: WorkspaceOptions = {}) => {
    const client = new ChurchToolsClientAdapter();
    if (options.baseUrl) { client.setBaseUrl(options.baseUrl); client.setLoadCSRFForAPI(); }
    const eventsApi = new ChurchToolsEventsAdapter(client);
    const songsApi = new ChurchToolsSongsAdapter(client);
    const agendasApi = new ChurchToolsAgendasAdapter(client);
    const permissionsApi = new ChurchToolsPermissionsAdapter(client);
    const persistentStore = options.baseUrl ? new ChurchToolsCustomModuleStore(client, extensionKey) : localStore();
    const lectionarySource = lectionaryApiUrl?.trim() ? new FetchLectionarySource(lectionaryApiUrl) : undefined;
    const application = new LiturgyEditorApplication({ events: eventsApi, agendas: agendasApi, songs: songsApi, permissions: permissionsApi, state: persistentStore, resources: resourceRegistry, lectionary: lectionarySource ? { source: lectionarySource } : undefined, importOptions: { concurrency: 3 } });

    const events = ref<WorkspaceEvent[]>([]);
    const songs = ref<WorkspaceSong[]>([]);
    const eventStatus = ref<WorkspaceStatus>('idle');
    const songStatus = ref<WorkspaceStatus>('idle');
    const error = ref<string | undefined>();
    const isOnline = ref(Boolean(options.baseUrl));
    const apiConfigured = Boolean(options.baseUrl);
    const importProgress = ref<ImportProgressView | undefined>();
    const importState = ref<HymnalImportState | undefined>();
    const operationBusy = ref(false);
    const installationSettings = ref<InstallationSettings>({ version: 1 });
    const settingsStatus = ref<WorkspaceStatus>('idle');
    const notify = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => options.notify?.(message, type);

    const loadSettings = async (): Promise<InstallationSettings> => {
        settingsStatus.value = 'loading';
        try {
            const settings = await application.getInstallationSettings();
            installationSettings.value = settings;
            settingsStatus.value = 'ready';
            return settings;
        } catch (cause) {
            settingsStatus.value = 'error';
            error.value = userFacingChurchToolsMessage(cause);
            return { version: 1 };
        }
    };

    const saveInstallationOrganization = async (organizationId?: string): Promise<InstallationSettings> => {
        operationBusy.value = true;
        try {
            const updated = await application.updateInstallationSettings({ organizationId });
            installationSettings.value = updated;
            notify('Kirchenkörper erfolgreich gespeichert.', 'success');
            return updated;
        } catch (cause) {
            const message = userFacingChurchToolsMessage(cause);
            error.value = message;
            notify(message, 'error');
            throw cause;
        } finally {
            operationBusy.value = false;
        }
    };

    const selectedOrganization = computed<OrganizationDefinition | undefined>(() =>
        resourceRegistry.organizations.find((org) => org.id === installationSettings.value.organizationId)
    );

    const scopedResources = computed(() => {
        const orgId = installationSettings.value.organizationId;
        if (!orgId) return undefined;
        try {
            return scopeResourceRegistry(resourceRegistry, orgId);
        } catch {
            return undefined;
        }
    });

    const availableLiturgies = computed<LiturgyDefinition[]>(() => scopedResources.value?.liturgies ?? []);
    const availableHymnals = computed<HymnalDefinition[]>(() => scopedResources.value?.hymnals ?? []);
    const availableLectionaries = computed<LectionaryDefinition[]>(() => scopedResources.value?.lectionaries ?? []);
    const organizations = computed<OrganizationDefinition[]>(() =>
        scopedResources.value ? scopedResources.value.organizations : resourceRegistry.organizations
    );

    const loadEvents = async (): Promise<void> => {
        eventStatus.value = 'loading'; error.value = undefined;
        if (!options.baseUrl) { events.value = structuredClone(demoEvents); eventStatus.value = 'ready'; return; }
        try {
            const now = new Date(); const until = new Date(now); until.setDate(until.getDate() + 120);
            const loaded = await application.getUpcomingServices({ from: now.toISOString().slice(0, 10), to: until.toISOString().slice(0, 10), limit: 100 });
            events.value = loaded
                .map((item) => ({ ...item.event, status: item.status }))
                .filter((event): event is WorkspaceEvent => Boolean(event.id && event.name && event.startDate))
                .sort((left, right) => left.startDate.localeCompare(right.startDate));
            isOnline.value = true; eventStatus.value = 'ready';
        } catch (cause) {
            if (!apiConfigured) { events.value = structuredClone(demoEvents); eventStatus.value = 'ready'; return; }
            isOnline.value = false; events.value = []; eventStatus.value = 'error'; error.value = userFacingChurchToolsMessage(cause);
        }
    };

    const loadSongs = async (): Promise<void> => {
        if (songStatus.value === 'loading') return;
        songStatus.value = 'loading';
        if (!apiConfigured) { songs.value = structuredClone(demoSongs); songStatus.value = 'ready'; return; }
        try {
            // The documented ChurchTools song endpoint caps `limit` at 200.
            // Larger values fail the complete workspace load with a validation
            // error before the picker can perform its own focused searches.
            const loaded = await application.searchSongs('', { limit: 200 });
            songs.value = loaded.map((result) => ({ id: result.song.id, name: result.song.name, author: result.song.author, category: result.song.category, arrangements: result.song.arrangements })).filter((song) => Boolean(song.id && song.name)) as WorkspaceSong[];
            songStatus.value = 'ready';
        } catch (cause) { songs.value = []; songStatus.value = 'error'; error.value = userFacingChurchToolsMessage(cause); }
    };

    const importHymnal = async (hymnal: HymnalDefinition): Promise<HymnalImportState> => {
        if (!installationSettings.value.organizationId) {
            const message = 'Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt. Bitte wende dich an einen Administrator.';
            error.value = message;
            notify(message, 'error');
            throw new Error(message);
        }
        if (!hymnal.organizationIds.includes(installationSettings.value.organizationId)) {
            const message = `Gesangbuch "${hymnal.name}" gehört nicht zum konfigurierten Kirchenkörper.`;
            error.value = message;
            notify(message, 'error');
            throw new Error(message);
        }
        operationBusy.value = true; importProgress.value = { completed: 0, failed: 0, total: hymnal.songs.length, percent: 0, status: 'pending' };
        try {
            if (!apiConfigured) {
                const timestamp = new Date().toISOString(); const previous = await application.repositories.imports.load(hymnal.id);
                const state: HymnalImportState = { operationId: `${hymnal.id}:${hymnal.version}`, hymnalId: hymnal.id, hymnalVersion: hymnal.version, status: 'running', total: hymnal.songs.length, completed: previous?.completed ?? 0, failed: 0, mappings: previous?.mappings ?? {}, failures: [], startedAt: previous?.startedAt ?? timestamp, updatedAt: timestamp };
                for (const [index, source] of hymnal.songs.entries()) {
                    const song = demoSongs[index % demoSongs.length];
                    state.mappings[source.id] ??= { hymnalSongId: source.id, churchToolsSongId: song.id, churchToolsArrangementId: song.arrangements?.[0]?.id, sourceFingerprint: JSON.stringify(source), importedFingerprint: JSON.stringify(song), hymnalVersion: hymnal.version, createdAt: timestamp, updatedAt: timestamp };
                    state.completed = index + 1; state.updatedAt = new Date().toISOString(); await application.repositories.imports.save(state);
                    importProgress.value = { completed: state.completed, failed: 0, total: state.total, percent: Math.round((state.completed / state.total) * 100), status: 'running' };
                }
                state.status = 'completed'; await application.repositories.imports.save(state); importState.value = state; notify('Gesangbuch erfolgreich installiert.', 'success'); return state;
            }
            const result = await application.installHymnal(hymnal.id, { onProgress: (progress) => { importProgress.value = { completed: progress.completed, failed: progress.failed, total: progress.total, percent: progress.percent, status: progress.status }; } });
            importState.value = result.state; importProgress.value = { completed: result.state.completed, failed: result.state.failed, total: result.state.total, percent: result.state.total ? Math.round((result.state.completed / result.state.total) * 100) : 100, status: result.state.status }; notify(result.state.failed ? `${result.state.completed} Lieder importiert, ${result.state.failed} benötigen einen erneuten Versuch.` : 'Gesangbuch erfolgreich installiert.', result.state.failed ? 'warning' : 'success'); await loadSongs(); return result.state;
        } catch (cause) { const message = userFacingChurchToolsMessage(cause); error.value = message; notify(message, 'error'); throw cause; } finally { operationBusy.value = false; }
    };

    const previewUninstall = async (hymnalId: string) => {
        if (!apiConfigured) {
            const state = await application.repositories.imports.load(hymnalId); const mappings = Object.values(state?.mappings ?? {});
            return { hymnalId, dryRun: true as const, candidates: mappings.map((mapping) => ({ hymnalSongId: mapping.hymnalSongId, churchToolsSongId: mapping.churchToolsSongId })), conflicts: [], safeCount: mappings.length, conflictCount: 0 };
        }
        return (await application.uninstallHymnalDryRun(hymnalId)).plan;
    };

    const uninstallHymnal = async (hymnalId: string) => {
        operationBusy.value = true;
        try {
            const plan = await previewUninstall(hymnalId);
            if (apiConfigured) await application.uninstallHymnal(hymnalId, { confirmed: true });
            else {
                const state = await application.repositories.imports.load(hymnalId);
                if (state) await application.repositories.imports.save({ ...state, mappings: {}, completed: 0, failed: 0, status: 'completed', updatedAt: new Date().toISOString() });
            }
            importState.value = undefined; importProgress.value = undefined; await loadSongs(); notify(`${plan.safeCount} Songs sicher entfernt.${plan.conflictCount ? ` ${plan.conflictCount} Konflikte bleiben erhalten.` : ''}`, plan.conflictCount ? 'warning' : 'success'); return plan;
        } catch (cause) { const message = userFacingChurchToolsMessage(cause); error.value = message; notify(message, 'error'); throw cause; } finally { operationBusy.value = false; }
    };

    const loadImport = async (hymnalId: string): Promise<HymnalImportState | undefined> => {
        try {
            importState.value = await application.repositories.imports.load(hymnalId);
            return importState.value;
        } catch (cause) {
            // A host extension can be loaded before a valid ChurchTools
            // session exists. Keep the catalog available without inventing a
            // local import state or allowing an unhandled mounted-hook error.
            importState.value = undefined;
            error.value = userFacingChurchToolsMessage(cause);
            return undefined;
        }
    };

    const searchSongs = async (query: string): Promise<WorkspaceSong[]> => {
        if (!apiConfigured) { const needle = query.toLocaleLowerCase().trim(); return demoSongs.filter((song) => !needle || `${song.name} ${song.category?.name ?? ''}`.toLocaleLowerCase().includes(needle)); }
        try { return (await application.searchSongs(query, { limit: 50 })).map((result) => ({ id: result.song.id, name: result.song.name, author: result.song.author, category: result.song.category, arrangements: result.song.arrangements })).filter((song) => Boolean(song.id && song.name)) as WorkspaceSong[]; }
        catch (cause) { error.value = userFacingChurchToolsMessage(cause); return []; }
    };

    const saveAgenda = async (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options: { series?: string; force?: boolean } = {}): Promise<ManagedAgenda> => {
        if (!installationSettings.value.organizationId) {
            const message = 'Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt. Bitte wende dich an einen Administrator.';
            error.value = message;
            notify(message, 'error');
            throw new Error(message);
        }
        if (template.organizationId !== installationSettings.value.organizationId) {
            const message = `Liturgie "${template.name}" gehört nicht zum konfigurierten Kirchenkörper.`;
            error.value = message;
            notify(message, 'error');
            throw new Error(message);
        }
        if (!apiConfigured) { notify('Vorschau: Der Ablauf würde jetzt als native Agenda gespeichert.', 'info'); return { eventId: event.id, agendaId: 60000 + event.id, templateId: template.id, templateVersion: template.version, nodeMappings: {}, lastAppliedFingerprint: 'preview', updatedAt: new Date().toISOString() }; }
        const result = await application.saveAgenda({ eventId: event.id, organizationId: template.organizationId, liturgyId: template.id, slots, series: options.series, force: options.force }); return result.managedAgenda;
    };

    const inspectAgenda = async (event: WorkspaceEvent): Promise<AgendaDriftView | undefined> => {
        if (!apiConfigured) return undefined;
        const inspected = await application.inspectEvent(event.id);
        if (inspected.status !== 'externally-changed' || !inspected.managedAgenda) return undefined;
        return { event, agenda: inspected.agenda, managed: inspected.managedAgenda, reasons: inspected.reconciliation?.reasons };
    };

    const suggestLiturgicalDay = (input: Parameters<LiturgyEditorApplication['suggestLiturgicalDay']>[0]) => application.suggestLiturgicalDay(input);

    const keepAgenda = async (eventId: number): Promise<void> => {
        if (!apiConfigured) return;
        try {
            const resolved = await application.resolveAgendaConflict(eventId, 'keep');
            if ('status' in resolved && resolved.status === 'externally-changed') {
                throw new Error('Der native Ablauf ist nicht mehr vorhanden und kann nicht beibehalten werden.');
            }
            notify('Die aktuelle ChurchTools-Version des Ablaufs bleibt erhalten.', 'success');
        } catch (cause) {
            const message = userFacingChurchToolsMessage(cause);
            error.value = message;
            notify(message, 'error');
            throw cause;
        }
    };

    return reactive({ apiConfigured, events, songs, eventStatus, songStatus, error, isOnline, importProgress, importState, operationBusy, installationSettings, settingsStatus, selectedOrganization, organizations, availableLiturgies, availableHymnals, availableLectionaries, loadEvents, loadSongs, loadSettings, saveInstallationOrganization, loadImport, importHymnal, previewUninstall, uninstallHymnal, searchSongs, saveAgenda, inspectAgenda, suggestLiturgicalDay, keepAgenda, notify });
};
