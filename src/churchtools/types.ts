import type { Arrangement, Event, GlobalPermissions, Song, SongCategory } from '../utils/ct-types';

/** The subset of an event used by the liturgy editor. */
export type NativeEvent = Event & { id: number; calendar?: { id?: number } };

/**
 * The generated type file in the boilerplate predates the current OpenAPI
 * discriminator for agenda items. Keep the adapter's wire types explicit so
 * `arrangementId` is never confused with a song id.
 */
export type NativeAgendaItemInput =
    | {
          type: 'header';
          title: string | null;
          duration?: number;
      }
    | {
          type: 'text';
          title: string | null;
          duration?: number;
          note?: string | null;
          responsible?: string | null;
      }
    | {
          type: 'song';
          title: string | null;
          duration?: number;
          note?: string | null;
          responsible?: string | null;
          arrangementId: number;
      };

export type NativeAgendaItem = {
    id: number;
    type: 'header' | 'text' | 'song';
    title: string | null;
    duration?: number;
    note?: string | null;
    responsible?: { text?: string | null } | string | null;
    arrangementId?: number | null;
    songId?: number | null;
    song?: {
        arrangementId?: number | null;
        songId?: number | null;
        title?: string | null;
    } | null;
    position?: number;
    start?: string | null;
    isBeforeEvent?: boolean;
};

export type NativeAgenda = {
    id: number;
    calendarId: number;
    eventStartPosition?: number;
    isFinal?: boolean;
    isLocked?: boolean;
    items: NativeAgendaItem[];
    name?: string | null;
    series?: string | null;
    total?: number;
};

export type NativeAgendaUpsert = {
    calendarId: number;
    eventStartPosition?: number;
    series?: string | null;
    items?: NativeAgendaItemInput[];
};

export type NativeSong = Song & {
    id: number;
    name: string;
    arrangements?: Arrangement[];
};

export type NativeSongCategory = SongCategory & {
    id: number;
    name: string;
};

export type NativeArrangement = Arrangement & { id: number };

export type NativeArrangementCreate = {
    name: string;
    description?: string | null;
    duration?: number | null;
    key?: string | null;
    beat?: string | null;
    tempo?: number | null;
    isDefault?: boolean;
};

export type NativeSongCreate = {
    name: string;
    categoryId: number;
    author?: string | null;
    copyright?: string | null;
    ccli?: string | null;
    shouldPractice?: boolean;
    arrangements?: NativeArrangementCreate[];
};

export type NativeGlobalPermissions = GlobalPermissions & Record<string, Record<string, unknown> | undefined>;

/** A request body accepted by the current REST agenda item endpoints. */
export type AgendaItemWireInput = NativeAgendaItemInput;
