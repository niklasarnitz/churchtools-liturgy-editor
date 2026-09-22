import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsError } from './errors';
import type {
    NativeArrangement,
    NativeArrangementCreate,
    NativeSong,
    NativeSongCategory,
    NativeSongCreate,
} from './types';

export type SongListQuery = {
    query?: string;
    name?: string;
    ids?: number[];
    song_category_ids?: number[];
    include?: Array<'arrangements' | 'tags'>;
    limit?: number;
    page?: number;
};

export class ChurchToolsSongsAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    list(query: SongListQuery = {}): Promise<NativeSong[]> {
        const params: Record<string, unknown> = { ...query };
        if (query.ids) params['ids[]'] = query.ids;
        if (query.song_category_ids) params['song_category_ids[]'] = query.song_category_ids;
        return this.client.get<NativeSong[]>('/songs', params);
    }

    get(songId: number, include: Array<'arrangements' | 'tags'> = ['arrangements']): Promise<NativeSong> {
        return this.client.get<NativeSong>(`/songs/${songId}`, { include });
    }

    create(input: NativeSongCreate): Promise<NativeSong> {
        return this.client.post<NativeSong>('/songs', input);
    }

    update(songId: number, input: NativeSongCreate): Promise<NativeSong> {
        return this.client.put<NativeSong>(`/songs/${songId}`, input);
    }

    delete(songId: number): Promise<void> {
        return this.client.deleteApi<void>(`/songs/${songId}`);
    }

    listCategories(): Promise<NativeSongCategory[]> {
        return this.client.get<NativeSongCategory[]>('/song/categories');
    }

    createCategory(input: { name: string; campusId?: number | null; sortKey?: number }): Promise<NativeSongCategory> {
        return this.client.post<NativeSongCategory>('/song/categories', input);
    }

    updateCategory(categoryId: number, input: { name: string; campusId?: number | null; sortKey?: number }): Promise<NativeSongCategory> {
        return this.client.put<NativeSongCategory>(`/song/categories/${categoryId}`, input);
    }

    deleteCategory(categoryId: number): Promise<void> {
        return this.client.deleteApi<void>(`/song/categories/${categoryId}`);
    }

    listArrangements(songId: number): Promise<NativeArrangement[]> {
        return this.client.get<NativeArrangement[]>(`/songs/${songId}/arrangements`);
    }

    createArrangement(songId: number, input: NativeArrangementCreate): Promise<NativeArrangement> {
        return this.client.post<NativeArrangement>(`/songs/${songId}/arrangements`, input);
    }

    updateArrangement(songId: number, arrangementId: number, input: NativeArrangementCreate): Promise<NativeArrangement> {
        return this.client.put<NativeArrangement>(`/songs/${songId}/arrangements/${arrangementId}`, input);
    }

    deleteArrangement(songId: number, arrangementId: number): Promise<void> {
        return this.client.deleteApi<void>(`/songs/${songId}/arrangements/${arrangementId}`);
    }

    makeDefaultArrangement(songId: number, arrangementId: number): Promise<void> {
        if (!this.client.patch) {
            return Promise.reject(new ChurchToolsError('The configured ChurchTools client does not support PATCH.', { kind: 'unknown' }));
        }
        return this.client.patch<void>(`/songs/${songId}/arrangements/${arrangementId}/default`, {});
    }
}
