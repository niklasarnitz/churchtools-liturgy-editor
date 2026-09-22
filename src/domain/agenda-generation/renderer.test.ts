import { describe, expect, it } from 'vitest';

import { lectionaries } from '../../data/lectionaries';
import { liturgiesById } from '../../data/liturgies';
import { organizationsById } from '../../data/organizations';
import { resolveLiturgicalDay } from '../lectionary';
import { AgendaGenerationError, generateNormalizedAgenda, type SongSlotValue } from './index';

const songs: Record<string, SongSlotValue> = {
    openingSong: { kind: 'song', songId: 101, arrangementId: 1001, title: 'Morgenlicht der Hoffnung' },
    afterSermonSong: { kind: 'song', songId: 102, arrangementId: 1002, title: 'Licht auf unsern Wegen' },
    communionSong: { kind: 'song', songId: 103, arrangementId: 1003, title: 'Komm, Geist des Lebens' },
    closingSong: { kind: 'song', songId: 104, arrangementId: 1004, title: 'Segen für den Weg' },
};

describe('normalized agenda generation', () => {
    it('renders deterministic native-compatible items and node mappings', () => {
        const template = liturgiesById['baden-predigtgottesdienst-demo'];
        const day = resolveLiturgicalDay({ date: '2026-09-20', organization: organizationsById.ekiba, lectionaries });
        const input = {
            template,
            liturgicalDay: day,
            slots: songs,
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

    it('omits disabled optional sections without changing stable node IDs', () => {
        const sourceTemplate = liturgiesById['baden-predigtgottesdienst-demo'];
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

    it('fails conservatively when a required slot is absent', () => {
        const template = liturgiesById['selk-hauptgottesdienst-demo'];

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
