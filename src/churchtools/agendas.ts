import type {
    DeleteEventsIdAgendaItemsIdResponse,
    DeleteEventsIdAgendaResponse,
    GetEventsIdAgendaResponse,
    GetEventsIdAgendaSongsResponse,
    PostEventsIdAgendaItemsData,
    PostEventsIdAgendaItemsResponse,
    PutEventsIdAgendaData,
    PutEventsIdAgendaItemsIdData,
    PutEventsIdAgendaItemsIdResponse,
    PutEventsIdAgendaResponse,
} from '@churchtools/api-types';
import type { ChurchToolsRequestClient } from './request';
import type { NativeAgenda, NativeAgendaItem, NativeAgendaItemInput, NativeAgendaUpsert, NativeSong } from './types';

type AgendaItemPlacementQuery = NonNullable<PostEventsIdAgendaItemsData['query']>
    & NonNullable<PutEventsIdAgendaItemsIdData['query']>;

export type AgendaItemPlacement = {
    beforeId?: AgendaItemPlacementQuery['before_id'];
    afterId?: AgendaItemPlacementQuery['after_id'];
};

function placementQuery(placement: AgendaItemPlacement): AgendaItemPlacementQuery {
    if (placement.beforeId !== undefined && placement.afterId !== undefined) {
        throw new Error('ChurchTools agenda items accept either before_id or after_id, not both.');
    }
    if (placement.beforeId !== undefined) return { before_id: placement.beforeId };
    if (placement.afterId !== undefined) return { after_id: placement.afterId };
    return {};
}

function placementSuffix(query: AgendaItemPlacementQuery): string {
    if (query.before_id !== undefined) return `?before_id=${query.before_id}`;
    if (query.after_id !== undefined) return `?after_id=${query.after_id}`;
    return '';
}

export class ChurchToolsAgendasAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    get(eventId: number): Promise<NativeAgenda> {
        return this.client.get<GetEventsIdAgendaResponse['data']>(`/events/${eventId}/agenda`);
    }

    upsert(eventId: number, agenda: NativeAgendaUpsert): Promise<NativeAgenda> {
        const { series, ...agendaBody } = agenda;
        const body: PutEventsIdAgendaData['body'] = {
            ...agendaBody,
            ...(series === null ? {} : { series }),
        };
        return this.client.put<PutEventsIdAgendaResponse['data']>(`/events/${eventId}/agenda`, body);
    }

    delete(eventId: number): Promise<void> {
        return this.client.deleteApi<DeleteEventsIdAgendaResponse>(`/events/${eventId}/agenda`);
    }

    createItem(eventId: number, item: NativeAgendaItemInput, placement: AgendaItemPlacement = {}): Promise<NativeAgendaItem> {
        const body: PostEventsIdAgendaItemsData['body'] = item;
        const query: PostEventsIdAgendaItemsData['query'] = placementQuery(placement);
        return this.client.post<PostEventsIdAgendaItemsResponse['data']>(
            `/events/${eventId}/agenda/items${placementSuffix(query)}`,
            body,
        );
    }

    updateItem(
        eventId: number,
        itemId: number,
        item: NativeAgendaItemInput,
        placement: AgendaItemPlacement = {},
    ): Promise<NativeAgendaItem> {
        const body: PutEventsIdAgendaItemsIdData['body'] = item;
        const query: PutEventsIdAgendaItemsIdData['query'] = placementQuery(placement);
        return this.client.put<PutEventsIdAgendaItemsIdResponse['data']>(
            `/events/${eventId}/agenda/items/${itemId}${placementSuffix(query)}`,
            body,
        );
    }

    deleteItem(eventId: number, itemId: number): Promise<void> {
        return this.client.deleteApi<DeleteEventsIdAgendaItemsIdResponse>(`/events/${eventId}/agenda/items/${itemId}`);
    }

    listSongs(eventId: number): Promise<NativeSong[]> {
        return this.client.get<GetEventsIdAgendaSongsResponse['data']>(`/events/${eventId}/agenda/songs`);
    }
}

/**
 * Describes the event universe inspected by a usage checker.
 *
 * A false value is intentionally conservative: an empty or partially paged
 * event query must never be interpreted as proof that a song is unused.
 */
export type AgendaSongUsageCoverage = {
    complete: boolean;
    checkedEventIds?: readonly number[];
    reason?: string;
};

/**
 * Checks usage through the documented per-event agenda song endpoint. The
 * caller supplies the event ids it is allowed to inspect; there is no global
 * "song usage" endpoint in the current REST contract.
 */
export class ChurchToolsAgendaSongUsageChecker {
    private readonly eventIds: readonly number[];
    private readonly agendas: ChurchToolsAgendasAdapter;
    private readonly coverage: AgendaSongUsageCoverage;
    private usedSongIds?: Promise<Set<number>>;

    constructor(
        agendas: ChurchToolsAgendasAdapter,
        eventIds: readonly number[],
        coverage: AgendaSongUsageCoverage = {
            complete: false,
            reason: 'Die Event-Abdeckung der Nutzungsprüfung wurde nicht bestätigt.',
        },
    ) {
        this.agendas = agendas;
        this.eventIds = eventIds;
        this.coverage = {
            ...coverage,
            checkedEventIds: coverage.checkedEventIds ?? eventIds,
        };
    }

    getCoverage(): Promise<AgendaSongUsageCoverage> {
        return Promise.resolve({
            ...this.coverage,
            checkedEventIds: this.coverage.checkedEventIds ? [...this.coverage.checkedEventIds] : undefined,
        });
    }

    async isSongUsed(songId: number): Promise<boolean> {
        if (!this.coverage.complete) throw new Error(this.coverage.reason ?? 'Song usage coverage is incomplete.');
        this.usedSongIds ??= this.loadUsedSongIds();
        return (await this.usedSongIds).has(songId);
    }

    private async loadUsedSongIds(): Promise<Set<number>> {
        const usedSongIds = new Set<number>();
        for (const eventId of this.eventIds) {
            const songs = await this.agendas.listSongs(eventId);
            for (const song of songs) usedSongIds.add(song.id);
        }
        return usedSongIds;
    }
}
