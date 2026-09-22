import type { JsonStateStore } from '../../churchtools/customModuleStore';
import type { ManagedAgenda } from './types';

export class ManagedAgendaStateStore {
    private readonly store: JsonStateStore;
    private readonly keyPrefix: string;

    constructor(store: JsonStateStore, keyPrefix = 'managed-agenda') {
        this.store = store;
        this.keyPrefix = keyPrefix;
    }

    get(eventId: number): Promise<ManagedAgenda | undefined> {
        return this.store.get<ManagedAgenda>(`${this.keyPrefix}:${eventId}`);
    }

    save(state: ManagedAgenda): Promise<void> {
        return this.store.set(`${this.keyPrefix}:${state.eventId}`, state);
    }

    delete(eventId: number): Promise<void> {
        return this.store.delete(`${this.keyPrefix}:${eventId}`);
    }
}
