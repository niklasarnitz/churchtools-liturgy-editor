import type { LiturgyDefinition } from './types';

export const demoBadenLiturgy: LiturgyDefinition = {
    id: 'baden-predigtgottesdienst-demo',
    version: 1,
    organizationId: 'ekiba',
    name: 'Predigtgottesdienst – Baden (Demo)',
    tags: ['sonntag', 'predigt', 'demo'],
    language: 'de',
    tradition: 'landeskirchlich',
    serviceType: 'predigtgottesdienst',
    lectionaryId: 'demo-minimal',
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
