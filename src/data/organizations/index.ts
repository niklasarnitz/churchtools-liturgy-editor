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
        liturgyIds: ['selk-order-1', 'selk-order-1-communion', 'selk-order-2', 'selk-free-order'],
        lectionaryIds: [],
    },
    {
        id: 'lcms',
        name: 'Lutheran Church—Missouri Synod',
        shortName: 'LCMS',
        language: 'en',
        hymnalIds: ['lutheran-service-book'],
        liturgyIds: ['lcms-divine-service-1', 'lcms-divine-service-2', 'lcms-divine-service-3', 'lcms-divine-service-4', 'lcms-divine-service-5', 'lcms-free-order'],
        lectionaryIds: [],
    },
] satisfies OrganizationDefinition[];

export const organizationsById = Object.fromEntries(organizations.map((organization) => [organization.id, organization]));
