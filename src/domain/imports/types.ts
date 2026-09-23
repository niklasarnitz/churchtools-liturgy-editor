import type { HymnalDefinition } from '../../data/hymnals';

export type OperationStatus = 'pending' | 'running' | 'partially-completed' | 'completed' | 'failed';

export type ImportFailure = {
    hymnalSongId: string;
    message: string;
    kind?: string;
    attempts: number;
    updatedAt: string;
};

export type HymnalSongMapping = {
    hymnalSongId: string;
    churchToolsSongId: number;
    churchToolsArrangementId?: number;
    sourceFingerprint?: string;
    importedFingerprint: string;
    hymnalVersion: number;
    createdAt: string;
    updatedAt: string;
};

export type PendingSongCreate = {
    hymnalSongId: string;
    sourceFingerprint: string;
    startedAt: string;
};

export type HymnalImportState = {
    operationId: string;
    hymnalId: string;
    hymnalVersion: number;
    status: OperationStatus;
    total: number;
    completed: number;
    failed: number;
    mappings: Record<string, HymnalSongMapping>;
    pendingCreates?: Record<string, PendingSongCreate>;
    failures: ImportFailure[];
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
};

export interface HymnalImportStateRepository {
    load(hymnalId: string): Promise<HymnalImportState | undefined>;
    save(state: HymnalImportState): Promise<void>;
    delete(hymnalId: string): Promise<void>;
}

export interface HymnalImportLogger {
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
}

export const silentImportLogger: HymnalImportLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

export type ImportProgress = {
    operationId: string;
    status: OperationStatus;
    completed: number;
    failed: number;
    total: number;
    percent: number;
    hymnalSongId?: string;
};

export type HymnalImportOptions = {
    categoryId?: number;
    categoryName?: string;
    concurrency?: number;
    operationId?: string;
    now?: () => string;
    onProgress?: (progress: ImportProgress) => void | Promise<void>;
};

export type HymnalResource = Pick<HymnalDefinition, 'id' | 'version' | 'songs'>;
