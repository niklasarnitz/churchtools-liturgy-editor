import { describe, expect, it } from 'vitest';

import { badenDurmersheimLiturgy } from '../../data/liturgies/baden-durmersheim';
import type { LiturgyDefinition } from '../../data/liturgies/types';
import { generateNormalizedAgenda } from '../agenda-generation/renderer';
import type { AgendaSlotValue } from '../agenda-generation/types';
import { buildLiturgyDocumentHtml } from './document';

const song = { kind: 'song' as const, songId: 10, arrangementId: 100, sourceName: 'EG', number: '1', title: 'Testlied' };
const slots: Record<string, AgendaSlotValue> = {
    communionWeeklyVerse: 'Wochenspruch', communionOpeningSong: song, psalmSong: song,
    gloriaSong: song, kyrieSong: song, praiseSong: song, gospel: 'Lukas 10,25–37',
    gospelText: 'Lesungstext', communionBeforeSermonSong: song,
    sermon: { kind: 'sermon', title: 'Recht tun', text: 'Apg 6,1–7' },
    communionAfterSermonSong: song, communionClosingSong: song, baptismSong: song,
};

const withBlocks = (...keys: string[]): LiturgyDefinition => {
    const nodes = [...badenDurmersheimLiturgy.nodes];
    keys.forEach((key) => {
        const block = badenDurmersheimLiturgy.blocks?.find((item) => item.blockKey === key);
        if (!block) throw new Error(`Missing block ${key}`);
        const after = nodes.findIndex((node) => node.id === block.suggestedAfter);
        nodes.splice(after + 1, 0, block);
    });
    return { ...badenDurmersheimLiturgy, nodes };
};

const render = (template: LiturgyDefinition, values = slots) => {
    const agenda = generateNormalizedAgenda({ template, slots: values });
    return buildLiturgyDocumentHtml({
        event: { name: 'Gottesdienst', startDate: '2026-08-30T10:00:00Z' },
        template, agenda, slots: values, optionalSections: {},
    });
};

describe('Durmersheim liturgy document', () => {
    it('prints baptism and communion together in the requested order', () => {
        const html = render(withBlocks('baptism', 'communion'));
        expect(html).toContain('@page { size: A4 landscape;');
        expect(html).toContain('<h2>Taufe und Abendmahl</h2>');
        expect(html).toContain('Mir ist gegeben alle Gewalt im Himmel und auf Erden.');
        expect(html).toContain('Wir erheben sie zum Herren');
        expect(html).toContain('Christe, du Lamm Gottes');
        expect(html.match(/Vater unser im Himmel!/g)).toHaveLength(1);
        expect(html.indexOf('Mir ist gegeben')).toBeLessThan(html.indexOf('Wir erheben sie'));
    });

    it('keeps the Vaterunser in the closing prayers without communion', () => {
        const html = render(withBlocks('baptism'));
        expect(html).toContain('<h2>Taufe</h2>');
        expect(html).toContain('Vater unser im Himmel!');
        expect(html.indexOf('Fürbittengebet')).toBeLessThan(html.indexOf('Vater unser im Himmel!'));
        expect(html).not.toContain('Wir erheben sie zum Herren');
    });

    it('escapes editable content before writing the print window', () => {
        const unsafe = { ...slots, sermon: { kind: 'sermon' as const, title: '<script>alert(1)</script>', text: 'Joh 1' } };
        const html = render(withBlocks(), unsafe);
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
});
