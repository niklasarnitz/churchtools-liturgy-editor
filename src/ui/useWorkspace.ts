import { computed, reactive, ref } from 'vue';
import type { GetWhoamiResponse } from '@churchtools/api-types';
import { useMutation, type QueryClient } from '@tanstack/vue-query';

import { ChurchToolsAgendasAdapter } from '../churchtools/agendas';
import { ChurchToolsClientAdapter } from '../churchtools/client';
import { ChurchToolsCustomModuleStore } from '../churchtools/customModuleStore';
import { ChurchToolsEventsAdapter } from '../churchtools/events';
import { ChurchToolsPermissionsAdapter } from '../churchtools/permissions';
import { ChurchToolsSongsAdapter } from '../churchtools/songs';
import type { NativeAgenda } from '../churchtools/types';
import { userFacingChurchToolsMessage } from '../churchtools/errors';
import { FetchLectionarySource } from '../application/lectionary-fetch';
import { LiturgyEditorApplication } from '../application/service';
import type { InstallationSettings } from '../application/types';
import { scopeResourceRegistry } from '../application/resource-scope';
import type { HymnalImportState } from '../domain/imports/types';
import type { AgendaSlotValue } from '../domain/agenda-generation/types';
import type { HymnalDefinition } from '../data/hymnals/types';
import type { LectionaryDefinition } from '../data/lectionaries/types';
import type { OrganizationDefinition } from '../data/organizations/types';
import { resourceRegistry } from '../data/registry';
import type { WorkspaceEvent, WorkspaceSong, WorkspaceStatus, ImportProgressView, AgendaDriftView } from './types';
import type { LiturgyDefinition } from '../data/liturgies/types';
import type { ManagedAgenda } from '../domain/managed-agendas/types';
import type { SavedBlock } from '../domain/liturgies/blocks';
import { createWorkspaceQueryClient } from './query';
import { workspaceQueryKeys } from './workspaceQueryKeys';

const extensionKey = import.meta.env.VITE_KEY || 'liturgy-editor';
const eventPageSize = 10;

type JsonStore = { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void>; delete(key: string): Promise<void> };

type WorkspaceOptions = {
    baseUrl?: string;
    notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    queryClient?: QueryClient;
    state?: JsonStore;
    permissions?: ChurchToolsPermissionsAdapter;
};

const lectionaryApiUrl = import.meta.env.VITE_LECTIONAR_API_URL as string | undefined;

