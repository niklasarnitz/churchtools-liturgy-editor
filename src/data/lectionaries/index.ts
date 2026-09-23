import type { LectionaryDefinition } from './types';

export type { LectionaryDefinition, LiturgicalDay, ScriptureReference } from './types';

export const lectionaries: LectionaryDefinition[] = [];
export const lectionariesById = Object.fromEntries(lectionaries.map((lectionary) => [lectionary.id, lectionary]));
