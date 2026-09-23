import type { ChurchToolsAgendasAdapter } from '../churchtools/agendas';
import type { ChurchToolsEventsAdapter } from '../churchtools/events';
import type { ChurchToolsPermissionsAdapter } from '../churchtools/permissions';
import type { ChurchToolsRequestClient } from '../churchtools/request';
import type { ChurchToolsSongsAdapter } from '../churchtools/songs';
import type { NativeAgenda, NativeEvent, NativeSong } from '../churchtools/types';
import type { JsonStateStore } from '../churchtools/customModuleStore';
import type { ResourceRegistry } from '../data/registry';
import type { LiturgicalDay, ScriptureReference } from '../data/lectionaries';
import type { OrganizationDefinition } from '../data/organizations';
import type { LiturgyNode } from '../data/liturgies';
import type { AgendaSlotValue } from '../domain/agenda-generation';
import type { HymnalImportState, HymnalImportStateRepository, HymnalImportOptions } from '../domain/imports';
import type { HymnalUninstallPlan, HymnalUninstallState } from '../domain/imports/uninstaller';
import type { ManagedAgenda } from '../domain/managed-agendas';
import type { AgendaReconciliation } from '../domain/reconciliation/fingerprint';

export type ServiceStatus = 'no-agenda' | 'managed' | 'complete' | 'externally-changed' | 'unavailable';
export type UpcomingService = { event: NativeEvent; agenda?: NativeAgenda; managedAgenda?: ManagedAgenda; status: ServiceStatus; reconciliation?: AgendaReconciliation };
export type BootstrapState = { status: 'loading' | 'ready' | 'error'; resources: ResourceRegistry; upcoming: UpcomingService[]; installedHymnals: HymnalImportState[]; error?: string };

export type ExternalLectionarySource = { fetchDay(input: { date: string; organizationId: string; lectionaryId?: string }): Promise<LiturgicalDay | undefined> };
export type LectionarySourceOptions = { url?: string; client?: ChurchToolsRequestClient; source?: ExternalLectionarySource };
export type LiturgicalSuggestion = { day?: LiturgicalDay; source: 'external' | 'none'; overrides: Partial<LiturgicalDay> };
export type InstallationSettings = {
    version: 1;
    organizationId?: string;
};

export type SongSearchResult = { song: NativeSong; hymnalId?: string; hymnalName?: string; number?: string; defaultArrangementId?: number };
export type AgendaConflictDecision = 'keep' | 'reapply';
export type EditorValues = Readonly<Record<string, AgendaSlotValue | undefined>>;
export type SaveAgendaInput = {
    eventId: number;
    organizationId: string;
    liturgyId: string;
    /** User-arranged nodes from the visual editor. Template identity and metadata remain registry-owned. */
    nodes?: LiturgyNode[];
    slots?: EditorValues;
    optionalSections?: Readonly<Record<string, boolean>>;
    liturgicalDay?: LiturgicalDay;
    series?: string;
    variantKey?: string;
    selectedDate?: string;
    force?: boolean;
    /** Native agenda fingerprint shown when the user explicitly approved replacement. */
    expectedNativeFingerprint?: string | null;
};
export type SaveAgendaResult = { managedAgenda: ManagedAgenda; agenda: NativeAgenda; generatedItemCount: number; reconciliation?: AgendaReconciliation };

export type ApplicationDependencies = {
    events: ChurchToolsEventsAdapter;
    agendas: ChurchToolsAgendasAdapter;
    songs: ChurchToolsSongsAdapter;
    permissions: ChurchToolsPermissionsAdapter;
    state: JsonStateStore;
    resources: ResourceRegistry;
    lectionary?: LectionarySourceOptions;
    now?: () => string;
    importOptions?: Pick<HymnalImportOptions, 'concurrency'>;
};

export type HymnalOperationResult = { state: HymnalImportState; progress?: readonly { completed: number; failed: number; total: number; percent: number }[] };
export type HymnalUninstallResult = { plan: HymnalUninstallPlan; state?: HymnalUninstallState };

export type PermissionAdapter = Pick<ChurchToolsPermissionsAdapter, 'assertSongRead' | 'assertSongWrite' | 'assertAgendaRead' | 'assertAgendaWrite'>;
export type AppRepositories = { imports: HymnalImportStateRepository; managed: { get(eventId: number): Promise<ManagedAgenda | undefined>; save(state: ManagedAgenda): Promise<void>; delete(eventId: number): Promise<void> } };
export type OrganizationForEvent = OrganizationDefinition;
export type SuggestionOverride = { name?: string; color?: string; season?: string; sermonSeries?: string; readings?: Partial<LiturgicalDay['readings']>; weeklyPsalm?: string; weeklyHymn?: string };
export type Scripture = ScriptureReference;
