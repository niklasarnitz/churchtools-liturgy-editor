export interface ScriptureReference {
    reference: string;
    translation?: string;
}

export interface LiturgicalDay {
    id: string;
    date: string;
    name: string;
    color?: string;
    season?: string;
    sermonSeries?: string;
    readings: {
        oldTestament?: ScriptureReference;
        epistle?: ScriptureReference;
        gospel?: ScriptureReference;
        sermon?: ScriptureReference;
    };
    weeklyPsalm?: string;
    weeklyHymn?: string;
}

export interface LectionaryDefinition {
    id: string;
    version: number;
    name: string;
    language: string;
    organizationIds: string[];
    days: LiturgicalDay[];
}
