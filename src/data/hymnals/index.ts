import { demoEgBaden } from './demo-eg-baden';
import egBadenData from './eg-baden.json';
import type { HymnalDefinition } from './types';

export type { HymnalDefinition, HymnalSong } from './types';

export const egBaden = egBadenData satisfies HymnalDefinition;

export const hymnals: HymnalDefinition[] = [egBaden, demoEgBaden];
export const hymnalsById = Object.fromEntries(hymnals.map((hymnal) => [hymnal.id, hymnal]));
