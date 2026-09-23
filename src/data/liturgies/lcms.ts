import type { LiturgyDefinition, LiturgyNode } from './types';

/** LSB outlines only. The spoken and sung texts belong in the licensed service book. */
type Setting = 1 | 2 | 3 | 4 | 5;

const part = (setting: Setting, key: string, text: string): LiturgyNode => ({
    id: `lcms-ds${setting}-${key}`, type: 'rubric', text,
});

const heading = (setting: Setting, key: string, text: string): LiturgyNode => ({
    id: `lcms-ds${setting}-${key}`, type: 'heading', text,
});

const song = (setting: Setting, key: string, label: string): LiturgyNode => ({
    id: `lcms-ds${setting}-${key}`, type: 'songSlot', slot: key, label,
});

const settingNodes = (setting: Setting): LiturgyNode[] => {
    const p = (key: string, text: string) => part(setting, key, text);
    const h = (key: string, text: string) => heading(setting, key, text);
    const s = (key: string, text: string) => song(setting, key, text);
    const chorale = setting === 5;
    return [
        h('preparation', 'Confession and Absolution'),
        p('invocation', 'Invocation'),
        p('confession', 'Confession'),
        p('absolution', 'Absolution'),
        h('word', 'Service of the Word'),
        s('entranceHymn', 'Entrance Hymn'),
        p('introit', chorale ? 'Introit or Psalm' : 'Introit'),
        p('kyrie', chorale ? 'Kyrie (chorale)' : setting === 4 ? 'Kyrie (hymn setting)' : 'Kyrie'),
        p('gloria', chorale ? 'Gloria (chorale)' : setting === 4 ? 'Gloria in Excelsis (hymn setting)' : setting <= 2 ? 'Gloria in Excelsis or This Is the Feast' : 'Gloria in Excelsis'),
        p('salutation', 'Salutation'),
        p('collect', 'Collect of the Day'),
        { id: `lcms-ds${setting}-old-testament`, type: 'readingSlot', slot: 'oldTestament', label: 'Old Testament Reading' },
        p('gradual', 'Gradual or Psalm'),
        { id: `lcms-ds${setting}-epistle`, type: 'readingSlot', slot: 'epistle', label: 'Epistle Reading' },
        p('alleluia', 'Alleluia and Verse or Lenten Verse'),
        { id: `lcms-ds${setting}-gospel`, type: 'readingSlot', slot: 'gospel', label: 'Holy Gospel', required: true },
        p('creed', chorale ? 'Creed (spoken or chorale)' : 'Nicene Creed'),
        s('hymnOfTheDay', 'Hymn of the Day'),
        { id: `lcms-ds${setting}-sermon`, type: 'sermonSlot', slot: 'sermon', label: 'Sermon', required: true },
        p('offertory', 'Offertory'),
        p('offering', 'Offering'),
        p('prayer', 'Prayer of the Church'),
        h('sacrament', 'Service of the Sacrament'),
        p('preface', 'Preface and Proper Preface'),
        p('sanctus', chorale ? 'Sanctus (chorale)' : setting === 4 ? 'Sanctus (hymn setting)' : 'Sanctus'),
        p('lords-prayer', 'Lord’s Prayer'),
        p('institution', 'The Words of Our Lord'),
        p('pax-domini', 'Pax Domini'),
        p('agnus-dei', chorale ? 'Agnus Dei (chorale)' : setting === 4 ? 'Agnus Dei (hymn setting)' : 'Agnus Dei'),
        p('distribution', 'Distribution'),
        s('distributionHymn', 'Distribution Hymn'),
        h('post-communion', 'Post-Communion'),
        p('post-communion-canticle', setting === 5 ? 'Post-Communion Canticle'
            : setting === 3 || setting === 4 ? 'Nunc Dimittis' : 'Thank the Lord or Nunc Dimittis'),
        p('thanksgiving', 'Post-Communion Thanksgiving'),
        p('benedicamus', 'Benedicamus'),
        p('benediction', 'Benediction'),
        s('closingHymn', 'Closing Hymn'),
    ];
};

export const lcmsLiturgies: LiturgyDefinition[] = ([1, 2, 3, 4, 5] as const).map((setting) => ({
    id: `lcms-divine-service-${setting}`,
    version: 1,
    organizationId: 'lcms',
    name: `Divine Service, Setting ${['', 'One', 'Two', 'Three', 'Four', 'Five'][setting]}`,
    tags: ['LSB', 'Divine Service', `Setting ${setting}`, 'Holy Communion', 'outline only'],
    language: 'en',
    tradition: 'LCMS',
    serviceType: 'Divine Service',
    nodes: settingNodes(setting),
}));
