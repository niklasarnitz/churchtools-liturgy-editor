import type { NativeAgenda, NativeEvent } from '../churchtools/types';
import type { ServiceStatus } from '../application/types';
import type { HymnalImportState } from '../domain/imports/types';
import type { ManagedAgenda } from '../domain/managed-agendas/types';
import type { AgendaDriftReason } from '../domain/reconciliation/fingerprint';

export type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type WorkspaceEventStatus = ServiceStatus | 'loading';

export type WorkspaceEvent = NativeEvent & { id: number; name: string; startDate: string; status: WorkspaceEventStatus; canEditAgenda?: boolean };

export const serviceStatusLabels: Record<WorkspaceEventStatus, string> = {
    loading: 'Ablauf wird geprüft …',
    'no-agenda': 'Noch kein Ablauf',
    managed: 'Vorhandener ChurchTools-Ablauf',
    complete: 'Vollständig',
    'externally-changed': 'Außerhalb der Extension verändert',
    unavailable: 'Nicht verfügbar',
};

export type ImportProgressView = {
    operation: 'install' | 'uninstall';
    hymnalId: string;
    completed: number;
    failed: number;
    total: number;
    percent: number;
    status: HymnalImportState['status'];
};

export type AgendaDriftView = {
    event: WorkspaceEvent;
    agenda?: NativeAgenda;
    managed: ManagedAgenda;
    reasons?: AgendaDriftReason[];
};

export type WorkspaceSong = {
    id: number;
    name: string;
    author?: string | null;
    category?: { id?: number; name?: string };
    arrangements?: WorkspaceArrangement[];
    hymnalName?: string;
    number?: string;
};

export type WorkspaceArrangement = { id: number; name?: string; isDefault?: boolean };