export const useWorkspace = (options: WorkspaceOptions = {}) => {
    const queryClient = options.queryClient ?? createWorkspaceQueryClient();
    const client = new ChurchToolsClientAdapter();
    if (options.baseUrl) { client.setBaseUrl(options.baseUrl); client.setLoadCSRFForAPI(); }
    const eventsApi = new ChurchToolsEventsAdapter(client);
    const songsApi = new ChurchToolsSongsAdapter(client);
    const agendasApi = new ChurchToolsAgendasAdapter(client);
    const permissionsApi = options.permissions ?? new ChurchToolsPermissionsAdapter(client);
    const persistentStore = options.state ?? new ChurchToolsCustomModuleStore(client, extensionKey);
    const lectionarySource = lectionaryApiUrl?.trim() ? new FetchLectionarySource(lectionaryApiUrl) : undefined;
    const lectionaryConfigured = Boolean(lectionarySource);
    const application = new LiturgyEditorApplication({ events: eventsApi, agendas: agendasApi, songs: songsApi, permissions: permissionsApi, state: persistentStore, resources: resourceRegistry, lectionary: lectionarySource ? { source: lectionarySource } : undefined, importOptions: { concurrency: 3 } });

    const events = ref<WorkspaceEvent[]>([]);
    const eventPage = ref(1);
    const eventHasNextPage = ref(false);
    const songs = ref<WorkspaceSong[]>([]);
    const eventStatus = ref<WorkspaceStatus>('idle');
    const songStatus = ref<WorkspaceStatus>('idle');
    const error = ref<string | undefined>();
    const isOnline = ref(false);
    const apiConfigured = ref(Boolean(options.baseUrl));
    const currentUserId = ref<number>();
    const queryKeys = () => workspaceQueryKeys(options.baseUrl ?? 'host', currentUserId.value);
    const canManageSettings = ref(false);
    const canWriteAgenda = ref(false);
    const importProgress = ref<ImportProgressView | undefined>();
    const importState = ref<HymnalImportState | undefined>();
    const operationBusy = ref(false);
    const installationSettings = ref<InstallationSettings>({ version: 1 });
    const settingsStatus = ref<WorkspaceStatus>('idle');
    let eventLoadToken = 0;
    let eventInspectionToken = 0;
    const today = new Date();
    const eventFrom = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    let eventPageFrom = eventFrom.value;
    const notify = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => options.notify?.(message, type);
    const updateSettingsMutation = useMutation({
        mutationKey: ['update-installation-settings'],
        mutationFn: (organizationId: string | undefined) => application.updateInstallationSettings({ organizationId }),
    }, queryClient);
    const installHymnalMutation = useMutation({
        mutationKey: ['install-hymnal'],
        mutationFn: (hymnalId: string) => application.installHymnal(hymnalId, {
            onProgress: (progress) => {
                importProgress.value = { operation: 'install', hymnalId, completed: progress.completed, failed: progress.failed, total: progress.total, percent: progress.percent, status: progress.status };
            },
        }),
    }, queryClient);
    const uninstallHymnalMutation = useMutation({
        mutationKey: ['uninstall-hymnal'],
        mutationFn: (hymnalId: string) => application.uninstallHymnal(hymnalId, {
            confirmed: true,
            onProgress: (progress) => {
                importProgress.value = { operation: 'uninstall', hymnalId, completed: progress.completed, failed: progress.failed, total: progress.total, percent: progress.percent, status: progress.status };
            },
        }),
    }, queryClient);


    const loadCapabilities = async (): Promise<void> => {
        try {
            const person = await client.get<GetWhoamiResponse['data']>('/whoami', { only_allow_authenticated: true });
            currentUserId.value = Number.isSafeInteger(person.id) && person.id > 0 ? person.id : undefined;
            const [settings, agenda] = await Promise.all([
                permissionsApi.can('churchservice', 'edit masterdata'),
                permissionsApi.can('churchservice', 'edit agenda'),
            ]);
            canManageSettings.value = settings;
            canWriteAgenda.value = agenda;
        } catch {
            currentUserId.value = undefined;
            canManageSettings.value = false;
            canWriteAgenda.value = false;
        }
    };

    const loadSettings = async (): Promise<InstallationSettings> => {
        settingsStatus.value = 'loading';
        try {
            const settings = await queryClient.fetchQuery({
                queryKey: queryKeys().settings,
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
            const updated = await updateSettingsMutation.mutateAsync(organizationId);
            queryClient.setQueryData(queryKeys().settings, updated);
            await queryClient.invalidateQueries({ queryKey: queryKeys().imports() });
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
    const canEditEvent = async (event: WorkspaceEvent): Promise<boolean> => {
        const calendarId = Number(event.calendar?.domainIdentifier);
        if (!Number.isSafeInteger(calendarId) || calendarId <= 0) return false;
        try { return await permissionsApi.can('churchservice', 'edit agenda', calendarId); }
        catch { return false; }
    };

    const loadEvents = async (page = eventPage.value): Promise<void> => {
        const loadToken = ++eventLoadToken;
        if (page === 1) eventPageFrom = eventFrom.value;
        eventStatus.value = 'loading'; error.value = undefined;
        try {
            const loaded = await queryClient.fetchQuery({
                queryKey: queryKeys().events(eventPageFrom, page),
                staleTime: 2 * 60_000,
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
                void canEditEvent(event).then((allowed) => {
                    if (inspectionToken !== eventInspectionToken) return;
                    const current = events.value.find((candidate) => candidate.id === event.id);
                    if (current) current.canEditAgenda = allowed;
                });
                void queryClient.fetchQuery({
                    queryKey: queryKeys().inspection(event.id),
                    queryFn: () => application.inspectEvent(event),
                    staleTime: 2 * 60_000,
                }).then((inspected) => {
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
    const refreshEvents = async (): Promise<void> => {
        await queryClient.invalidateQueries({ queryKey: queryKeys().events(eventPageFrom, eventPage.value) });
        await queryClient.invalidateQueries({ queryKey: queryKeys().inspections() });
        await loadEvents();
    };
    const setEventFrom = async (value: string): Promise<void> => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
        eventFrom.value = value;
        await loadEvents(1);
    };

    const loadSongs = async (): Promise<void> => {
        if (songStatus.value === 'loading') return;
        songStatus.value = 'loading';
        try {
            // The documented ChurchTools song endpoint caps `limit` at 200.
            // Larger values fail the complete workspace load with a validation
            // error before the picker can perform its own focused searches.
            const loaded = await queryClient.fetchQuery({
                queryKey: queryKeys().songSearch('', 200),
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
            isOnline.value = true;
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
            const result = await installHymnalMutation.mutateAsync(hymnal.id);
            importState.value = result.state;
            importProgress.value = { operation: 'install', hymnalId: hymnal.id, completed: result.state.completed, failed: result.state.failed, total: result.state.total, percent: result.state.total ? Math.round(((result.state.completed + result.state.failed) / result.state.total) * 100) : 100, status: result.state.status };
            queryClient.setQueryData(queryKeys().import(hymnal.id), result.state);
            await queryClient.invalidateQueries({ queryKey: queryKeys().songs() });
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
            const result = await uninstallHymnalMutation.mutateAsync(hymnalId);
            importState.value = await application.repositories.imports.load(hymnalId);
            if (importState.value) {
                queryClient.setQueryData(queryKeys().import(hymnalId), importState.value);
            } else {
                queryClient.removeQueries({ queryKey: queryKeys().import(hymnalId), exact: true });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys().songs() });
            await loadSongs();
            const retainedCount = result.state?.failed ?? result.plan.conflictCount;
            notify(`${result.state?.completed ?? 0} Songs sicher entfernt.${retainedCount ? ` ${retainedCount} Songs bleiben erhalten.` : ''}`, retainedCount ? 'warning' : 'success');
            return result;
        } catch (cause) { const message = userFacingChurchToolsMessage(cause); error.value = message; notify(message, 'error'); throw cause; } finally { operationBusy.value = false; }
    };

    const loadImport = async (hymnalId: string): Promise<HymnalImportState | undefined> => {
        try {
            importState.value = await queryClient.fetchQuery({
                queryKey: queryKeys().import(hymnalId),
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
            const normalizedQuery = query.trim();
            const results = await queryClient.fetchQuery({
                queryKey: queryKeys().songSearch(normalizedQuery.toLocaleLowerCase(), 50),
                queryFn: () => application.searchSongs(normalizedQuery, { limit: 50 }),
            });
            isOnline.value = true;
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
        } catch (cause) { error.value = userFacingChurchToolsMessage(cause); throw cause; }
    };

    const createArrangement = async (songId: number, input: { name: string; description?: string }): Promise<{ id: number; name?: string; isDefault?: boolean }> => {
        const created = await application.createSongArrangement(songId, input);
        await queryClient.invalidateQueries({ queryKey: queryKeys().songs() });
        songs.value = songs.value.map((song) => song.id === songId ? { ...song, arrangements: [...(song.arrangements ?? []), created] } : song);
        return created;
    };

    const loadSavedBlocks = (organizationId: string, userId: number): Promise<SavedBlock[]> => application.getPersonalBlocks(organizationId, userId);
    const saveSavedBlocks = (event: WorkspaceEvent, organizationId: string, userId: number, blocks: SavedBlock[]): Promise<void> =>
        application.savePersonalBlocks(event.id, organizationId, userId, blocks);

    const saveAgenda = async (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options: { series?: string; force?: boolean; expectedNativeFingerprint?: string | null; optionalSections?: Readonly<Record<string, boolean>>; liturgicalDay?: import('../data/lectionaries/types').LiturgicalDay; nodes?: LiturgyDefinition['nodes']; variantKey?: string; selectedDate?: string } = {}): Promise<ManagedAgenda> => {
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
        try {
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
                expectedNativeFingerprint: options.expectedNativeFingerprint,
                variantKey: options.variantKey,
                selectedDate: options.selectedDate,
            });
            await queryClient.invalidateQueries({ queryKey: queryKeys().inspection(event.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys().events(eventPageFrom, eventPage.value) });
            return result.managedAgenda;
        } catch (cause) {
            // A native change can happen while the editor is open. Surface the
            // latest conflict in the same decision dialog used on initial load.
            if (!options.force && cause instanceof Error) {
                try {
                    const inspected = await application.inspectEvent(event.id);
                    if (inspected.status === 'externally-changed' && inspected.managedAgenda) {
                        Object.assign(cause, { drift: { event, agenda: inspected.agenda, managed: inspected.managedAgenda, reasons: inspected.reconciliation?.reasons } satisfies AgendaDriftView });
                    }
                } catch { /* Keep the original save error when inspection is unavailable. */ }
            }
            throw cause;
        }
    };

    const loadEditorState = async (event: WorkspaceEvent): Promise<{
        templateId: string;
        nodes: LiturgyDefinition['nodes'];
        slots: Record<string, AgendaSlotValue | undefined>;
        series?: string;
        variantKey?: string;
        selectedDate?: string;
        liturgicalDay?: import('../data/lectionaries/types').LiturgicalDay;
        nativeAgenda?: NativeAgenda;
        managed?: ManagedAgenda;
        snapshotAvailable: boolean;
    } | undefined> => {
        const inspected = await application.inspectEvent(event.id);
        if (!inspected.agenda) return undefined;
        const managed = inspected.managedAgenda;
        const templateId = managed?.templateId ?? availableLiturgies.value[0]?.id;
        const template = availableLiturgies.value.find((item) => item.id === templateId);
        if (!template || !templateId) throw new Error('Die Vorlage dieses Ablaufs ist für den gewählten Kirchenkörper nicht verfügbar.');
        const mappedNodeIds = new Set(Object.keys(managed?.nodeMappings ?? {}).filter((id) => id !== '__liturgy-editor-management-hint'));
        const flattenNodeIds = (nodes: LiturgyDefinition['nodes']): string[] => nodes.flatMap((node) =>
            node.type === 'optionalSection' || node.type === 'communionSection' ? flattenNodeIds(node.nodes) : [node.id]);
        const inferredVariant = !managed?.editorSnapshot && mappedNodeIds.size
            ? template.nodes.filter((node) => node.type === 'optionalSection').find((section) => {
                const ids = new Set(flattenNodeIds(section.nodes));
                return [...mappedNodeIds].every((id) => ids.has(id));
            })
            : undefined;
        return {
            templateId,
            nodes: managed?.editorSnapshot?.nodes ?? structuredClone(template.nodes),
            slots: managed?.editorSnapshot?.slots ?? {},
            series: managed?.editorSnapshot?.series ?? inspected.agenda.series ?? undefined,
            variantKey: managed?.editorSnapshot?.variantKey ?? inferredVariant?.sectionKey,
            selectedDate: managed?.editorSnapshot?.selectedDate,
            liturgicalDay: managed?.editorSnapshot?.liturgicalDay,
            nativeAgenda: inspected.agenda,
            managed,
            snapshotAvailable: managed?.editorSnapshot !== undefined,
        };
    };

    const inspectAgenda = async (event: WorkspaceEvent): Promise<AgendaDriftView | undefined> => {
        const inspected = await application.inspectEvent(event.id);
        if (inspected.status !== 'externally-changed' || !inspected.managedAgenda) return undefined;
        return { event, agenda: inspected.agenda, managed: inspected.managedAgenda, reasons: inspected.reconciliation?.reasons };
    };

    const inspectReadOnlyAgenda = async (event: WorkspaceEvent): Promise<NativeAgenda | undefined> => {
        const inspected = await application.inspectEvent(event.id);
        if (inspected.status === 'unavailable') throw new Error('Der ChurchTools-Ablauf ist mit deinen Berechtigungen nicht verfügbar.');
        return inspected.agenda;
    };

    const suggestLiturgicalDay = (input: Parameters<LiturgyEditorApplication['suggestLiturgicalDay']>[0]) => application.suggestLiturgicalDay(input);

    const keepAgenda = async (eventId: number): Promise<void> => {
        try {
            const resolved = await application.resolveAgendaConflict(eventId, 'keep');
            if ('status' in resolved && resolved.status === 'externally-changed') {
                throw new Error('Der native Ablauf ist nicht mehr vorhanden und kann nicht beibehalten werden.');
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys().inspection(eventId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys().events(eventPageFrom, eventPage.value) });
            notify('Die aktuelle ChurchTools-Version des Ablaufs bleibt erhalten.', 'success');
        } catch (cause) {
            const message = userFacingChurchToolsMessage(cause);
            error.value = message;
            notify(message, 'error');
            throw cause;
        }
    };

    return reactive({ events, eventPage, eventHasNextPage, eventFrom, songs, eventStatus, songStatus, error, isOnline, apiConfigured, lectionaryConfigured, currentUserId, canManageSettings, canWriteAgenda, importProgress, importState, operationBusy, installationSettings, settingsStatus, selectedOrganization, organizations, availableLiturgies, availableHymnals, availableLectionaries, canEditEvent, loadEvents, loadPreviousEvents, loadNextEvents, refreshEvents, setEventFrom, loadSongs, loadCapabilities, loadSettings, saveInstallationOrganization, loadImport, importHymnal, previewUninstall, uninstallHymnal, searchSongs, createArrangement, loadSavedBlocks, saveSavedBlocks, saveAgenda, loadEditorState, inspectAgenda, inspectReadOnlyAgenda, suggestLiturgicalDay, keepAgenda, notify });
};
