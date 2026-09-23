import type { LiturgyDefinition, LiturgyNode, ServiceBlockNode } from './types';

// These are planning outlines for the two ELKG² orders, not transcriptions of
// the copyrighted Agende or of the prayers and musical settings in the hymnal.
// Source: https://www.selk.de/download/Gottesdienste-als-Lektor-oder-Lektorin-gestalten_web.pdf
// pp. 32–34; Order 1 communion outline:
// https://selk-gesangbuch.de/site/assets/files/1079/liedblatt_ordnung_1.pdf
const makeOrder = (number: 1 | 2): LiturgyDefinition => {
    const prefix = `selk-order-${number}`;
    const id = (part: string) => `${prefix}-${part}`;
    const heading = (part: string, text: string): LiturgyNode => ({ id: id(part), type: 'heading', text });
    const song = (part: string, label: string, required = false): LiturgyNode => ({
        id: id(part), type: 'songSlot', slot: part, label, required,
        print: { audience: 'congregation' },
    });
    const reading = (part: 'oldTestament' | 'epistle' | 'gospel', label: string, required = true): LiturgyNode => ({
        id: id(part), type: 'readingSlot', slot: part, label, required,
    });
    const optional = (part: string, label: string, nodes: LiturgyNode[]): LiturgyNode => ({
        id: id(part), type: 'optionalSection', sectionKey: part, label, nodes,
    });
    const opening: LiturgyNode[] = [
        heading('entrance-music', 'Musik zum Eingang'),
        song('entrance-hymn', 'Eingangslied', true),
        ...(number === 1 ? [
            optional('preparation', 'Rüstgebet', [heading('preparation-prayer', 'Rüstgebet')]),
            { id: id('introit'), type: 'readingSlot', slot: 'psalm', label: 'Eingangspsalm (Introitus)' } as LiturgyNode,
        ] : [
            heading('opening-greeting', 'Eröffnung und liturgischer Gruß'),
            heading('confession', 'Sündenbekenntnis'),
        ]),
        heading('kyrie', 'Kyrie'),
        song('kyrie-setting', 'Kyrie-Gesang'),
        heading('gloria', 'Gloria (in bestimmten Kirchenjahreszeiten entfällt es)'),
        song('gloria-setting', 'Gloria-Gesang'),
        heading('collect', 'Kollektengebet'),
    ];
    const orderOneWord: LiturgyNode[] = [
        reading('oldTestament', 'Lesung aus dem Alten Testament', false),
        song('between-readings', 'Liedstrophe oder Musik nach der AT-Lesung'),
        reading('epistle', 'Epistel'),
        heading('alleluia', 'Halleluja (in bestimmten Kirchenjahreszeiten entfällt es)'),
        song('alleluia-setting', 'Halleluja-Gesang'),
        song('main-hymn', 'Hauptlied'),
        reading('gospel', 'Evangelium'),
        heading('creed', 'Glaubensbekenntnis (Credo)'),
        song('creed-hymn', 'Glaubenslied'),
        song('before-sermon', 'Lied vor der Predigt'),
        { id: id('sermon'), type: 'sermonSlot', slot: 'sermon', label: 'Predigt', required: true },
        song('after-sermon', 'Lied nach der Predigt'),
        optional('catechesis', 'Christenlehre', [heading('catechesis-heading', 'Christenlehre')]),
    ];
    const orderTwoWord: LiturgyNode[] = [
        reading('oldTestament', 'Lesung aus dem Alten Testament'),
        { id: id('psalm'), type: 'readingSlot', slot: 'psalm', label: 'Psalmengesang' },
        reading('epistle', 'Epistel'),
        heading('alleluia', 'Halleluja (in bestimmten Kirchenjahreszeiten entfällt es)'),
        song('alleluia-setting', 'Halleluja-Gesang'),
        reading('gospel', 'Evangelium'),
        song('alleluia-repeat', 'Halleluja nach dem Evangelium'),
        { id: id('sermon'), type: 'sermonSlot', slot: 'sermon', label: 'Predigt', required: true },
        heading('creed', 'Glaubensbekenntnis (Credo)'),
        song('main-hymn', 'Lied / Hauptlied'),
    ];
    const communionBlock: ServiceBlockNode = {
        id: id('communion-block'), type: 'serviceBlock', blockKey: 'communion',
        label: 'Heiliges Abendmahl', suggestedAfter: id('intercessions'),
        nodes: [
            song('preparation-hymn', 'Lied oder Musik zur Bereitung'),
            heading('preface', 'Großes Dankgebet (Präfation)'),
            heading('sanctus', 'Heilig (Sanctus)'),
            song('sanctus-setting', 'Sanctus-Gesang'),
            heading('communion-lords-prayer', 'Vaterunser'),
            heading('institution', 'Einsetzungsworte'),
            heading('agnus-dei', 'Agnus Dei'),
            song('agnus-dei-setting', 'Agnus-Dei-Gesang'),
            heading('distribution', 'Austeilung'),
            song('distribution-hymn', 'Lied zur Austeilung'),
            heading('nunc-dimittis', 'Nunc Dimittis oder Dankstrophe'),
            song('nunc-dimittis-setting', 'Nunc-Dimittis-Gesang'),
            heading('post-communion-collect', 'Schlusskollekte und Versikel'),
        ],
    };
    return {
        id: prefix, version: 1, organizationId: 'selk', language: 'de',
        name: `ELKG² – Ordnung ${number} (Predigtgottesdienst)`,
        tags: ['SELK', 'ELKG²', `Ordnung ${number}`, 'Predigtgottesdienst'],
        tradition: 'evangelisch-lutherisch', serviceType: 'Gottesdienst',
        nodes: [
            ...opening,
            ...(number === 1 ? orderOneWord : orderTwoWord),
            heading('announcements', 'Abkündigungen'),
            heading('offering', 'Dankopfer'),
            heading('intercessions', 'Allgemeines Kirchengebet (Fürbittengebet)'),
            { id: id('word-service-lords-prayer'), type: 'heading', text: 'Vaterunser',
                ...(number === 1 ? { showWhen: { blockKey: 'communion', present: false } } : {}) },
            { id: id('word-service-dismissal'), type: 'heading', text: 'Entlassung (Benedicamus)',
                ...(number === 1 ? { showWhen: { blockKey: 'communion', present: false } } : {}) },
            ...(number === 1 ? [{ id: id('communion-dismissal'), type: 'heading' as const, text: 'Entlassung',
                showWhen: { blockKey: 'communion', present: true } }] : []),
            heading('blessing', 'Segen'),
            song('closing-hymn', 'Schlusslied'),
            heading('exit-music', 'Musik zum Ausgang'),
        ],
        ...(number === 1 ? { blocks: [communionBlock] } : {}),
    };
};

const orderOne = makeOrder(1);
const orderOneCommunion: LiturgyDefinition = {
    ...orderOne,
    id: 'selk-order-1-communion',
    name: 'ELKG² – Ordnung 1 (Hauptgottesdienst mit Abendmahl)',
    tags: ['SELK', 'ELKG²', 'Ordnung 1', 'Hauptgottesdienst', 'abendmahl'],
    serviceType: 'Hauptgottesdienst mit Abendmahl',
    blocks: orderOne.blocks?.map((block) => ({
        ...block,
        id: `${block.id}-palette`,
        nodes: block.nodes.map((node) => ({ ...node, id: `${node.id}-palette` })),
    })),
    nodes: [
        ...orderOne.nodes.slice(0, orderOne.nodes.findIndex((node) => node.id === 'selk-order-1-word-service-lords-prayer')),
        orderOne.blocks![0],
        ...orderOne.nodes.slice(orderOne.nodes.findIndex((node) => node.id === 'selk-order-1-word-service-lords-prayer')),
    ],
};

export const selkLiturgies: LiturgyDefinition[] = [orderOne, orderOneCommunion, makeOrder(2)];
