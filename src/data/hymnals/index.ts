import egBadenData from './eg-baden.json';
import elkg2Data from './elkg2.json';
import lutheranServiceBookData from './lutheran-service-book.json';
import type { HymnalDefinition } from './types';

export type { HymnalDefinition, HymnalSong } from './types';

export const egBaden = egBadenData satisfies HymnalDefinition;
export const elkg2 = elkg2Data satisfies HymnalDefinition;
export const lutheranServiceBook = lutheranServiceBookData satisfies HymnalDefinition;

export const hymnals: HymnalDefinition[] = [egBaden, elkg2, lutheranServiceBook];
export const hymnalsById = Object.fromEntries(hymnals.map((hymnal) => [hymnal.id, hymnal]));
