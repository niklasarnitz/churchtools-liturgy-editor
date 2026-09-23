import type { LiturgyDefinition } from './types';
import { badenDurmersheimLiturgy } from './baden-durmersheim';

export type {
    CommunionSectionNode,
    CreedNode,
    FixedTextNode,
    FreeTextSlotNode,
    HeadingNode,
    LiturgyDefinition,
    LiturgyNode,
    LiturgyNodeBase,
    LiturgyNodeType,
    OptionalSectionNode,
    PrayerNode,
    ReadingSlotKey,
    ReadingSlotNode,
    RubricNode,
    SermonSlotNode,
    SongSlotNode,
} from './types';

export const liturgies: LiturgyDefinition[] = [badenDurmersheimLiturgy];
export const liturgiesById = Object.fromEntries(liturgies.map((liturgy) => [liturgy.id, liturgy]));
