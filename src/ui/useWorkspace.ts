import { computed, reactive, ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';

import { ChurchToolsAgendasAdapter, ChurchToolsClientAdapter, ChurchToolsCustomModuleStore, ChurchToolsEventsAdapter, ChurchToolsPermissionsAdapter, ChurchToolsSongsAdapter } from '../churchtools';
import { userFacingChurchToolsMessage } from '../churchtools/errors';
import { FetchLectionarySource, LiturgyEditorApplication, type InstallationSettings } from '../application';
import { scopeResourceRegistry } from '../application/resource-scope';
import type { HymnalImportState } from '../domain/imports';
import type { AgendaSlotValue } from '../domain/agenda-generation';
import type { HymnalDefinition } from '../data/hymnals';
import type { LectionaryDefinition } from '../data/lectionaries';
import type { OrganizationDefinition } from '../data/organizations';
import { resourceRegistry } from '../data/registry';
import type { LiturgyDefinition } from '../data/liturgies';
import type { ManagedAgenda } from '../domain/managed-agendas';
import type { WorkspaceEvent, WorkspaceSong, WorkspaceStatus, ImportProgressView, AgendaDriftView } from './types';
import { createWorkspaceQueryClient, executeMutation } from './query';

const extensionKey = import.meta.env.VITE_KEY || 'liturgy-editor';
const eventPageSize = 10;

type JsonStore = { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void>; delete(key: string): Promise<void> };

type WorkspaceOptions = {
    baseUrl?: string;
    notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    queryClient?: QueryClient;
    state?: JsonStore;
};

const lectionaryApiUrl = import.meta.env.VITE_LECTIONAR_API_URL as string | undefined;

export const useWorkspace = (options: WorkspaceOptions = {}) => {
    const queryClient = options.queryClient ?? createWorkspaceQueryClient();
    const client = new ChurchToolsClientAdapter();
    if (options.baseUrl) { client.setBaseUrl(options.baseUrl); client.setLoadCSRFForAPI(); }
    const eventsApi = new ChurchToolsEventsAdapter(client);
    const songsApi = new ChurchToolsSongsAdapter(client);
    const agendasApi = new ChurchToolsAgendasAdapter(client);
    const permissionsApi = new ChurchToolsPermissionsAdapter(client);
    const persistentStore = options.state ?? new ChurchToolsCustomModuleStore(client, extensionKey);
    const lectionarySource = lectionaryApiUrl?.trim() ? new FetchLectionarySource(lectionaryApiUrl) : undefined;
    const application = new LiturgyEditorApplication({ events: eventsApi, agendas: agendasApi, songs: songsApi, permissions: permissionsApi, state: persistentStore, resources: resourceRegistry, lectionary: lectionarySource ? { source: lectionarySource } : undefined, importOptions: { concurrency: 3 } });

    const events = ref<WorkspaceEvent[]>([]);
    const eventPage = ref(1);
    const eventHasNextPage = ref(false);
    const songs = ref<WorkspaceSong[]>([]);
    const eventStatus = ref<WorkspaceStatus>('idle');
    const songStatus = ref<WorkspaceStatus>('idle');
    const error = ref<string | undefined>();
    const isOnline = ref(Boolean(options.baseUrl));
    const apiConfigured = ref(Boolean(options.baseUrl));
    const importProgress = ref<ImportProgressView | undefined>();
    const importState = ref<HymnalImportState | undefined>();
    const operationBusy = ref(false);
    const installationSettings = ref<InstallationSettings>({ version: 1 });
    const settingsStatus = ref<WorkspaceStatus>('idle');
    let eventLoadToken = 0;
    let eventInspectionToken = 0;
    let eventPageFrom = new Date().toISOString().slice(0, 10);
    const notify = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => options.notify?.(message, type);

    const loadSettings = async (): Promise<InstallationSettings> => {
        settingsStatus.value = 'loading';
        try {
            const settings = await queryClient.fetchQuery({
                queryKey: ['installation-settings'],
                queryFn: () => application.getInstallationSettings(),
            });
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
            const updated = await executeMutation(
                queryClient,
                ['update-installation-settings'],
                (nextOrganizationId: string | undefined) => application.updateInstallationSettings({ organizationId: nextOrganizationId }),
                organizationId,
            );
            queryClient.setQueryData(['installation-settings'], updated);
            await queryClient.invalidateQueries({ queryKey: ['hymnal-import'] });
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

    const loadEvents = async (page = eventPage.value): Promise<void> => {
        const loadToken = ++eventLoadToken;
        if (page === 1) eventPageFrom = new Date().toISOString().slice(0, 10);
        eventStatus.value = 'loading'; error.value = undefined;
        try {
            const loaded = await queryClient.fetchQuery({
                queryKey: ['upcoming-events', eventPageFrom, page],
                staleTime: 0,
                queryFn: () => application.getUpcomingEvents({
                    from: eventPageFrom,
                    limit: eventPageSize,
                    page,
                }),
            });
            const nextEvents = loaded
                .flatMap((event): WorkspaceEvent[] => event.name && event.startDate
                    ? [{ ...event, name: event.name, startDate: event.startDate, status: 'loading' }]
                    : [])
                .sort((left, right) => left.startDate.localeCompare(right.startDate));
            if (loadToken !== eventLoadToken) return;
            if (page > 1 && nextEvents.length === 0) {
                eventHasNextPage.value = false;
                eventStatus.value = 'ready';
                return;
            }
            events.value = nextEvents;
            eventPage.value = page;
            eventHasNextPage.value = loaded.length === eventPageSize;
            isOnline.value = true; eventStatus.value = 'ready';
            const inspectionToken = ++eventInspectionToken;
            for (const event of nextEvents) {
                void application.inspectEvent(event).then((inspected) => {
                    if (inspectionToken !== eventInspectionToken) return;
                    const current = events.value.find((candidate) => candidate.id === event.id);
                    if (current) current.status = inspected.status;
                }).catch(() => {
                    if (inspectionToken !== eventInspectionToken) return;
                    const current = events.value.find((candidate) => candidate.id === event.id);
                    if (current) current.status = 'unavailable';
                });
            }
        } catch (cause) {
            if (loadToken !== eventLoadToken) return;
            isOnline.value = false; events.value = []; eventStatus.value = 'error'; error.value = userFacingChurchToolsMessage(cause);
        }
    };

    const loadPreviousEvents = (): Promise<void> => loadEvents(Math.max(1, eventPage.value - 1));
    const loadNextEvents = (): Promise<void> => loadEvents(eventPage.value + 1);

    const loadSongs = async (): Promise<void> => {
        if (songStatus.value === 'loading') return;
        songStatus.value = 'loading';
        try {
            // The documented ChurchTools song endpoint caps `limit` at 200.
            // Larger values fail the complete workspace load with a validation
            // error before the picker can perform its own focused searches.
            const loaded = await queryClient.fetchQuery({
                queryKey: ['songs', '', 200],
                queryFn: () => application.searchSongs('', { limit: 200 }),
            });
            songs.value = loaded
                .map((result) => ({
                    id: result.song.id,
                    name: result.song.name,
                    author: result.song.author,
                    category: result.song.category,
                    arrangements: result.song.arrangements,
                    hymnalName: result.hymnalName,
                    number: result.number,
                }))
                .filter((song) => Boolean(song.id && song.name)) as WorkspaceSong[];
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
        operationBusy.value = true;
        importProgress.value = { operation: 'install', hymnalId: hymnal.id, completed: 0, failed: 0, total: hymnal.songs.length, percent: 0, status: 'pending' };
        try {
            const result = await executeMutation(
                queryClient,
                ['install-hymnal', hymnal.id],
                (hymnalId: string) => application.installHymnal(hymnalId, {
                    onProgress: (progress) => {
                        importProgress.value = { operation: 'install', hymnalId, completed: progress.completed, failed: progress.failed, total: progress.total, percent: progress.percent, status: progress.status };
                    },
                }),
                hymnal.id,
            );
            importState.value = result.state;
            importProgress.value = { operation: 'install', hymnalId: hymnal.id, completed: result.state.completed, failed: result.state.failed, total: result.state.total, percent: result.state.total ? Math.round(((result.state.completed + result.state.failed) / result.state.total) * 100) : 100, status: result.state.status };
            queryClient.setQueryData(['hymnal-import', hymnal.id], result.state);
            await queryClient.invalidateQueries({ queryKey: ['songs'] });
            notify(result.state.failed ? `${result.state.completed} Lieder importiert, ${result.state.failed} benötigen einen erneuten Versuch.` : 'Gesangbuch erfolgreich installiert.', result.state.failed ? 'warning' : 'success');
            await loadSongs();
            return result.state;
        } catch (cause) { const message = userFacingChurchToolsMessage(cause); error.value = message; notify(message, 'error'); throw cause; } finally { operationBusy.value = false; }
    };

    const previewUninstall = async (hymnalId: string) => {
        return (await application.uninstallHymnalDryRun(hymnalId)).plan;
    };

    const uninstallHymnal = async (hymnalId: string) => {
        operationBusy.value = true;
        importProgress.value = { operation: 'uninstall', hymnalId, completed: 0, failed: 0, total: 0, percent: 0, status: 'pending' };
        try {
            const result = await executeMutation(
                queryClient,
                ['uninstall-hymnal', hymnalId],
                (id: string) => application.uninstallHymnal(id, {
                    confirmed: true,
                    onProgress: (progress) => {
                        importProgress.value = { operation: 'uninstall', hymnalId: id, completed: progress.completed, failed: progress.failed, total: progress.total, percent: progress.percent, status: progress.status };
                    },
                }),
                hymnalId,
            );
            importState.value = await application.repositories.imports.load(hymnalId);
            if (importState.value) {
                queryClient.setQueryData(['hymnal-import', hymnalId], importState.value);
            } else {
                queryClient.removeQueries({ queryKey: ['hymnal-import', hymnalId], exact: true });
            }
            await queryClient.invalidateQueries({ queryKey: ['songs'] });
            await loadSongs();
            const retainedCount = result.state?.failed ?? result.plan.conflictCount;
            notify(`${result.state?.completed ?? 0} Songs sicher entfernt.${retainedCount ? ` ${retainedCount} Songs bleiben erhalten.` : ''}`, retainedCount ? 'warning' : 'success');
            return result;
        } catch (cause) { const message = userFacingChurchToolsMessage(cause); error.value = message; notify(message, 'error'); throw cause; } finally { operationBusy.value = false; }
    };

    const loadImport = async (hymnalId: string): Promise<HymnalImportState | undefined> => {
        try {
            importState.value = await queryClient.fetchQuery({
                queryKey: ['hymnal-import', hymnalId],
                queryFn: () => application.repositories.imports.load(hymnalId),
            });
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
        try {
            const results = await queryClient.fetchQuery({
                queryKey: ['songs', query.trim(), 50],
                queryFn: () => application.searchSongs(query, { limit: 50 }),
            });
            return results
                .map((result) => ({
                    id: result.song.id,
                    name: result.song.name,
                    author: result.song.author,
                    category: result.song.category,
                    arrangements: result.song.arrangements,
                    hymnalName: result.hymnalName,
                    number: result.number,
                }))
                .filter((song) => Boolean(song.id && song.name)) as WorkspaceSong[];
        } catch (cause) { error.value = userFacingChurchToolsMessage(cause); return []; }
    };

    const saveAgenda = async (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options: { series?: string; force?: boolean; optionalSections?: Readonly<Record<string, boolean>>; liturgicalDay?: import('../data/lectionaries').LiturgicalDay; nodes?: LiturgyDefinition['nodes'] } = {}): Promise<ManagedAgenda> => {
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
        const result = await application.saveAgenda({
            eventId: event.id,
            organizationId: template.organizationId,
            liturgyId: template.id,
            nodes: options.nodes,
            slots,
            optionalSections: options.optionalSections,
            liturgicalDay: options.liturgicalDay,
            series: options.series,
            force: options.force,
        });
        return result.managedAgenda;
    };

    const inspectAgenda = async (event: WorkspaceEvent): Promise<AgendaDriftView | undefined> => {
        const inspected = await application.inspectEvent(event.id);
        if (inspected.status !== 'externally-changed' || !inspected.managedAgenda) return undefined;
        return { event, agenda: inspected.agenda, managed: inspected.managedAgenda, reasons: inspected.reconciliation?.reasons };
    };

    const suggestLiturgicalDay = (input: Parameters<LiturgyEditorApplication['suggestLiturgicalDay']>[0]) => application.suggestLiturgicalDay(input);

    const keepAgenda = async (eventId: number): Promise<void> => {
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

    return reactive({ events, eventPage, eventHasNextPage, songs, eventStatus, songStatus, error, isOnline, apiConfigured, importProgress, importState, operationBusy, installationSettings, settingsStatus, selectedOrganization, organizations, availableLiturgies, availableHymnals, availableLectionaries, loadEvents, loadPreviousEvents, loadNextEvents, loadSongs, loadSettings, saveInstallationOrganization, loadImport, importHymnal, previewUninstall, uninstallHymnal, searchSongs, saveAgenda, inspectAgenda, suggestLiturgicalDay, keepAgenda, notify });
};
