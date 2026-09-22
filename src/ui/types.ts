import type { NativeAgenda, NativeEvent } from '../churchtools';
import type { ServiceStatus } from '../application/types';
import type { HymnalImportState } from '../domain/imports';
import type { ManagedAgenda } from '../domain/managed-agendas';
import type { AgendaDriftReason } from '../domain/reconciliation/fingerprint';

export type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type WorkspaceEvent = NativeEvent & { id: number; name: string; startDate: string; status: ServiceStatus };

export const serviceStatusLabels: Record<ServiceStatus, string> = {
    'no-agenda': 'Noch kein Ablauf',
    managed: 'Liturgie vorbereitet',
    complete: 'Vollständig',
    'externally-changed': 'Außerhalb der Extension verändert',
    unavailable: 'Nicht verfügbar',
};

export type ImportProgressView = {
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
    arrangements?: Array<{ id: number; name?: string; isDefault?: boolean }>;
    hymnalName?: string;
    number?: string;
};
