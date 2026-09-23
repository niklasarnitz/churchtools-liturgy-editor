export interface SupportedOrganizationConfig {
    id: string;
    displayName: string;
    subtitle: string;
    shortName: string;
    language: string;
    region: string;
    hymnalName: string;
    songCount: number;
    description: string;
    icon: string;
}

export const SUPPORTED_ORGANIZATIONS: SupportedOrganizationConfig[] = [
    {
        id: 'lcms',
        displayName: 'LCMS – Lutheran Church—Missouri Synod',
        subtitle: 'Lutheran Church—Missouri Synod',
        shortName: 'LCMS',
        language: 'Englisch (en)',
        region: 'Nordamerika / International',
        hymnalName: 'Lutheran Service Book (LSB)',
        songCount: 636,
        description: 'Lutheran Service Book mit englischsprachigen Liedern und editierbaren Ablaufvorlagen für die fünf Divine-Service-Settings. Die Vorlagen enthalten keine liturgischen Volltexte.',
        icon: 'fas fa-church',
    },
    {
        id: 'ekiba',
        displayName: 'Evangelische Kirche Baden (EKiBa)',
        subtitle: 'Evangelische Landeskirche in Baden',
        shortName: 'EKiBa',
        language: 'Deutsch (de)',
        region: 'Baden (Deutschland)',
        hymnalName: 'Evangelisches Gesangbuch (EG Baden)',
        songCount: 786,
        description: 'Evangelische Landeskirche in Baden mit Predigtgottesdienst-Liturgie und EG-Regionalteil Baden.',
        icon: 'fas fa-church',
    },
    {
        id: 'selk',
        displayName: 'SELK – Selbständige Evangelisch-Lutherische Kirche',
        subtitle: 'Selbständige Evangelisch-Lutherische Kirche',
        shortName: 'SELK',
        language: 'Deutsch (de)',
        region: 'Deutschland',
        hymnalName: 'Evang.-Luth. Kirchengesangbuch² (ELKG²)',
        songCount: 864,
        description: 'ELKG² mit Liedern und Nummern sowie Strukturvorlagen für Ordnung 1 und 2; liturgische Texte und Gesänge werden vor Ort ergänzt.',
        icon: 'fas fa-cross',
    },
];
