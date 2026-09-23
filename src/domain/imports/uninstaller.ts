import type { NativeSong } from '../../churchtools/types';
import { toChurchToolsError } from '../../churchtools/errors';
import { nativeSongFingerprint } from './fingerprint';
import type { HymnalImportState, HymnalImportStateRepository, HymnalSongMapping, OperationStatus } from './types';
import type { HymnalSongPort } from './importer';

export type UninstallConflictReason = 'missing' | 'modified' | 'in-use' | 'shared-mapping' | 'lookup-failed';

export type UninstallConflict = {
    hymnalSongId: string;
    churchToolsSongId: number;
    reason: UninstallConflictReason;
    message: string;
};

export type UninstallCandidate = {
    hymnalSongId: string;
    churchToolsSongId: number;
};

export type HymnalUsageCoverage = {
    complete: boolean;
    reason?: string;
};

export type HymnalUninstallPlan = {
    hymnalId: string;
    dryRun: true;
    candidates: UninstallCandidate[];
    conflicts: UninstallConflict[];
    safeCount: number;
    conflictCount: number;
};

export type HymnalUninstallState = {
    operationId: string;
    hymnalId: string;
    status: OperationStatus;
    total: number;
    completed: number;
    failed: number;
    updatedAt: string;
};

export type UninstallProgress = Pick<HymnalUninstallState, 'status' | 'total' | 'completed' | 'failed'> & {
    percent: number;
    hymnalSongId?: string;
};

export interface HymnalUsageChecker {
    isSongUsed(songId: number): Promise<boolean>;
    /**
     * Returns whether the checker has inspected the complete event universe.
     * Implementations which cannot prove this must return `complete: false`.
     */
    getCoverage?(): Promise<HymnalUsageCoverage>;
}

export class HymnalUninstaller {
    private readonly songs: HymnalSongPort;
    private readonly repository: HymnalImportStateRepository;
    private readonly usageChecker?: HymnalUsageChecker;

    constructor(
        songs: HymnalSongPort,
        repository: HymnalImportStateRepository,
        usageChecker?: HymnalUsageChecker,
    ) {
        this.songs = songs;
        this.repository = repository;
        this.usageChecker = usageChecker;
    }

    async dryRun(hymnalId: string, otherStates: readonly HymnalImportState[] = []): Promise<HymnalUninstallPlan> {
        const state = await this.repository.load(hymnalId);
        if (!state) {
            return { hymnalId, dryRun: true, candidates: [], conflicts: [], safeCount: 0, conflictCount: 0 };
        }
        const sharedSongIds = new Set(
            otherStates
                .filter((other) => other.hymnalId !== hymnalId)
                .flatMap((other) => Object.values(other.mappings).map((mapping) => mapping.churchToolsSongId)),
        );
        const candidates: UninstallCandidate[] = [];
        const conflicts: UninstallConflict[] = [];
        await this.inspectMappings(Object.values(state.mappings), sharedSongIds, candidates, conflicts);
        return {
            hymnalId,
            dryRun: true,
            candidates,
            conflicts,
            safeCount: candidates.length,
            conflictCount: conflicts.length,
        };
    }

    async uninstall(
        hymnalId: string,
        options: {
            otherStates?: readonly HymnalImportState[];
            now?: () => string;
            plan?: HymnalUninstallPlan;
            onProgress?: (progress: UninstallProgress) => void | Promise<void>;
        } = {},
    ): Promise<HymnalUninstallState> {
        let state = await this.repository.load(hymnalId);
        if (!state) {
            return {
                operationId: `uninstall:${hymnalId}`,
                hymnalId,
                status: 'completed',
                total: 0,
                completed: 0,
                failed: 0,
                updatedAt: (options.now ?? (() => new Date().toISOString()))(),
            };
        }
        const plan = options.plan ?? await this.dryRun(hymnalId, options.otherStates);
        const timestamp = options.now ?? (() => new Date().toISOString());
        let completed = 0;
        let processed = 0;
        state.status = 'running';
        await this.repository.save({ ...state, status: 'running', completed: 0, failed: plan.conflicts.length });
        await this.emitProgress(plan.candidates.length + plan.conflicts.length, completed, plan.conflicts.length, 'running', options);
        for (const candidate of plan.candidates) {
            processed += 1;
            const latestState = await this.repository.load(hymnalId);
            if (latestState) state = latestState;
            const mapping = state.mappings[candidate.hymnalSongId];
            if (!mapping || mapping.churchToolsSongId !== candidate.churchToolsSongId) {
                const failed = plan.conflicts.length + processed - completed;
                await this.repository.save({
                    ...state,
                    status: 'running',
                    completed,
                    failed,
                    updatedAt: timestamp(),
                });
                await this.emitProgress(plan.candidates.length + plan.conflicts.length, completed, failed, 'running', options, candidate.hymnalSongId);
                continue;
            }
            try {
                await this.songs.delete(candidate.churchToolsSongId);
                delete state.mappings[candidate.hymnalSongId];
                completed += 1;
                state.updatedAt = timestamp();
                await this.repository.save({
                    ...state,
                    status: 'running',
                    completed,
                    failed: plan.conflicts.length + processed - completed,
                    updatedAt: state.updatedAt,
                });
                await this.emitProgress(plan.candidates.length + plan.conflicts.length, completed, plan.conflicts.length + processed - completed, 'running', options, candidate.hymnalSongId);
            } catch {
                // Keep the mapping when deletion fails; a later dry-run can retry safely.
                const failed = plan.conflicts.length + processed - completed;
                await this.repository.save({
                    ...state,
                    status: 'running',
                    completed,
                    failed,
                    updatedAt: timestamp(),
                });
                await this.emitProgress(plan.candidates.length + plan.conflicts.length, completed, failed, 'running', options, candidate.hymnalSongId);
            }
        }
        const failed = plan.candidates.length - completed + plan.conflicts.length;
        const status: OperationStatus =
            failed === 0 ? 'completed' : completed > 0 ? 'partially-completed' : 'failed';
        const result: HymnalUninstallState = {
            operationId: `uninstall:${hymnalId}`,
            hymnalId,
            status,
            total: plan.candidates.length + plan.conflicts.length,
            completed,
            failed,
            updatedAt: timestamp(),
        };
        if (Object.keys(state.mappings).length === 0) {
            await this.repository.delete(hymnalId);
        } else {
            await this.repository.save({
                ...state,
                status,
                completed,
                failed,
                updatedAt: result.updatedAt,
            });
        }
        await this.emitProgress(result.total, result.completed, result.failed, result.status, options);
        return result;
    }

