import type { LiturgyDefinition } from './types';

export const demoSelkLiturgy: LiturgyDefinition = {
    id: 'selk-hauptgottesdienst-demo',
    version: 1,
    organizationId: 'selk',
    name: 'Hauptgottesdienst mit Abendmahl – SELK (Demo)',
    tags: ['sonntag', 'abendmahl', 'selk', 'demo'],
    language: 'de',
    tradition: 'lutherisch',
    serviceType: 'hauptgottesdienst',
    lectionaryId: 'demo-minimal',
    nodes: [
        { id: 'entrance', type: 'heading', text: 'Eingang' },
        { id: 'entrance-song', type: 'songSlot', slot: 'openingSong', required: true, label: 'Eingangslied' },
        { id: 'confession', type: 'rubric', text: 'Beichte und Kyrie', label: 'Kyrie' },
        { id: 'readings', type: 'heading', text: 'Lesungen' },
        { id: 'gospel-reading', type: 'readingSlot', slot: 'gospel', required: true, label: 'Evangelium' },
        { id: 'sermon', type: 'sermonSlot', required: true, label: 'Predigt' },
        { id: 'creed', type: 'creed', creed: 'Apostolisches Glaubensbekenntnis' },
        { id: 'prayer', type: 'prayer', text: 'Fürbittengebet' },
        {
            id: 'lord-table',
            type: 'communionSection',
            label: 'Abendmahl',
            nodes: [
                { id: 'lord-table-heading', type: 'heading', text: 'Mahl des Herrn' },
                { id: 'distribution-song', type: 'songSlot', slot: 'communionSong', label: 'Lied zur Austeilung' },
            ],
        },
        { id: 'exit-song', type: 'songSlot', slot: 'closingSong', required: true, label: 'Schlusslied' },
    ],
};
