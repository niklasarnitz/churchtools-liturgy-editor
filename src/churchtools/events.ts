import type { NativeEvent } from './types';
import type { ChurchToolsRequestClient } from './request';

export type EventListQuery = {
    from?: string;
    to?: string;
    direction?: 'forward' | 'backward';
    limit?: number;
    page?: number;
    canceled?: boolean;
    include?: 'eventServices';
};

export class ChurchToolsEventsAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    list(query: EventListQuery = {}): Promise<NativeEvent[]> {
        return this.client.get<NativeEvent[]>('/events', query);
    }

    get(eventId: number): Promise<NativeEvent> {
        return this.client.get<NativeEvent>(`/events/${eventId}`);
    }
}
