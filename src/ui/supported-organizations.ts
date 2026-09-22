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
        description: 'Bekenntnislutherische Kirche mit englischsprachiger Liturgie und Kirchengesangbuch LSB.',
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
        description: 'Selbständige Evangelisch-Lutherische Kirche mit lutherischem Hauptgottesdienst und Gesangbuch ELKG².',
        icon: 'fas fa-cross',
    },
];
