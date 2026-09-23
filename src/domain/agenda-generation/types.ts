import type { LiturgicalDay, ScriptureReference } from '../../data/lectionaries';
import type { LiturgyDefinition } from '../../data/liturgies';

export interface SongSlotValue {
    kind: 'song';
    songId: number;
    arrangementId: number | null;
    title?: string;
    sourceName?: string;
    number?: string;
    /** Event-specific information such as verses, repetitions, or melody. */
    comment?: string;
}

export interface SermonSlotValue {
    kind: 'sermon';
    title?: string;
    /** Scripture reference or other text displayed below the sermon title. */
    text: string;
}

export type AgendaSlotValue = SongSlotValue | SermonSlotValue | ScriptureReference | string;

export interface NormalizedAgendaItem {
    nodeId: string;
    position: number;
    type: 'header' | 'text' | 'song';
    title: string;
    note?: string;
    responsible?: string;
    songId?: number;
    arrangementId?: number | null;
}

export interface NormalizedAgenda {
    eventStartPosition: number;
    series?: string;
    items: NormalizedAgendaItem[];
}

export interface AgendaGenerationInput {
    template: LiturgyDefinition;
    slots?: Readonly<Record<string, AgendaSlotValue | undefined>>;
    liturgicalDay?: LiturgicalDay;
    optionalSections?: Readonly<Record<string, boolean>>;
    eventStartPosition?: number;
    series?: string;
}
