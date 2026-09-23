import { describe, expect, it } from 'vitest';

import { organizationsById } from '../../data/organizations';
import { testBadenLiturgy, testLectionary, testSelkLiturgy } from '../../test-fixtures/resources';
import { resolveLiturgicalDay } from '../lectionary';
import { AgendaGenerationError, generateNormalizedAgenda, type SongSlotValue } from './index';

const songs: Record<string, SongSlotValue> = {
    openingSong: { kind: 'song', songId: 101, arrangementId: 1001, title: 'Morgenlicht der Hoffnung' },
    afterSermonSong: { kind: 'song', songId: 102, arrangementId: 1002, title: 'Licht auf unsern Wegen' },
    communionSong: { kind: 'song', songId: 103, arrangementId: 1003, title: 'Komm, Geist des Lebens' },
    closingSong: { kind: 'song', songId: 104, arrangementId: 1004, title: 'Segen für den Weg' },
};

describe('normalized agenda generation', () => {
    it('applies placement and visibility rules to any named service block', () => {
        const block = { id: 'festival-block', type: 'serviceBlock' as const, blockKey: 'festival', label: 'Festteil', nodes: [
            { id: 'festival-song', type: 'heading' as const, text: 'Festlied' },
        ] };
        const nodes = [
            { id: 'opening', type: 'heading' as const, text: 'Beginn' },
            { id: 'usual-prayer', type: 'heading' as const, text: 'Übliches Gebet', showWhen: { blockKey: 'festival', present: false } },
            block,
            { id: 'ending', type: 'heading' as const, text: 'Schluss' },
        ];
        const template = { ...testBadenLiturgy, nodes };
        const withBlock = generateNormalizedAgenda({ template });
        const withoutBlock = generateNormalizedAgenda({ template: { ...template, nodes: nodes.filter((node) => node !== block) } });
        expect(withBlock.items.map((item) => item.nodeId)).toEqual(['opening', 'festival-song', 'ending']);
        expect(withoutBlock.items.map((item) => item.nodeId)).toEqual(['opening', 'usual-prayer', 'ending']);
    });
    it('renders deterministic native-compatible items and node mappings', () => {
        const template = testBadenLiturgy;
        const day = resolveLiturgicalDay({ date: '2026-09-20', organization: organizationsById.ekiba, lectionaries: [testLectionary] });
        const input = {
            template,
            liturgicalDay: day,
            slots: { ...songs, sermon: 'Lk 14,1–11' },
            optionalSections: { communion: true },
            series: 'III',
        };

        const first = generateNormalizedAgenda(input);
        const second = generateNormalizedAgenda(input);

        expect(first).toEqual(second);
        expect(first.series).toBe('III');
        expect(first.items.map((item) => item.nodeId)).toContain('communion-song');
        expect(first.items.find((item) => item.nodeId === 'opening-song')).toMatchObject({
            type: 'song',
            songId: 101,
            arrangementId: 1001,
        });
        expect(first.items.every((item, index) => item.position === index)).toBe(true);
    });

    it('keeps song comments, sermon title/text, fixed text bodies, and responsibilities', () => {
        const template = {
            ...testBadenLiturgy,
            nodes: [
                { id: 'votum', type: 'fixedText' as const, label: 'Votum', text: 'Im Namen des Vaters.', responsible: '[Liturgie]' },
                { id: 'song', type: 'songSlot' as const, slot: 'openingSong', label: 'Eingangslied', required: true, responsible: '[Musik]' },
                { id: 'sermon', type: 'sermonSlot' as const, required: true, label: 'Predigt', responsible: '[Predigt]' },
            ],
        };

        const result = generateNormalizedAgenda({
            template,
            slots: {
                openingSong: { kind: 'song', songId: 101, arrangementId: 1001, title: 'Jesus nimmt die Sünder an', comment: 'Strophen 1, 3 und 4' },
                sermon: { kind: 'sermon', title: 'Schuld erlassen!', text: 'Micha 7,18–20' },
            },
        });

        expect(result.items).toEqual([
            { nodeId: 'votum', position: 0, type: 'text', title: 'Votum', note: 'Im Namen des Vaters.', responsible: '[Liturgie]' },
            { nodeId: 'song', position: 1, type: 'song', title: 'Eingangslied', note: 'Strophen 1, 3 und 4', responsible: '[Musik]', songId: 101, arrangementId: 1001 },
            { nodeId: 'sermon', position: 2, type: 'text', title: 'Schuld erlassen!', note: 'Micha 7,18–20', responsible: '[Predigt]' },
        ]);
    });

    it('omits disabled optional sections without changing stable node IDs', () => {
        const sourceTemplate = testBadenLiturgy;
        const template = {
            ...sourceTemplate,
            nodes: [
                {
                    id: 'optional-communion',
                    type: 'optionalSection' as const,
                    sectionKey: 'communion',
                    nodes: [{ id: 'optional-heading', type: 'heading' as const, text: 'Abendmahl' }],
                },
                ...sourceTemplate.nodes,
            ],
        };
        const result = generateNormalizedAgenda({
            template,
            slots: { ...songs, sermon: 'Lk 14,1–11' },
            optionalSections: { communion: false },
        });

        expect(result.items.map((item) => item.nodeId)).not.toContain('optional-heading');
        expect(result.items.map((item) => item.nodeId)).toContain('closing-song');
    });

    it('shows arrangement and selected stanzas in the agenda note', () => {
        const template = {
            ...testBadenLiturgy,
            nodes: [{ id: 'song', type: 'songSlot' as const, slot: 'openingSong', label: 'Eingangslied', required: true }],
        };
        const result = generateNormalizedAgenda({
            template,
            slots: {
                openingSong: {
                    kind: 'song', songId: 101, arrangementId: 1001,
                    arrangementName: 'Strophen 1, 3 und 4', stanzas: [1, 3, 4],
                },
            },
        });
        expect(result.items[0]?.note).toBe('Arrangement: Strophen 1, 3 und 4');
    });

    it('fails conservatively when a required slot is absent', () => {
        const template = testSelkLiturgy;

        expect(() => generateNormalizedAgenda({ template, optionalSections: { 'lord-table': false } })).toThrow(
            AgendaGenerationError,
        );
        try {
            generateNormalizedAgenda({ template, optionalSections: { 'lord-table': false } });
        } catch (error) {
            expect((error as AgendaGenerationError).missingSlots).toEqual(['openingSong', 'gospel', 'sermon', 'closingSong']);
        }
    });
});
