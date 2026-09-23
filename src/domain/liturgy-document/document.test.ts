import { describe, expect, it } from 'vitest';

import { badenDurmersheimLiturgy } from '../../data/liturgies/baden-durmersheim';
import { generateNormalizedAgenda, type AgendaSlotValue } from '../agenda-generation';
import { buildLiturgyDocumentHtml } from './document';

const slots: Record<string, AgendaSlotValue> = {
    baptismWeeklyVerse: 'Der Menschensohn ist gekommen, zu suchen und selig zu machen, was verloren ist.\nLukas 19,10',
    baptismOpeningSong: { kind: 'song', songId: 1, arrangementId: 11, sourceName: 'EG', number: '353', title: 'Jesus nimmt die Sünder an', comment: '1.3.4' },
    baptismSong: { kind: 'song', songId: 2, arrangementId: 22, sourceName: 'NL', number: '201', title: 'Vergiß es nie', comment: '1-3' },
    sermon: { kind: 'sermon', title: 'Schuld erlassen!', text: 'Micha 7,18–20' },
    baptismAfterSermonSong: { kind: 'song', songId: 3, arrangementId: 33, sourceName: 'NL', number: '28', title: 'Du hast Erbarmen', comment: '2x' },
    baptismClosingSong: { kind: 'song', songId: 4, arrangementId: 44, sourceName: 'EG', number: '65', title: 'Von guten Mächten', comment: '1.2.5 · Fietz-Melodie!' },
};

describe('Durmersheim liturgy document', () => {
    it('creates the landscape two-column document with overview, services, and standing texts', () => {
        const optionalSections = { baptism: true, communion: false };
        const agenda = generateNormalizedAgenda({ template: badenDurmersheimLiturgy, slots, optionalSections });
        const html = buildLiturgyDocumentHtml({
            event: {
                name: 'Gottesdienst',
                startDate: '2026-06-21T10:00:00Z',
                eventServices: [{
                    serviceName: 'Predigt',
                    person: { domainAttributes: { firstName: 'Dirk', lastName: 'Hasselbeck' } },
                }, {
                    serviceName: 'Ältestendienst',
                    person: { domainAttributes: { firstName: 'Claudia', lastName: 'Lübbers' } },
                }],
            },
            template: badenDurmersheimLiturgy,
            agenda,
            slots,
            optionalSections,
        });

        expect(html).toContain('@page { size: A4 landscape;');
        expect(html).toContain('grid-template-columns: repeat(2');
        expect(html).toContain('<h2>Taufen</h2>');
        expect(html).toContain('Ev. Kirchengemeinde Durmersheim');
        expect(html).toContain('„Schuld erlassen!“ (Micha 7,18–20)');
        expect(html).toContain('EG 353 Jesus nimmt die Sünder an · 1.3.4');
        expect(html).toContain('<strong>Predigt:</strong><br>Dirk Hasselbeck');
        expect(html).toContain('Taufbefehl (Claudia)');
        expect(html).toContain('Mir ist gegeben alle Gewalt im Himmel und auf Erden.');
        expect(html).toContain('Gemeinde: Amen. Amen. Amen.');
        expect(html).toContain('Vater unser im Himmel!');
    });

    it('escapes ChurchTools and editor data before writing the print window', () => {
        const optionalSections = { baptism: true };
        const unsafeSlots = { ...slots, sermon: { kind: 'sermon' as const, title: '<script>alert(1)</script>', text: 'Joh 1' } };
        const agenda = generateNormalizedAgenda({ template: badenDurmersheimLiturgy, slots: unsafeSlots, optionalSections });
        const html = buildLiturgyDocumentHtml({
            event: { name: 'Gottesdienst', startDate: '2026-06-21T10:00:00Z' },
            template: badenDurmersheimLiturgy,
            agenda,
            slots: unsafeSlots,
            optionalSections,
        });

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('includes the complete standing communion texts', () => {
        const song = { kind: 'song' as const, songId: 10, arrangementId: 100, sourceName: 'EG', number: '1', title: 'Testlied' };
        const communionSlots: Record<string, AgendaSlotValue> = {
            communionWeeklyVerse: 'Wochenspruch',
            communionOpeningSong: song,
            psalmSong: song,
            gloriaSong: song,
            kyrieSong: song,
            praiseSong: song,
            gospel: 'Lukas 10,25–37',
            gospelText: 'Lesungstext',
            communionBeforeSermonSong: song,
            sermon: { kind: 'sermon', title: 'Recht tun', text: 'Apg 6,1–7' },
            communionAfterSermonSong: song,
            communionClosingSong: song,
        };
        const optionalSections = { baptism: false, communion: true };
        const agenda = generateNormalizedAgenda({ template: badenDurmersheimLiturgy, slots: communionSlots, optionalSections });
        const html = buildLiturgyDocumentHtml({
            event: { name: 'Gottesdienst', startDate: '2026-08-30T10:00:00Z' },
            template: badenDurmersheimLiturgy,
            agenda,
            slots: communionSlots,
            optionalSections,
        });

        expect(html).toContain('Wohl dem, der barmherzig ist und gerne leiht');
        expect(html).toContain('Wir erheben sie zum Herren');
        expect(html).toContain('Heilig, heilig, heilig ist der Herr Zebaoth!');
        expect(html).toContain('Vater unser im Himmel!');
        expect(html).toContain('Christe, du Lamm Gottes');
        expect(html).toContain('Der Herr segne euch und behüte euch.');
    });
});
