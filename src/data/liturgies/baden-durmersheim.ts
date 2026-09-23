import type { LiturgyDefinition } from './types';

const apostolicCreed = `Ich glaube an Gott,
den Vater, den Allmächtigen,
den Schöpfer des Himmels und der Erde,
und an Jesus Christus,
seinen eingeborenen Sohn, unsern Herrn,
empfangen durch den Heiligen Geist,
geboren von der Jungfrau Maria,
gelitten unter Pontius Pilatus,
gekreuzigt, gestorben und begraben,
hinabgestiegen in das Reich des Todes,
am dritten Tage auferstanden von den Toten,
aufgefahren in den Himmel;
er sitzt zur Rechten Gottes,
des allmächtigen Vaters;
von dort wird er kommen,
zu richten die Lebenden und die Toten.
Ich glaube an den Heiligen Geist,
die heilige christliche Kirche,
Gemeinschaft der Heiligen,
Vergebung der Sünden,
Auferstehung der Toten
und das ewige Leben. Amen.`;

const lordsPrayer = `Vater unser im Himmel!
Geheiligt werde dein Name.
Dein Reich komme.
Dein Wille geschehe,
wie im Himmel so auf Erden.
Unser tägliches Brot gib uns heute.
Und vergib uns unsere Schuld,
wie auch wir vergeben unseren Schuldigern.
Und führe uns nicht in Versuchung,
sondern erlöse uns von dem Bösen.
Denn dein ist das Reich
und die Kraft
und die Herrlichkeit
in Ewigkeit.
Amen.`;

const blessing = `Der Herr segne euch und behüte euch.
Der Herr lasse sein Angesicht leuchten über euch und sei euch gnädig.
Der Herr hebe sein Angesicht über euch und gebe euch Frieden.`;

const baptismCommand = `Wir hören, wie Jesus Christus der Auferstandene uns den Auftrag gegeben hat, die Menschen aus allen Völkern mit ihm bekannt zu machen, alle zu seinen Jüngern zu machen. Und sie zu taufen.

Unser Herr Jesus Christus spricht:

Mir ist gegeben alle Gewalt im Himmel und auf Erden. Darum gehet hin und machet zu Jüngern alle Völker: Taufet sie auf den Namen des Vaters und des Sohnes und des heiligen Geistes und lehret sie halten alles, was ich euch befohlen habe. Und siehe, ich bin bei euch alle Tage bis an der Welt Ende.
Matthäus 28, 18–20`;

const psalm112 = `Wohl dem, der barmherzig ist und gerne leiht
und das Seine tut, wie es recht ist!

Denn er wird ewiglich bleiben;
der Gerechte wird nimmermehr vergessen.

Vor schlimmer Kunde fürchtet er sich nicht;
sein Herz hofft unverzagt auf den Herrn.

Sein Herz ist getrost und fürchtet sich nicht,
bis er auf seine Feinde herabsieht.
Er streut aus und gibt den Armen;
seine Gerechtigkeit bleibt ewiglich.
Seine Kraft wird hoch in Ehren stehen.`;

const sanctus = `Heilig, heilig, heilig ist der Herr Zebaoth!
Alle Lande sind seiner Ehre voll.
Hosianna in der Höhe!
Gelobet sei der da kommt im Namen des Herrn.
Hosianna in der Höhe!`;

const agnusDei = `Christe, du Lamm Gottes,
der du trägst die Sünd der Welt,
Erbarm dich unser!
Christe, du Lamm Gottes,
der du trägst die Sünd der Welt,
Erbarm dich unser!
Christe, du Lamm Gottes,
der du trägst die Sünd der Welt,
Gib uns deinen Frieden!
Amen.`;

