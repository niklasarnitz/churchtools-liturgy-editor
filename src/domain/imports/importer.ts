import type { HymnalDefinition, HymnalSong } from '../../data/hymnals';
import { ChurchToolsError, toChurchToolsError } from '../../churchtools/errors';
import { mapWithConcurrency } from '../../churchtools/retry';
import type {
    NativeArrangement,
    NativeSong,
    NativeSongCategory,
    NativeSongCreate,
} from '../../churchtools/types';
import { hymnalSongFingerprint, nativeSongFingerprint } from './fingerprint';
import type {
    HymnalImportLogger,
    HymnalImportOptions,
    HymnalImportState,
    HymnalImportStateRepository,
    ImportFailure,
    ImportProgress,
    HymnalResource,
} from './types';
import { silentImportLogger } from './types';

export interface HymnalSongPort {
    listCategories(): Promise<NativeSongCategory[]>;
    createCategory(input: { name: string; sortKey?: number }): Promise<NativeSongCategory>;
    get(songId: number): Promise<NativeSong>;
    create(input: NativeSongCreate): Promise<NativeSong>;
    update(songId: number, input: NativeSongCreate): Promise<NativeSong>;
    delete(songId: number): Promise<void>;
    listArrangements(songId: number): Promise<NativeArrangement[]>;
    createArrangement(songId: number, input: { name: string; description?: string | null; isDefault?: boolean }): Promise<NativeArrangement>;
}

const nowIso = (): string => new Date().toISOString();

export class HymnalImporter {
    private readonly songs: HymnalSongPort;
    private readonly repository: HymnalImportStateRepository;
    private readonly logger: HymnalImportLogger;

    constructor(
        songs: HymnalSongPort,
        repository: HymnalImportStateRepository,
        logger: HymnalImportLogger = silentImportLogger,
    ) {
        this.songs = songs;
        this.repository = repository;
        this.logger = logger;
    }

    async import(hymnal: HymnalResource | HymnalDefinition, options: HymnalImportOptions = {}): Promise<HymnalImportState> {
        const now = options.now ?? nowIso;
        const operationId = options.operationId ?? `${hymnal.id}:${hymnal.version}`;
        const loaded = await this.repository.load(hymnal.id);
        const state = this.prepareState(loaded, hymnal, operationId, now());
        // Prove that operation metadata is writable before the first native
        // category or Song is created. Otherwise a user with Song rights but
        // without Custom-Module data rights could leave unmapped native data.
        await this.repository.save(state);
        const categoryId = await this.resolveCategory(hymnal, options.categoryId, options.categoryName);
        state.status = 'running';
        state.total = hymnal.songs.length;
        state.updatedAt = now();
        await this.repository.save(state);
        await this.emitProgress(state, options);

        const pending = hymnal.songs.filter((song) => {
            const mapping = state.mappings[song.id];
            return !mapping || mapping.churchToolsArrangementId === undefined || mapping.sourceFingerprint !== hymnalSongFingerprint(song);
        });
        const concurrency = Math.max(1, options.concurrency ?? 4);
        await mapWithConcurrency(pending, async (song) => {
            await this.importOne(song, hymnal, categoryId, state, options, now);
            return song.id;
        }, concurrency);

        state.completed = Object.keys(state.mappings).length;
        state.failed = state.failures.length;
        state.status = state.failed === 0 ? 'completed' : state.completed > 0 ? 'partially-completed' : 'failed';
        state.updatedAt = now();
        if (state.status === 'completed') state.completedAt = state.updatedAt;
        await this.repository.save(state);
        await this.emitProgress(state, options);
        return structuredClone(state);
    }

    private prepareState(
        previous: HymnalImportState | undefined,
        hymnal: HymnalResource,
        operationId: string,
        timestamp: string,
    ): HymnalImportState {
        if (previous) {
            return {
                ...structuredClone(previous),
                operationId,
                hymnalVersion: hymnal.version,
                status: 'pending',
                failures: [...previous.failures],
                mappings: { ...previous.mappings },
                pendingCreates: { ...previous.pendingCreates },
            };
        }
        return {
            operationId,
            hymnalId: hymnal.id,
            hymnalVersion: hymnal.version,
            status: 'pending',
            total: hymnal.songs.length,
            completed: 0,
            failed: 0,
            mappings: {},
            pendingCreates: {},
            failures: [],
            startedAt: timestamp,
            updatedAt: timestamp,
        };
    }

    private async resolveCategory(
        hymnal: HymnalResource,
        categoryId?: number,
        categoryName?: string,
    ): Promise<number> {
        if (categoryId !== undefined) return categoryId;
        const desiredName = categoryName ?? hymnal.id;
        const existing = (await this.songs.listCategories()).find((category) => category.name === desiredName);
        if (existing) return existing.id;
        return (await this.songs.createCategory({ name: desiredName, sortKey: 0 })).id;
    }

