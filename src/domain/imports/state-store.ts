import type { JsonStateStore } from '../../churchtools/customModuleStore';
import type { HymnalImportState, HymnalImportStateRepository } from './types';

export class JsonHymnalImportStateRepository implements HymnalImportStateRepository {
    private readonly store: JsonStateStore;
    private readonly keyPrefix: string;

    constructor(store: JsonStateStore, keyPrefix = 'hymnal-import') {
        this.store = store;
        this.keyPrefix = keyPrefix;
    }

    load(hymnalId: string): Promise<HymnalImportState | undefined> {
        return this.store.get<HymnalImportState>(`${this.keyPrefix}:${hymnalId}`);
    }

    save(state: HymnalImportState): Promise<void> {
        return this.store.set(`${this.keyPrefix}:${state.hymnalId}`, state);
    }
}
