import type { LectionaryDefinition } from './types';

/** Minimal fixture. It is deliberately not a complete official lectionary. */
export const demoMinimalLectionary: LectionaryDefinition = {
    id: 'demo-minimal',
    version: 1,
    name: 'Minimales Test-Lektionar',
    language: 'de',
    organizationIds: ['ekiba', 'selk'],
    days: [
        {
            id: 'demo-minimal:2026-09-20',
            date: '2026-09-20',
            name: '17. Sonntag nach Trinitatis (Demo)',
            season: 'Trinitatiszeit',
            color: 'green',
            sermonSeries: 'Demo-Reihe I',
            readings: {
                epistle: { reference: 'Eph 4,1–6' },
                gospel: { reference: 'Lk 14,1–11' },
                sermon: { reference: 'Lk 14,1–11' },
            },
            weeklyPsalm: 'Ps 119,1–8',
            weeklyHymn: 'eg-baden:317',
        },
        {
            id: 'demo-minimal:2026-09-27',
            date: '2026-09-27',
            name: '18. Sonntag nach Trinitatis (Demo)',
            season: 'Trinitatiszeit',
            color: 'green',
            readings: {
                epistle: { reference: '1 Joh 4,7–12' },
                gospel: { reference: 'Mt 22,34–46' },
                sermon: { reference: 'Mt 22,34–46' },
            },
            weeklyPsalm: 'Ps 1',
        },
    ],
};
