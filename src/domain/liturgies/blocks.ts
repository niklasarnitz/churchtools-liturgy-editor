import type { AgendaSlotValue } from '../agenda-generation/types';
import type { LiturgyNode, ReadingSlotKey, ServiceBlockNode } from '../../data/liturgies/types';

export interface SavedBlock {
    id: string;
    name: string;
    block: ServiceBlockNode;
    slots: Record<string, AgendaSlotValue | undefined>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Each agenda item and editable slot belongs to exactly one placed instance. */
export const instantiateNode = (
    source: LiturgyNode,
    slots: Readonly<Record<string, AgendaSlotValue | undefined>>,
    nextId: (type: string) => string,
): { node: LiturgyNode; slots: Record<string, AgendaSlotValue | undefined> } => {
    const values: Record<string, AgendaSlotValue | undefined> = {};
    const copy = (node: LiturgyNode): LiturgyNode => {
        const duplicate = clone(node);
        duplicate.id = nextId(node.type);
        if (duplicate.type === 'serviceBlock' || duplicate.type === 'communionSection' || duplicate.type === 'optionalSection') {
            duplicate.nodes = duplicate.nodes.map(copy);
        } else if (duplicate.type === 'songSlot' || duplicate.type === 'freeTextSlot' || duplicate.type === 'readingSlot' || duplicate.type === 'sermonSlot') {
            const oldSlot = duplicate.type === 'sermonSlot' ? duplicate.slot ?? 'sermon' : duplicate.slot;
            const newSlot = `${duplicate.id}-value`;
            if (duplicate.type === 'readingSlot') {
                const sourceSlot = duplicate.lectionarySlot ?? oldSlot;
                if (sourceSlot === 'oldTestament' || sourceSlot === 'psalm' || sourceSlot === 'epistle' || sourceSlot === 'gospel' || sourceSlot === 'sermon') {
                    duplicate.lectionarySlot = sourceSlot as ReadingSlotKey;
                }
            }
            duplicate.slot = newSlot;
            if (slots[oldSlot] !== undefined) values[newSlot] = clone(slots[oldSlot]);
        }
        return duplicate;
    };
    return { node: copy(source), slots: values };
};

export const captureBlock = (
    source: ServiceBlockNode,
    slots: Readonly<Record<string, AgendaSlotValue | undefined>>,
    id: string,
    name: string,
): SavedBlock => {
    const copied = clone(source);
    copied.label = name.trim();
    const values: Record<string, AgendaSlotValue | undefined> = {};
    const gather = (nodes: LiturgyNode[]) => nodes.forEach((node) => {
        if (node.type === 'serviceBlock' || node.type === 'communionSection' || node.type === 'optionalSection') gather(node.nodes);
        else if (node.type === 'songSlot' || node.type === 'freeTextSlot' || node.type === 'readingSlot' || node.type === 'sermonSlot') {
            const slot = node.type === 'sermonSlot' ? node.slot ?? 'sermon' : node.slot;
            if (slots[slot] !== undefined) values[slot] = clone(slots[slot]);
        }
    });
    gather(copied.nodes);
    return { id, name: name.trim(), block: copied, slots: values };
};

export const parseSavedBlocks = (raw: string | null): SavedBlock[] => {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is SavedBlock => typeof entry === 'object' && entry !== null &&
            typeof entry.id === 'string' && typeof entry.name === 'string' &&
            typeof entry.block === 'object' && entry.block !== null && entry.block.type === 'serviceBlock' &&
            typeof entry.block.blockKey === 'string' && Array.isArray(entry.block.nodes) &&
            typeof entry.slots === 'object' && entry.slots !== null);
    } catch { return []; }
};
