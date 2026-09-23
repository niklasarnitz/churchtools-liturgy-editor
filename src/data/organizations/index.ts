import type { OrganizationDefinition } from './types';

export type { OrganizationDefinition } from './types';

export const organizations = [
    {
        id: 'ekiba',
        name: 'Evangelische Landeskirche in Baden',
        shortName: 'EKiBa',
        language: 'de',
        hymnalIds: ['eg-baden'],
        liturgyIds: ['baden-durmersheim'],
        lectionaryIds: [],
    },
    {
        id: 'elkb',
        name: 'Evangelisch-Lutherische Kirche in Bayern',
        shortName: 'ELKB',
        language: 'de',
        hymnalIds: [],
        liturgyIds: [],
        lectionaryIds: [],
    },
    {
        id: 'elk-wue',
        name: 'Evangelische Landeskirche in Württemberg',
        shortName: 'ELK-WUE',
        language: 'de',
        hymnalIds: [],
        liturgyIds: [],
        lectionaryIds: [],
    },
    {
        id: 'selk',
        name: 'Selbständige Evangelisch-Lutherische Kirche',
        shortName: 'SELK',
        language: 'de',
        hymnalIds: ['elkg2'],
        liturgyIds: [],
        lectionaryIds: [],
    },
    {
        id: 'lcms',
        name: 'Lutheran Church—Missouri Synod',
        shortName: 'LCMS',
        language: 'en',
        hymnalIds: ['lutheran-service-book'],
        liturgyIds: [],
        lectionaryIds: [],
    },
] satisfies OrganizationDefinition[];

export const organizationsById = Object.fromEntries(organizations.map((organization) => [organization.id, organization]));
