import type {
    GetEventsIdAgendaResponse,
    GetEventsIdResponse,
    GetPermissionsGlobalResponse,
    GetSongCategoriesResponse,
    GetSongsSongIdResponse,
    PostEventsIdAgendaItemsData,
    PostEventsIdAgendaItemsResponse,
    PostSongsData,
    PostSongsSongIdArrangementsData,
    PostSongsSongIdArrangementsResponse,
    PutEventsIdAgendaData,
} from '@churchtools/api-types';

/** The subset of an event used by the liturgy editor. */
type ApiEvent = GetEventsIdResponse['data'];
export type NativeEvent = Omit<Partial<ApiEvent>, 'id' | 'calendar'> & Pick<ApiEvent, 'id' | 'calendar'>;

/**
 * Compatibility fields keep the existing domain adapter contract while the
 * underlying item shape comes from the generated REST response.
 */
type ApiAgendaItem = PostEventsIdAgendaItemsResponse['data'];
type ApiAgendaContentItem = Extract<ApiAgendaItem, { type: 'text' | 'song' }>;
type ApiAgendaSongItem = Extract<ApiAgendaItem, { type: 'song' }>;
type ApiAgendaSong = NonNullable<ApiAgendaSongItem['song']>;

export type NativeAgendaItem = {
    id: ApiAgendaItem['id'];
    type: ApiAgendaItem['type'];
    title: ApiAgendaItem['title'] | null;
    duration?: ApiAgendaItem['duration'];
    note?: ApiAgendaContentItem['note'] | null;
    responsible?: ApiAgendaContentItem['responsible'] | string | null;
    arrangementId?: ApiAgendaSong['arrangementId'] | null;
    songId?: ApiAgendaSong['songId'] | null;
    song?: Partial<ApiAgendaSong> | null;
    position?: ApiAgendaItem['position'];
    start?: ApiAgendaItem['start'];
    isBeforeEvent?: ApiAgendaItem['isBeforeEvent'];
};

type ApiAgenda = GetEventsIdAgendaResponse['data'];
export type NativeAgenda = Omit<Partial<ApiAgenda>, 'id' | 'calendarId' | 'items'>
    & Pick<ApiAgenda, 'id' | 'calendarId'> & {
    items: Array<NativeAgendaItem>;
};

export type NativeAgendaItemInput = PostEventsIdAgendaItemsData['body'];
export type NativeAgendaUpsert = Omit<PutEventsIdAgendaData['body'], 'series'> & {
    series?: PutEventsIdAgendaData['body']['series'] | null;
};

type ApiSong = GetSongsSongIdResponse['data'];
export type NativeSong = Omit<Partial<ApiSong>, 'id' | 'name'> & Pick<ApiSong, 'id' | 'name'>;

type ApiSongCategory = GetSongCategoriesResponse['data'][number];
export type NativeSongCategory = ApiSongCategory & Required<Pick<ApiSongCategory, 'id' | 'name'>>;

export type NativeArrangement = PostSongsSongIdArrangementsResponse['data'];

/** Adapter convenience: the default flag is applied through the dedicated PATCH endpoint. */
export type NativeArrangementCreate = PostSongsSongIdArrangementsData['body'] & {
    isDefault?: boolean;
};

export type NativeSongCreate = PostSongsData['body'];
export type NativeGlobalPermissions = GetPermissionsGlobalResponse['data'];
