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
        const state = await this.repository.load(hymnalId);
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
        for (const candidate of plan.candidates) {
            try {
                await this.songs.delete(candidate.churchToolsSongId);
                const mapping = state.mappings[candidate.hymnalSongId];
                if (mapping) delete state.mappings[candidate.hymnalSongId];
                completed += 1;
                state.updatedAt = timestamp();
                await this.repository.save({
                    ...state,
                    status: 'running',
                    completed,
                    failed: 0,
                    updatedAt: state.updatedAt,
                });
            } catch {
                // Keep the mapping when deletion fails; a later dry-run can retry safely.
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
