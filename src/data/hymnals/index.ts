import { demoEgBaden } from './demo-eg-baden';
import type { HymnalDefinition } from './types';

export type { HymnalDefinition, HymnalSong } from './types';

export const hymnals: HymnalDefinition[] = [demoEgBaden];
export const hymnalsById = Object.fromEntries(hymnals.map((hymnal) => [hymnal.id, hymnal]));
