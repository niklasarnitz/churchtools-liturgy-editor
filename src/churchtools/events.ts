import type {
    GetEventsData,
    GetEventsIdResponse,
    GetEventsResponse,
} from '@churchtools/api-types';
import type { NativeEvent } from './types';
import type { ChurchToolsRequestClient } from './request';

export type EventListQuery = NonNullable<GetEventsData['query']>;

export class ChurchToolsEventsAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    list(query: EventListQuery = {}): Promise<NativeEvent[]> {
        const requestQuery: GetEventsData['query'] = query;
        return this.client.get<GetEventsResponse['data']>('/events', requestQuery);
    }

    get(eventId: number): Promise<NativeEvent> {
        return this.client.get<GetEventsIdResponse['data']>(`/events/${eventId}`);
    }
}
