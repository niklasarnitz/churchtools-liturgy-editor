import type { ChurchToolsRequestClient } from './request';
import type { NativeAgenda, NativeAgendaItem, NativeAgendaItemInput, NativeAgendaUpsert, NativeSong } from './types';

export type AgendaItemPlacement = { beforeId?: number; afterId?: number };

function placementQuery(placement: AgendaItemPlacement): string {
    if (placement.beforeId !== undefined && placement.afterId !== undefined) {
        throw new Error('ChurchTools agenda items accept either before_id or after_id, not both.');
    }
    if (placement.beforeId !== undefined) return `?before_id=${placement.beforeId}`;
    if (placement.afterId !== undefined) return `?after_id=${placement.afterId}`;
    return '';
}

export class ChurchToolsAgendasAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    get(eventId: number): Promise<NativeAgenda> {
        return this.client.get<NativeAgenda>(`/events/${eventId}/agenda`);
    }

    upsert(eventId: number, agenda: NativeAgendaUpsert): Promise<NativeAgenda> {
        return this.client.put<NativeAgenda>(`/events/${eventId}/agenda`, agenda);
    }

    delete(eventId: number): Promise<void> {
        return this.client.deleteApi<void>(`/events/${eventId}/agenda`);
    }

    createItem(eventId: number, item: NativeAgendaItemInput, placement: AgendaItemPlacement = {}): Promise<NativeAgendaItem> {
        return this.client.post<NativeAgendaItem>(
            `/events/${eventId}/agenda/items${placementQuery(placement)}`,
            item,
        );
    }

    updateItem(
        eventId: number,
        itemId: number,
        item: NativeAgendaItemInput,
        placement: AgendaItemPlacement = {},
    ): Promise<NativeAgendaItem> {
        return this.client.put<NativeAgendaItem>(
            `/events/${eventId}/agenda/items/${itemId}${placementQuery(placement)}`,
            item,
        );
    }

    deleteItem(eventId: number, itemId: number): Promise<void> {
        return this.client.deleteApi<void>(`/events/${eventId}/agenda/items/${itemId}`);
    }

    listSongs(eventId: number): Promise<NativeSong[]> {
        return this.client.get<NativeSong[]>(`/events/${eventId}/agenda/songs`);
    }
}

/**
 * Checks usage through the documented per-event agenda song endpoint. The
 * caller supplies the event ids it is allowed to inspect; there is no global
 * "song usage" endpoint in the current REST contract.
 */
export class ChurchToolsAgendaSongUsageChecker {
    private readonly eventIds: readonly number[];
    private readonly agendas: ChurchToolsAgendasAdapter;

    constructor(agendas: ChurchToolsAgendasAdapter, eventIds: readonly number[]) {
        this.agendas = agendas;
        this.eventIds = eventIds;
    }

    async isSongUsed(songId: number): Promise<boolean> {
        if (this.eventIds.length === 0) {
            throw new Error('Song usage cannot be proven without event ids.');
        }
        for (const eventId of this.eventIds) {
            const songs = await this.agendas.listSongs(eventId);
            if (songs.some((song) => song.id === songId)) return true;
        }
        return false;
    }
}
