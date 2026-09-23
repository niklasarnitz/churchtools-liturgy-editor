import { describe, expect, it } from 'vitest';
import { generateNormalizedAgenda } from '../agenda-generation/renderer';
import type { AgendaSlotValue } from '../agenda-generation/types';
import { testBadenLiturgy } from '../../test-fixtures/resources';
import type { ServiceBlockNode } from '../../data/liturgies/types';
import { captureBlock, instantiateNode, parseSavedBlocks } from './blocks';

const song = { kind: 'song' as const, songId: 20, arrangementId: 30, title: 'Lied A' };
const block: ServiceBlockNode = {
    id: 'original-block', type: 'serviceBlock', blockKey: 'festival', label: 'Festteil', nodes: [
        { id: 'opening', type: 'heading', text: 'Beginn' },
        { id: 'song', type: 'songSlot', slot: 'festivalSong', label: 'Festlied', required: true },
        { id: 'reading', type: 'readingSlot', slot: 'gospel', label: 'Lesung' },
    ],
};

let sequence = 0;
const nextId = (type: string) => `${type}-${++sequence}`;

describe('editable service blocks', () => {
    it('duplicates node IDs and slot values independently, including lectionary source', () => {
        sequence = 0;
        const originalSlots: Record<string, AgendaSlotValue> = { festivalSong: song, gospel: 'Johannes 1' };
        const first = instantiateNode(block, originalSlots, nextId);
        const second = instantiateNode(block, originalSlots, nextId);
        expect(first.node.id).not.toBe(second.node.id);
        if (first.node.type !== 'serviceBlock' || second.node.type !== 'serviceBlock') throw new Error('Expected blocks');
        const firstSong = first.node.nodes[1];
        const secondSong = second.node.nodes[1];
        const firstReading = first.node.nodes[2];
        expect(firstSong?.id).not.toBe(secondSong?.id);
        if (firstSong?.type !== 'songSlot' || secondSong?.type !== 'songSlot' || firstReading?.type !== 'readingSlot') throw new Error('Expected slots');
        expect(firstSong.slot).not.toBe(secondSong.slot);
        expect(firstReading.lectionarySlot).toBe('gospel');
        expect(first.slots[firstSong.slot]).toEqual(song);
        first.slots[firstSong.slot] = { ...song, title: 'Lied B' };
        expect(second.slots[secondSong.slot]).toEqual(song);
        expect(block.nodes[1]).toMatchObject({ id: 'song', slot: 'festivalSong' });
        const agenda = generateNormalizedAgenda({ template: { ...testBadenLiturgy, nodes: [first.node, second.node] }, slots: { ...first.slots, ...second.slots } });
        expect(agenda.items.filter((item) => item.type === 'song').map((item) => item.songId)).toEqual([20, 20]);
    });

    it('captures editable values for a reusable personal block', () => {
        const saved = captureBlock(block, { festivalSong: song, gospel: 'Johannes 1', unrelated: 'skip' }, 'saved-1', 'Festteil');
        expect(saved.slots).toEqual({ festivalSong: song, gospel: 'Johannes 1' });
        expect(parseSavedBlocks(JSON.stringify([saved]))).toEqual([saved]);
        expect(parseSavedBlocks('{')).toEqual([]);
    });
});