    private async inspectMappings(
        mappings: HymnalSongMapping[],
        sharedSongIds: Set<number>,
        candidates: UninstallCandidate[],
        conflicts: UninstallConflict[],
    ): Promise<void> {
        const inspectable: HymnalSongMapping[] = [];
        for (const mapping of mappings) {
            if (sharedSongIds.has(mapping.churchToolsSongId)) {
                conflicts.push({
                    hymnalSongId: mapping.hymnalSongId,
                    churchToolsSongId: mapping.churchToolsSongId,
                    reason: 'shared-mapping',
                    message: 'Der native Song ist noch einer weiteren importierten Ressource zugeordnet.',
                });
            } else {
                inspectable.push(mapping);
            }
        }

        const nativeSongs = new Map<number, NativeSong>();
        const failedIds = new Map<number, string>();
        for (let offset = 0; offset < inspectable.length; offset += 200) {
            const batch = inspectable.slice(offset, offset + 200);
            try {
                const songs = await this.songs.list({
                    ids: batch.map((mapping) => mapping.churchToolsSongId),
                    include: ['arrangements'],
                    limit: 200,
                });
                for (const song of songs) nativeSongs.set(song.id, song);
            } catch (error) {
                const message = toChurchToolsError(error).message;
                for (const mapping of batch) failedIds.set(mapping.churchToolsSongId, message);
            }
        }

        for (const mapping of inspectable) {
            const song = nativeSongs.get(mapping.churchToolsSongId);
            const lookupFailure = failedIds.get(mapping.churchToolsSongId);
            if (!song) {
                conflicts.push({
                    hymnalSongId: mapping.hymnalSongId,
                    churchToolsSongId: mapping.churchToolsSongId,
                    reason: lookupFailure ? 'lookup-failed' : 'missing',
                    message: lookupFailure ?? 'Der gemappte native Song wurde nicht gefunden.',
                });
                continue;
            }
            await this.inspectLoadedMapping(mapping, song, candidates, conflicts);
        }
    }

    private async inspectLoadedMapping(
        mapping: HymnalSongMapping,
        song: NativeSong,
        candidates: UninstallCandidate[],
        conflicts: UninstallConflict[],
    ): Promise<void> {
        if (nativeSongFingerprint(song) !== mapping.importedFingerprint) {
            conflicts.push({
                hymnalSongId: mapping.hymnalSongId,
                churchToolsSongId: mapping.churchToolsSongId,
                reason: 'modified',
                message: 'Der native Song wurde seit dem Import verändert.',
            });
            return;
        }
        if (this.usageChecker) {
            try {
                const coverage = await this.usageChecker.getCoverage?.();
                if (!coverage?.complete) {
                    conflicts.push({
                        hymnalSongId: mapping.hymnalSongId,
                        churchToolsSongId: mapping.churchToolsSongId,
                        reason: 'lookup-failed',
                        message:
                            coverage?.reason ??
                            'Die vollständige Event-Abdeckung der Nutzungsprüfung konnte nicht nachgewiesen werden.',
                    });
                    return;
                }
                if (await this.usageChecker.isSongUsed(mapping.churchToolsSongId)) {
                    conflicts.push({
                        hymnalSongId: mapping.hymnalSongId,
                        churchToolsSongId: mapping.churchToolsSongId,
                        reason: 'in-use',
                        message: 'Der native Song wird aktuell in einem Ablauf verwendet.',
                    });
                    return;
                }
            } catch (error) {
                conflicts.push({
                    hymnalSongId: mapping.hymnalSongId,
                    churchToolsSongId: mapping.churchToolsSongId,
                    reason: 'lookup-failed',
                    message: toChurchToolsError(error).message,
                });
                return;
            }
        } else {
            conflicts.push({
                hymnalSongId: mapping.hymnalSongId,
                churchToolsSongId: mapping.churchToolsSongId,
                reason: 'lookup-failed',
                message: 'Vor dem Löschen muss die Verwendung in nativen Abläufen geprüft werden.',
            });
            return;
        }
        candidates.push({ hymnalSongId: mapping.hymnalSongId, churchToolsSongId: mapping.churchToolsSongId });
    }

    private async emitProgress(
        total: number,
        completed: number,
        failed: number,
        status: OperationStatus,
        options: { onProgress?: (progress: UninstallProgress) => void | Promise<void> },
        hymnalSongId?: string,
    ): Promise<void> {
        await options.onProgress?.({
            status,
            total,
            completed,
            failed,
            percent: total === 0 ? 100 : Math.round(((completed + failed) / total) * 100),
            hymnalSongId,
        });
    }
}
