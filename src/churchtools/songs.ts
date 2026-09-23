import type {
    DeleteSongCategoriesIdResponse,
    DeleteSongsSongIdArrangementsArrangementIdResponse,
    DeleteSongsSongIdResponse,
    GetSongCategoriesResponse,
    GetSongsData,
    GetSongsResponse,
    GetSongsSongIdArrangementsResponse,
    GetSongsSongIdData,
    GetSongsSongIdResponse,
    PatchSongsSongIdArrangementsArrangementIdDefaultResponse,
    PostSongCategoriesData,
    PostSongCategoriesResponse,
    PostSongsData,
    PostSongsResponse,
    PostSongsSongIdArrangementsData,
    PostSongsSongIdArrangementsResponse,
    PutSongCategoriesIdData,
    PutSongCategoriesIdResponse,
    PutSongsSongIdArrangementsArrangementIdData,
    PutSongsSongIdArrangementsArrangementIdResponse,
    PutSongsSongIdData,
    PutSongsSongIdResponse,
} from '@churchtools/api-types';
import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsError } from './errors';
import type {
    NativeArrangement,
    NativeArrangementCreate,
    NativeSong,
    NativeSongCategory,
    NativeSongCreate,
} from './types';

type OpenApiSongListQuery = NonNullable<GetSongsData['query']>;

export type SongListQuery = Omit<OpenApiSongListQuery, 'ids[]' | 'song_category_ids[]'> & {
    ids?: OpenApiSongListQuery['ids[]'];
    song_category_ids?: OpenApiSongListQuery['song_category_ids[]'];
};

function normalizeSongListQuery(query: SongListQuery): OpenApiSongListQuery {
    const { ids, song_category_ids: songCategoryIds, ...rest } = query;
    const requestQuery: OpenApiSongListQuery = { ...rest };
    if (ids) requestQuery['ids[]'] = ids;
    if (songCategoryIds) requestQuery['song_category_ids[]'] = songCategoryIds;
    return requestQuery;
}

function requireNativeSongCategory(
    category: GetSongCategoriesResponse['data'][number],
): NativeSongCategory {
    if (category.id === undefined || category.name === undefined) {
        throw new ChurchToolsError('ChurchTools returned a song category without id or name.', { kind: 'unknown' });
    }
    return { ...category, id: category.id, name: category.name };
}

export class ChurchToolsSongsAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    list(query: SongListQuery = {}): Promise<NativeSong[]> {
        const requestQuery: GetSongsData['query'] = normalizeSongListQuery(query);
        return this.client.get<GetSongsResponse['data']>('/songs', requestQuery);
    }

    get(
        songId: number,
        include: NonNullable<GetSongsSongIdData['query']>['include'] = ['arrangements'],
    ): Promise<NativeSong> {
        const query: GetSongsSongIdData['query'] = { include };
        return this.client.get<GetSongsSongIdResponse['data']>(`/songs/${songId}`, query);
    }

    create(input: NativeSongCreate): Promise<NativeSong> {
        const body: PostSongsData['body'] = input;
        return this.client.post<PostSongsResponse['data']>('/songs', body);
    }

    update(songId: number, input: NativeSongCreate): Promise<NativeSong> {
        const body: PutSongsSongIdData['body'] = input;
        return this.client.put<PutSongsSongIdResponse['data']>(`/songs/${songId}`, body);
    }

    delete(songId: number): Promise<void> {
        return this.client.deleteApi<DeleteSongsSongIdResponse>(`/songs/${songId}`);
    }

    async listCategories(): Promise<NativeSongCategory[]> {
        const categories = await this.client.get<GetSongCategoriesResponse['data']>('/song/categories');
        return categories.map(requireNativeSongCategory);
    }

    async createCategory(input: PostSongCategoriesData['body']): Promise<NativeSongCategory> {
        const body: PostSongCategoriesData['body'] = input;
        const category = await this.client.post<PostSongCategoriesResponse['data']>('/song/categories', body);
        return requireNativeSongCategory(category);
    }

    async updateCategory(categoryId: number, input: PutSongCategoriesIdData['body']): Promise<NativeSongCategory> {
        const body: PutSongCategoriesIdData['body'] = input;
        const category = await this.client.put<PutSongCategoriesIdResponse['data']>(`/song/categories/${categoryId}`, body);
        return requireNativeSongCategory(category);
    }

    deleteCategory(categoryId: number): Promise<void> {
        return this.client.deleteApi<DeleteSongCategoriesIdResponse>(`/song/categories/${categoryId}`);
    }

    listArrangements(songId: number): Promise<NativeArrangement[]> {
        return this.client.get<GetSongsSongIdArrangementsResponse['data']>(`/songs/${songId}/arrangements`);
    }

    async createArrangement(songId: number, input: NativeArrangementCreate): Promise<NativeArrangement> {
        const { isDefault, ...arrangementInput } = input;
        const body: PostSongsSongIdArrangementsData['body'] = arrangementInput;
        const arrangement = await this.client.post<PostSongsSongIdArrangementsResponse['data']>(
            `/songs/${songId}/arrangements`,
            body,
        );
        if (!isDefault) return arrangement;
        await this.makeDefaultArrangement(songId, arrangement.id);
        return { ...arrangement, isDefault: true };
    }

    updateArrangement(
        songId: number,
        arrangementId: number,
        input: PutSongsSongIdArrangementsArrangementIdData['body'],
    ): Promise<NativeArrangement> {
        const body: PutSongsSongIdArrangementsArrangementIdData['body'] = input;
        return this.client.put<PutSongsSongIdArrangementsArrangementIdResponse['data']>(
            `/songs/${songId}/arrangements/${arrangementId}`,
            body,
        );
    }

    deleteArrangement(songId: number, arrangementId: number): Promise<void> {
        return this.client.deleteApi<DeleteSongsSongIdArrangementsArrangementIdResponse>(
            `/songs/${songId}/arrangements/${arrangementId}`,
        );
    }

    makeDefaultArrangement(songId: number, arrangementId: number): Promise<void> {
        if (!this.client.patch) {
            return Promise.reject(new ChurchToolsError('The configured ChurchTools client does not support PATCH.', { kind: 'unknown' }));
        }
        return this.client.patch<PatchSongsSongIdArrangementsArrangementIdDefaultResponse>(
            `/songs/${songId}/arrangements/${arrangementId}/default`,
        );
    }
}
