import type { HymnalSong } from '../../data/hymnals';
import type { NativeSong } from '../../churchtools/types';

export const stableJson = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
};

export const hymnalSongFingerprint = (song: HymnalSong): string =>
    stableJson({
        author: song.author ?? null,
        ccli: song.ccli ?? null,
        copyright: song.copyright ?? null,
        id: song.id,
        metadata: song.metadata ?? null,
        number: song.number,
        title: song.title,
    });

export const nativeSongFingerprint = (song: NativeSong): string =>
    stableJson({
        author: song.author ?? null,
        ccli: song.ccli ?? null,
        copyright: song.copyright ?? null,
        id: song.id,
        name: song.name,
        categoryId: song.category?.id ?? null,
    });