export const badenDurmersheimLiturgy: LiturgyDefinition = {
    id: 'baden-durmersheim',
    version: 1,
    organizationId: 'ekiba',
    name: 'Badische Liturgie (Durmersheim)',
    tags: ['baden', 'durmersheim', 'taufe', 'abendmahl'],
    language: 'de',
    tradition: 'badisch',
    serviceType: 'Gottesdienst',
    optionalSectionMode: 'single',
    print: {
        congregationName: 'Ev. Kirchengemeinde Durmersheim',
        participantColor: '#0066cc',
        participantNotice: 'Alle Teile der Gemeinde in blau (auch für Präsentation!)',
    },
    nodes: [
        {
            id: 'baptism-service',
            type: 'optionalSection',
            sectionKey: 'baptism',
            label: 'Taufen',
            nodes: [
                { id: 'baptism-prelude', type: 'heading', text: 'Präludium' },
                { id: 'baptism-greeting', type: 'heading', text: 'Begrüßung', responsible: '[Predigt]' },
                { id: 'baptism-weekly-verse', type: 'freeTextSlot', slot: 'baptismWeeklyVerse', label: 'Wochenspruch', required: true },
                { id: 'baptism-opening-song', type: 'songSlot', slot: 'baptismOpeningSong', label: 'Eingangslied', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Eingangslied' } },
                { id: 'baptism-votum', type: 'fixedText', label: 'Votum', text: 'Im Namen des Vaters und des Sohnes und des Heiligen Geistes.', responsible: '[Predigt]' },
                { id: 'baptism-votum-response', type: 'fixedText', text: 'Gemeinde: Amen.', print: { audience: 'congregation', alignment: 'center' } },
                { id: 'baptism-opening-prayer', type: 'heading', text: 'Eingangsgebet', responsible: '[Predigt]' },
                { id: 'baptism-command', type: 'fixedText', label: 'Taufbefehl', text: baptismCommand, responsible: '[Ältestendienst]' },
                { id: 'baptism-address-prayer', type: 'heading', text: 'Anrede und Gebet', responsible: '[Predigt]' },
                { id: 'baptism-creed', type: 'creed', label: 'Glaubensbekenntnis', creed: apostolicCreed, print: { audience: 'congregation' } },
                { id: 'baptism-commitment', type: 'heading', text: 'Anrede und Verpflichtung', responsible: '[Predigt]' },
                { id: 'baptism-act', type: 'heading', text: 'Taufe', responsible: '[Predigt]' },
                { id: 'baptism-song', type: 'songSlot', slot: 'baptismSong', label: 'Lied vor der Predigt', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Lied zur Taufe' } },
                { id: 'baptism-sermon', type: 'sermonSlot', slot: 'sermon', label: 'Predigt', required: true, responsible: '[Predigt]', print: { summaryLabel: 'Predigt' } },
                { id: 'baptism-after-sermon-song', type: 'songSlot', slot: 'baptismAfterSermonSong', label: 'Lied nach der Predigt', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Lied nach der Predigt' } },
                { id: 'baptism-prayer', type: 'heading', text: 'Gebet', responsible: '[Predigt]' },
                { id: 'baptism-lords-prayer', type: 'prayer', label: 'Vaterunser', text: lordsPrayer, print: { audience: 'congregation', alignment: 'indent' } },
                { id: 'baptism-closing-song', type: 'songSlot', slot: 'baptismClosingSong', label: 'Schlusslied', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Schlusslied', columnBreakBefore: true } },
                { id: 'baptism-announcements', type: 'heading', text: 'Abkündigungen', responsible: '[Ältestendienst]' },
                { id: 'baptism-blessing', type: 'fixedText', label: 'Segen', text: blessing, responsible: '[Predigt]' },
                { id: 'baptism-blessing-response', type: 'fixedText', text: 'Gemeinde: Amen. Amen. Amen.', print: { audience: 'congregation', alignment: 'center' } },
                { id: 'baptism-postlude', type: 'heading', text: 'Postludium', responsible: '[Orgel / Klavier]' },
            ],
        },
        {
            id: 'communion-service',
            type: 'optionalSection',
            sectionKey: 'communion',
            label: 'Abendmahl',
            nodes: [
                { id: 'communion-prelude', type: 'heading', text: 'Präludium' },
                { id: 'communion-greeting', type: 'heading', text: 'Begrüßung', responsible: '[Predigt]' },
                { id: 'communion-weekly-verse', type: 'freeTextSlot', slot: 'communionWeeklyVerse', label: 'Wochenspruch', required: true },
                { id: 'communion-opening-song', type: 'songSlot', slot: 'communionOpeningSong', label: 'Eingangslied', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Eingangslied' } },
                { id: 'communion-votum', type: 'fixedText', label: 'Votum', text: 'Im Namen des Vaters und des Sohnes und des Heiligen Geistes.', responsible: '[Predigt]' },
                { id: 'communion-votum-response', type: 'fixedText', text: 'Gemeinde: Amen.', print: { audience: 'congregation', alignment: 'center' } },
                { id: 'communion-psalm', type: 'songSlot', slot: 'psalmSong', label: 'Eingangspsalm', required: true, print: { audience: 'congregation', summaryLabel: 'Psalm' } },
                { id: 'communion-psalm-text', type: 'fixedText', text: psalm112, print: { audience: 'congregation', continuation: true } },
                { id: 'communion-gloria', type: 'songSlot', slot: 'gloriaSong', label: 'Gloria', required: true, print: { audience: 'congregation' } },
                { id: 'communion-prayer', type: 'heading', text: 'Gebet', responsible: '[Predigt]' },
                { id: 'communion-kyrie-invocation', type: 'fixedText', text: 'Kyrie eleison.' },
                { id: 'communion-kyrie', type: 'songSlot', slot: 'kyrieSong', label: 'Kyrie', required: true, print: { audience: 'congregation' } },
                { id: 'communion-kyrie-response', type: 'fixedText', text: 'Kyrie eleison – Kyrie eleison – Kyrie eleison', print: { audience: 'congregation', alignment: 'center' } },
                { id: 'communion-absolution', type: 'heading', text: 'Gnadenzuspruch', responsible: '[Predigt]' },
                { id: 'communion-praise-song', type: 'songSlot', slot: 'praiseSong', label: 'Lobvers (im Stehen)', required: true, print: { audience: 'congregation', summaryLabel: 'Loblied' } },
                { id: 'communion-reading', type: 'readingSlot', slot: 'gospel', label: 'Lesung', required: true, responsible: '[Ältestendienst]', print: { summaryLabel: 'Lesung' } },
                { id: 'communion-reading-text', type: 'freeTextSlot', slot: 'gospelText', label: 'Lesungstext', required: true, print: { continuation: true } },
                { id: 'communion-creed', type: 'creed', label: 'Credo', creed: apostolicCreed, print: { audience: 'congregation', alignment: 'indent' } },
                { id: 'communion-before-sermon-song', type: 'songSlot', slot: 'communionBeforeSermonSong', label: 'Lied vor der Predigt', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Lied vor der Predigt' } },
                { id: 'communion-sermon', type: 'sermonSlot', slot: 'sermon', label: 'Predigt', required: true, responsible: '[Predigt]', print: { summaryLabel: 'Predigt' } },
                { id: 'communion-after-sermon-song', type: 'songSlot', slot: 'communionAfterSermonSong', label: 'Lied nach der Predigt', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Lied nach der Predigt' } },
                {
                    id: 'communion-lords-table',
                    type: 'communionSection',
                    label: 'Abendmahl',
                    nodes: [
                        { id: 'communion-heading', type: 'heading', text: 'Abendmahl' },
                        { id: 'communion-hearts-call', type: 'fixedText', text: 'Erhebet eure Herzen!' },
                        { id: 'communion-hearts-response', type: 'fixedText', text: 'Wir erheben sie zum Herren', print: { audience: 'congregation', alignment: 'center' } },
                        { id: 'communion-thanks-call', type: 'fixedText', text: 'Lasset uns Dank sagen dem Herrn, unsern Gott!' },
                        { id: 'communion-thanks-response', type: 'fixedText', text: 'Das ist würdig und recht!', print: { audience: 'congregation', alignment: 'center' } },
                        { id: 'communion-preface', type: 'fixedText', label: 'Präfation', text: '…\n\nMit ihnen lass auch unsere Stimmen sich\nvereinen und ohne Ende bekennen:', responsible: '[Predigt]' },
                        { id: 'communion-sanctus', type: 'fixedText', label: '(EG 185.3)', text: sanctus, print: { audience: 'congregation', alignment: 'indent' } },
                        { id: 'communion-institution', type: 'heading', text: 'Einsetzungsworte', responsible: '[Predigt]' },
                        { id: 'communion-eucharistic-prayer', type: 'heading', text: 'Eucharistiegebet', responsible: '[Predigt]' },
                        { id: 'communion-lords-prayer', type: 'prayer', label: 'Vaterunser', text: lordsPrayer, print: { audience: 'congregation', alignment: 'indent' } },
                        { id: 'communion-anamnesis', type: 'fixedText', label: 'Anamnese', text: 'So oft ihr von diesem Brot esst und aus diesem Kelch trinkt, verkündigt ihr den Tod unseres Herrn, bis er wiederkommt:', responsible: '[Predigt]' },
                        { id: 'communion-agnus-dei', type: 'fixedText', label: '(EG 190.2)', text: agnusDei, print: { audience: 'congregation', alignment: 'indent' } },
                        { id: 'communion-distribution', type: 'fixedText', label: 'Austeilung', text: 'Musikspiel bei der Austeilung', responsible: '[Orgel / Klavier]' },
                    ],
                },
                { id: 'communion-intercessions', type: 'heading', text: 'Fürbittengebet', responsible: '[Predigt]' },
                { id: 'communion-closing-song', type: 'songSlot', slot: 'communionClosingSong', label: 'Schlusslied', required: true, responsible: '[Orgel / Klavier]', print: { audience: 'congregation', summaryLabel: 'Schlusslied' } },
                { id: 'communion-announcements', type: 'heading', text: 'Abkündigungen', responsible: '[Ältestendienst]' },
                { id: 'communion-blessing', type: 'fixedText', label: 'Sendung und Segen', text: blessing, responsible: '[Predigt]' },
                { id: 'communion-blessing-response', type: 'fixedText', text: 'Gemeinde: Amen, Amen, Amen.', print: { audience: 'congregation', alignment: 'center' } },
                { id: 'communion-postlude', type: 'heading', text: 'Postludium', responsible: '[Orgel / Klavier]' },
            ],
        },
    ],
};
