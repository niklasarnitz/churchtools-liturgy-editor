import { describe, expect, it } from 'vitest';

import { generateNormalizedAgenda } from '../../domain/agenda-generation';
import { selkLiturgies } from './selk';

const slots = {
    'entrance-hymn': { kind: 'song' as const, songId: 1, arrangementId: null },
    oldTestament: 'Jesaja 1,1–9',
    psalm: 'Psalm 1',
    epistle: 'Römer 1,1–7',
    gospel: 'Matthäus 1,1–17',
    sermon: 'Matthäus 1,1–17',
};

const titlesFor = (index: number) => generateNormalizedAgenda({ template: selkLiturgies[index], slots })
    .items.map((item) => item.title);

describe('SELK ELKG² structure presets', () => {
    it('keeps Order 1 entrance psalm and Creed before the sermon', () => {
        const titles = titlesFor(0);
        expect(titles.indexOf('Eingangspsalm (Introitus)')).toBeLessThan(titles.indexOf('Epistel'));
        expect(titles.indexOf('Glaubensbekenntnis (Credo)')).toBeLessThan(titles.indexOf('Predigt'));
        expect(titles).toContain('Vaterunser');
        expect(titles).not.toContain('Einsetzungsworte');
    });

    it('places the Order 1 sacrament after the intercessions without duplicating the Lord’s Prayer', () => {
        const titles = titlesFor(1);
        expect(titles.indexOf('Allgemeines Kirchengebet (Fürbittengebet)')).toBeLessThan(titles.indexOf('Großes Dankgebet (Präfation)'));
        expect(titles.indexOf('Einsetzungsworte')).toBeLessThan(titles.indexOf('Austeilung'));
        expect(titles.filter((title) => title === 'Vaterunser')).toHaveLength(1);
    });

    it('keeps Order 2 three readings together and the Creed after the sermon', () => {
        const titles = titlesFor(2);
        expect(titles.indexOf('Lesung aus dem Alten Testament')).toBeLessThan(titles.indexOf('Psalmengesang'));
        expect(titles.indexOf('Psalmengesang')).toBeLessThan(titles.indexOf('Epistel'));
        expect(titles.indexOf('Epistel')).toBeLessThan(titles.indexOf('Evangelium'));
        expect(titles.indexOf('Predigt')).toBeLessThan(titles.indexOf('Glaubensbekenntnis (Credo)'));
        expect(titles).not.toContain('Einsetzungsworte');
    });
});
