import { hymnals } from '../data/hymnals/catalog';
import type { LectionaryDefinition } from '../data/lectionaries/types';
import type { LiturgyDefinition } from '../data/liturgies/types';
import { organizations } from '../data/organizations/catalog';
import type { ResourceRegistry } from '../data/registry';

export const testLectionary: LectionaryDefinition = {
    id: 'test-lectionary',
    version: 1,
    name: 'Test-Lektionar',
    language: 'de',
    organizationIds: ['ekiba', 'selk'],
    days: [{
        id: 'test-lectionary:2026-09-20',
        date: '2026-09-20',
        name: '17. Sonntag nach Trinitatis',
        season: 'Trinitatiszeit',
        color: 'green',
        sermonSeries: 'Reihe I',
        readings: {
            epistle: { reference: 'Eph 4,1–6' },
            gospel: { reference: 'Lk 14,1–11' },
            sermon: { reference: 'Lk 14,1–11' },
        },
        weeklyPsalm: 'Ps 119,1–8',
        weeklyHymn: 'eg-baden:317',
    }],
};

export const testBadenLiturgy: LiturgyDefinition = {
    id: 'test-baden-liturgy',
    version: 1,
    organizationId: 'ekiba',
    name: 'Testliturgie Baden',
    tags: ['test'],
    language: 'de',
    lectionaryId: testLectionary.id,
    nodes: [
        { id: 'gathering', type: 'heading', text: 'Eröffnung' },
        { id: 'opening-song', type: 'songSlot', slot: 'openingSong', required: true, label: 'Eingangslied' },
        { id: 'greeting', type: 'fixedText', text: 'Begrüßung und Votum' },
        { id: 'psalm', type: 'readingSlot', slot: 'psalm', label: 'Psalm' },
        { id: 'word', type: 'heading', text: 'Verkündigung' },
        { id: 'epistle', type: 'readingSlot', slot: 'epistle', label: 'Epistel' },
        { id: 'gospel', type: 'readingSlot', slot: 'gospel', label: 'Evangelium' },
        { id: 'sermon', type: 'sermonSlot', required: true, label: 'Predigt' },
        { id: 'after-sermon-song', type: 'songSlot', slot: 'afterSermonSong', label: 'Lied nach der Predigt' },
        { id: 'intercession', type: 'prayer', text: 'Fürbittengebet', label: 'Fürbitten' },
        {
            id: 'communion',
            type: 'communionSection',
            label: 'Abendmahl',
            nodes: [
                { id: 'communion-heading', type: 'heading', text: 'Heiliges Abendmahl' },
                { id: 'communion-song', type: 'songSlot', slot: 'communionSong', label: 'Abendmahlslied' },
            ],
        },
        { id: 'closing-song', type: 'songSlot', slot: 'closingSong', required: true, label: 'Schlusslied' },
    ],
};

export const testSelkLiturgy: LiturgyDefinition = {
    id: 'test-selk-liturgy',
    version: 1,
    organizationId: 'selk',
    name: 'Testliturgie SELK',
    tags: ['test'],
    language: 'de',
    lectionaryId: testLectionary.id,
    nodes: [
        { id: 'entrance-song', type: 'songSlot', slot: 'openingSong', required: true, label: 'Eingangslied' },
        { id: 'gospel-reading', type: 'readingSlot', slot: 'gospel', required: true, label: 'Evangelium' },
        { id: 'sermon', type: 'sermonSlot', required: true, label: 'Predigt' },
        { id: 'exit-song', type: 'songSlot', slot: 'closingSong', required: true, label: 'Schlusslied' },
    ],
};

export const testLiturgiesById = {
    [testBadenLiturgy.id]: testBadenLiturgy,
    [testSelkLiturgy.id]: testSelkLiturgy,
};

export const testResourceRegistry: ResourceRegistry = {
    organizations: organizations.map((organization) => ({
        ...organization,
        liturgyIds: organization.id === 'ekiba'
            ? [testBadenLiturgy.id]
            : organization.id === 'selk' ? [testSelkLiturgy.id] : [],
        lectionaryIds: ['ekiba', 'selk'].includes(organization.id) ? [testLectionary.id] : [],
    })),
    hymnals,
    liturgies: [testBadenLiturgy, testSelkLiturgy],
    lectionaries: [testLectionary],
};