    private async importOne(
        song: HymnalSong,
        hymnal: HymnalResource,
        categoryId: number,
        state: HymnalImportState,
        options: HymnalImportOptions,
        now: () => string,
    ): Promise<void> {
        try {
            const previousMapping = state.mappings[song.id];
            const sourceFingerprint = hymnalSongFingerprint(song);
            let native: NativeSong;
            if (previousMapping) {
                native = await this.songs.get(previousMapping.churchToolsSongId);
            } else {
                if (state.pendingCreates?.[song.id]) {
                    throw new ChurchToolsError(
                        `Das Ergebnis des vorherigen ChurchTools-Create für ${song.id} ist unbekannt. Bitte den nativen Songbestand prüfen, bevor der Import fortgesetzt wird.`,
                        { kind: 'conflict', status: 409 },
                    );
                }
                state.pendingCreates ??= {};
                state.pendingCreates[song.id] = {
                    hymnalSongId: song.id,
                    sourceFingerprint,
                    startedAt: now(),
                };
                await this.repository.save(state);
                try {
                    native = await this.songs.create({
                        name: song.title,
                        categoryId,
                        author: song.author ?? null,
                        copyright: song.copyright ?? null,
                        ccli: song.ccli ?? null,
                        shouldPractice: false,
                    });
                } catch (error) {
                    const normalized = toChurchToolsError(error, `create song ${song.id}`);
                    if (isDefinitiveCreateRejection(normalized)) {
                        delete state.pendingCreates[song.id];
                        await this.repository.save(state);
                    }
                    throw normalized;
                }
            }
            const nativeFingerprintBeforeUpdate = nativeSongFingerprint(native);
            if (previousMapping && previousMapping.sourceFingerprint && previousMapping.sourceFingerprint !== sourceFingerprint) {
                if (previousMapping.importedFingerprint !== nativeFingerprintBeforeUpdate) {
                    throw new ChurchToolsError(
                        `Native Song ${previousMapping.churchToolsSongId} wurde seit dem Import verändert.`,
                        { kind: 'conflict', status: 409 },
                    );
                }
                native = await this.songs.update(previousMapping.churchToolsSongId, {
                    name: song.title,
                    categoryId,
                    author: song.author ?? null,
                    copyright: song.copyright ?? null,
                    ccli: song.ccli ?? null,
                    shouldPractice: false,
                });
            }
            const fingerprint = nativeSongFingerprint(native);
            if (previousMapping && !previousMapping.sourceFingerprint && previousMapping.importedFingerprint !== fingerprint) {
                throw new ChurchToolsError(
                    `Native Song ${previousMapping.churchToolsSongId} wurde seit dem Import verändert.`,
                    { kind: 'conflict', status: 409 },
                );
            }
            const createdAt = now();
            state.mappings[song.id] = {
                hymnalSongId: song.id,
                churchToolsSongId: native.id,
                sourceFingerprint,
                importedFingerprint: fingerprint,
                hymnalVersion: hymnal.version,
                createdAt: previousMapping?.createdAt ?? createdAt,
                updatedAt: createdAt,
            };
            delete state.pendingCreates?.[song.id];
            // Persist immediately after the native Song create. Arrangement
            // creation is a second request and must never cause a duplicate
            // Song on resume.
            await this.repository.save(state);
            const arrangement = await this.ensureDefaultArrangement(native);
            const timestamp = now();
            state.mappings[song.id] = {
                ...state.mappings[song.id],
                churchToolsArrangementId: arrangement?.id,
                updatedAt: timestamp,
            };
            state.failures = state.failures.filter((failure) => failure.hymnalSongId !== song.id);
            state.completed = Object.keys(state.mappings).length;
            state.failed = state.failures.length;
            state.updatedAt = timestamp;
            await this.repository.save(state);
            await this.emitProgress(state, options, song.id);
        } catch (error) {
            const normalized = toChurchToolsError(error, `create song ${song.id}`);
            const failure: ImportFailure = {
                hymnalSongId: song.id,
                message: normalized.message,
                kind: normalized.kind,
                attempts: 1,
                updatedAt: now(),
            };
            state.failures = [...state.failures.filter((entry) => entry.hymnalSongId !== song.id), failure];
            state.failed = state.failures.length;
            state.completed = Object.keys(state.mappings).length;
            state.status = state.completed > 0 ? 'partially-completed' : 'failed';
            state.updatedAt = failure.updatedAt;
            await this.repository.save(state);
            this.logger.warn('Hymnal song import failed', { hymnalSongId: song.id, error: normalized.kind });
            await this.emitProgress(state, options, song.id);
        }
    }

    private async ensureDefaultArrangement(song: NativeSong): Promise<NativeArrangement | undefined> {
        const existing = song.arrangements?.find((arrangement) => arrangement.isDefault) ?? song.arrangements?.[0];
        if (existing) return existing;
        const arrangements = await this.songs.listArrangements(song.id);
        const loaded = arrangements.find((arrangement) => arrangement.isDefault) ?? arrangements[0];
        if (loaded) return loaded;
        return this.songs.createArrangement(song.id, { name: 'Standard', isDefault: true });
    }

    private async emitProgress(
        state: HymnalImportState,
        options: HymnalImportOptions,
        hymnalSongId?: string,
    ): Promise<void> {
        const progress: ImportProgress = {
            operationId: state.operationId,
            status: state.status,
            completed: state.completed,
            failed: state.failed,
            total: state.total,
            percent: state.total === 0 ? 100 : Math.round((state.completed / state.total) * 100),
            hymnalSongId,
        };
        await options.onProgress?.(progress);
    }
}

function isDefinitiveCreateRejection(error: ChurchToolsError): boolean {
    return error.kind === 'unauthenticated'
        || error.kind === 'forbidden'
        || error.kind === 'not-found'
        || error.kind === 'conflict'
        || error.kind === 'validation'
        || error.kind === 'rate-limited';
}

export const importStateFingerprint = (state: HymnalImportState): string =>
    JSON.stringify({
        hymnalId: state.hymnalId,
        hymnalVersion: state.hymnalVersion,
        mappings: Object.values(state.mappings)
            .map((mapping) => [mapping.hymnalSongId, mapping.churchToolsSongId, mapping.churchToolsArrangementId])
            .sort(),
    });
