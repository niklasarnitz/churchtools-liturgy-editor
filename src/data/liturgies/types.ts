export type LiturgyNodeType =
    | 'heading'
    | 'fixedText'
    | 'rubric'
    | 'songSlot'
    | 'readingSlot'
    | 'sermonSlot'
    | 'creed'
    | 'prayer'
    | 'optionalSection'
    | 'freeTextSlot'
    | 'communionSection';

export interface LiturgyNodeBase {
    id: string;
    label?: string;
}

export interface HeadingNode extends LiturgyNodeBase {
    type: 'heading';
    text: string;
}

export interface FixedTextNode extends LiturgyNodeBase {
    type: 'fixedText';
    text: string;
}

export interface RubricNode extends LiturgyNodeBase {
    type: 'rubric';
    text: string;
}

export interface SongSlotNode extends LiturgyNodeBase {
    type: 'songSlot';
    slot: string;
    required?: boolean;
}

export type ReadingSlotKey = 'oldTestament' | 'psalm' | 'epistle' | 'gospel' | 'sermon';

export interface ReadingSlotNode extends LiturgyNodeBase {
    type: 'readingSlot';
    slot: ReadingSlotKey;
    required?: boolean;
}

export interface SermonSlotNode extends LiturgyNodeBase {
    type: 'sermonSlot';
    slot?: 'sermon';
    required?: boolean;
}

export interface CreedNode extends LiturgyNodeBase {
    type: 'creed';
    creed?: string;
}

export interface PrayerNode extends LiturgyNodeBase {
    type: 'prayer';
    text?: string;
}

export interface OptionalSectionNode extends LiturgyNodeBase {
    type: 'optionalSection';
    sectionKey: string;
    nodes: LiturgyNode[];
}

export interface FreeTextSlotNode extends LiturgyNodeBase {
    type: 'freeTextSlot';
    slot: string;
    required?: boolean;
}

export interface CommunionSectionNode extends LiturgyNodeBase {
    type: 'communionSection';
    nodes: LiturgyNode[];
}

export type LiturgyNode =
    | HeadingNode
    | FixedTextNode
    | RubricNode
    | SongSlotNode
    | ReadingSlotNode
    | SermonSlotNode
    | CreedNode
    | PrayerNode
    | OptionalSectionNode
    | FreeTextSlotNode
    | CommunionSectionNode;

export interface LiturgyDefinition {
    id: string;
    version: number;
    organizationId: string;
    name: string;
    tags: string[];
    language: string;
    tradition?: string;
    serviceType?: string;
    lectionaryId?: string;
    nodes: LiturgyNode[];
}
