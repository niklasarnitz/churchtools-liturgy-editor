import type { OrganizationDefinition } from '../../data/organizations/types';
import type { LectionaryDefinition, LiturgicalDay, ScriptureReference } from '../../data/lectionaries/types';
import type { LiturgyDefinition } from '../../data/liturgies/types';

export interface LiturgicalDayOverrides {
    name?: string;
    color?: string;
    season?: string;
    sermonSeries?: string;
    readings?: Partial<LiturgicalDay['readings']>;
    weeklyPsalm?: string;
    weeklyHymn?: string;
}

export interface LectionaryResolverInput {
    date: string | Date;
    organization: OrganizationDefinition;
    liturgy?: Pick<LiturgyDefinition, 'lectionaryId'>;
    lectionaryId?: string;
    lectionaries: LectionaryDefinition[];
    overrides?: LiturgicalDayOverrides;
}

export const toIsoDate = (value: string | Date): string => {
    if (typeof value === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid liturgical date: ${value}`);
        return value;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const selectLectionary = (
    organization: OrganizationDefinition,
    lectionaries: LectionaryDefinition[],
    explicitId?: string,
    liturgy?: Pick<LiturgyDefinition, 'lectionaryId'>,
): LectionaryDefinition | undefined => {
    const selectedId = explicitId ?? liturgy?.lectionaryId ?? organization.lectionaryIds[0];
    if (!selectedId) return undefined;

    const lectionary = lectionaries.find((candidate) => candidate.id === selectedId);
    if (!lectionary) throw new Error(`Lectionary "${selectedId}" is not installed`);
    if (!lectionary.organizationIds.includes(organization.id)) {
        throw new Error(`Lectionary "${selectedId}" is not configured for organization "${organization.id}"`);
    }
    return lectionary;
};

const applyOverrides = (day: LiturgicalDay, overrides?: LiturgicalDayOverrides): LiturgicalDay => {
    if (!overrides) return structuredClone(day);
    return {
        ...structuredClone(day),
        ...overrides,
        readings: {
            ...day.readings,
            ...overrides.readings,
        },
    };
};

export const resolveLiturgicalDay = (input: LectionaryResolverInput): LiturgicalDay | undefined => {
    const date = toIsoDate(input.date);
    const lectionary = selectLectionary(input.organization, input.lectionaries, input.lectionaryId, input.liturgy);
    if (!lectionary) return undefined;
    const day = lectionary.days.find((candidate) => candidate.date === date);
    return day ? applyOverrides(day, input.overrides) : undefined;
};

export const formatScriptureReference = (reference: ScriptureReference): string =>
    reference.translation ? `${reference.reference} (${reference.translation})` : reference.reference;
