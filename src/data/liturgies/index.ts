import { demoBadenLiturgy } from './demo-baden';
import { demoSelkLiturgy } from './demo-selk';
import type { LiturgyDefinition } from './types';

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

export const liturgies: LiturgyDefinition[] = [demoBadenLiturgy, demoSelkLiturgy];
export const liturgiesById = Object.fromEntries(liturgies.map((liturgy) => [liturgy.id, liturgy]));
