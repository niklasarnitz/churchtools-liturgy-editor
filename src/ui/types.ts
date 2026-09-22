import type { NativeAgenda, NativeEvent } from '../churchtools';
import type { HymnalImportState } from '../domain/imports';
import type { ManagedAgenda } from '../domain/managed-agendas';

export type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type WorkspaceEvent = NativeEvent & { id: number; name: string; startDate: string };

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
};

export type WorkspaceSong = {
    id: number;
    name: string;
    author?: string | null;
    category?: { id?: number; name?: string };
    arrangements?: Array<{ id: number; name?: string; isDefault?: boolean }>;
};
