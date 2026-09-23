export interface HymnalSong {
    id: string;
    number: string;
    title: string;
    author?: string;
    copyright?: string;
    ccli?: string;
    metadata?: Record<string, unknown>;
}

export interface HymnalDefinition {
    id: string;
    version: number;
    name: string;
    shortName: string;
    organizationIds: string[];
    language: string;
    description?: string;
    metadata?: Record<string, unknown>;
    songs: HymnalSong[];
}
