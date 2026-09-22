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
        for (const mapping of Object.values(state.mappings)) {
            await this.inspectMapping(mapping, sharedSongIds, candidates, conflicts);
        }
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
        options: { otherStates?: readonly HymnalImportState[]; now?: () => string } = {},
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
        const plan = await this.dryRun(hymnalId, options.otherStates);
        const timestamp = options.now ?? (() => new Date().toISOString());
        let completed = 0;
        let processed = 0;
        const sharedSongIds = new Set(
            (options.otherStates ?? [])
                .filter((other) => other.hymnalId !== hymnalId)
                .flatMap((other) => Object.values(other.mappings).map((mapping) => mapping.churchToolsSongId)),
        );
        state.status = 'running';
        await this.repository.save({ ...state, status: 'running', completed: 0, failed: plan.conflicts.length });
        for (const candidate of plan.candidates) {
            processed += 1;
            // Reload the mapping immediately before validating/deleting. A
            // stale in-memory snapshot must not turn a changed or removed
            // mapping into a destructive action.
            const latestState = await this.repository.load(hymnalId);
            if (latestState) state = latestState;
            const mapping = state.mappings[candidate.hymnalSongId];
            const revalidatedCandidates: UninstallCandidate[] = [];
            const revalidationConflicts: UninstallConflict[] = [];
            if (!mapping || mapping.churchToolsSongId !== candidate.churchToolsSongId) {
                revalidationConflicts.push({
                    hymnalSongId: candidate.hymnalSongId,
                    churchToolsSongId: candidate.churchToolsSongId,
                    reason: 'lookup-failed',
                    message: 'Das Import-Mapping ist vor dem Löschen nicht mehr unverändert vorhanden.',
                });
            } else {
                // The dry-run is advisory. Revalidate every destructive action
                // immediately before DELETE, including native identity/fingerprint,
                // shared ownership and complete event usage coverage.
                await this.inspectMapping(mapping, sharedSongIds, revalidatedCandidates, revalidationConflicts);
            }
            if (revalidationConflicts.length !== 0 || revalidatedCandidates.length !== 1) {
                const failed = plan.conflicts.length + processed - completed;
                await this.repository.save({
                    ...state,
                    status: 'running',
                    completed,
                    failed,
                    updatedAt: timestamp(),
                });
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
        await this.repository.save({
            ...state,
            status,
            completed,
            failed,
            updatedAt: result.updatedAt,
        });
        return result;
    }

    private async inspectMapping(
        mapping: HymnalSongMapping,
        sharedSongIds: Set<number>,
        candidates: UninstallCandidate[],
        conflicts: UninstallConflict[],
    ): Promise<void> {
        if (sharedSongIds.has(mapping.churchToolsSongId)) {
            conflicts.push({
                hymnalSongId: mapping.hymnalSongId,
                churchToolsSongId: mapping.churchToolsSongId,
                reason: 'shared-mapping',
                message: 'Der native Song ist noch einer weiteren importierten Ressource zugeordnet.',
            });
            return;
        }
        let song: NativeSong;
        try {
            song = await this.songs.get(mapping.churchToolsSongId);
        } catch (error) {
            const normalized = toChurchToolsError(error);
            conflicts.push({
                hymnalSongId: mapping.hymnalSongId,
                churchToolsSongId: mapping.churchToolsSongId,
                reason: normalized.kind === 'not-found' ? 'missing' : 'lookup-failed',
                message: normalized.message,
            });
            return;
        }
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
}
