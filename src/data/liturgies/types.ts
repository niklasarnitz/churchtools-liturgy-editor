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
    | 'serviceBlock'
    | 'communionSection';

export interface LiturgyNodePrintOptions {
    /** Marks words spoken or sung by the congregation. */
    audience?: 'congregation';
    alignment?: 'left' | 'center' | 'indent';
    /** Adds this variable node to the overview on the first print column. */
    summaryLabel?: string;
    /** Prints only the body so it can continue the preceding agenda item. */
    continuation?: boolean;
    columnBreakBefore?: boolean;
}

export interface LiturgyNodeBase {
    id: string;
    label?: string;
    /** Native ChurchTools responsible text, usually a service placeholder such as `[Predigt]`. */
    responsible?: string;
    print?: LiturgyNodePrintOptions;
    /** Template rule evaluated from the blocks currently placed in the order. */
    showWhen?: { blockKey: string; present: boolean };
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
    slot: string;
    /** Keeps the lectionary source when an instance has its own slot ID. */
    lectionarySlot?: ReadingSlotKey;
    required?: boolean;
}

export interface SermonSlotNode extends LiturgyNodeBase {
    type: 'sermonSlot';
    slot?: string;
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

export interface ServiceBlockNode extends LiturgyNodeBase {
    type: 'serviceBlock';
    blockKey: string;
    /** A suggested insertion point; users can still move the block freely. */
    suggestedAfter?: string;
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
    | ServiceBlockNode
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
    optionalSectionMode?: 'multiple' | 'single';
    print?: {
        congregationName: string;
        participantColor?: string;
        participantNotice?: string;
    };
    nodes: LiturgyNode[];
    /** Ready-made blocks that users can place in the order independently. */
    blocks?: ServiceBlockNode[];
}
