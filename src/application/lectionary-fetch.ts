import type { LiturgicalDay, ScriptureReference } from '../data/lectionaries/types';
import type { ExternalLectionarySource } from './types';

export type LectionaryFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch adapter for the separate lectionar service. It deliberately does not
 * use the ChurchTools client: that client owns the ChurchTools base URL and
 * its authentication/CSRF conventions.
 */
export class FetchLectionarySource implements ExternalLectionarySource {
    private readonly endpoint: string;
    private readonly fetcher: LectionaryFetch;

    constructor(baseUrl: string, fetcher: LectionaryFetch = (input, init) => fetch(input, init)) {
        const normalized = baseUrl.trim().replace(/\/+$/, '');
        if (!normalized) throw new Error('A lectionary API base URL is required.');
        this.endpoint = normalized.endsWith('/api/church-year')
            ? normalized
            : `${normalized}/api/church-year`;
        this.fetcher = fetcher;
    }

    async fetchDay(input: { date: string; organizationId: string; lectionaryId?: string }): Promise<LiturgicalDay | undefined> {
        const query = new URLSearchParams({ date: input.date, organizationId: input.organizationId });
        if (input.lectionaryId) query.set('lectionaryId', input.lectionaryId);

        const response = await this.fetcher(`${this.endpoint}?${query.toString()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        const payload = await readJson(response);
        if (!response.ok) throw new Error(externalErrorMessage(response.status, payload));
        if (payload === null || payload === undefined) return undefined;
        return normalizeLiturgicalDay(payload);
    }
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}

function externalErrorMessage(status: number, payload: unknown): string {
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) return payload.error;
    return `Lectionary request failed (${status}).`;
}

function normalizeLiturgicalDay(value: unknown): LiturgicalDay {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || typeof value.name !== 'string' || !isRecord(value.readings)) {
        throw new Error('Lectionary response is not a valid liturgical day.');
    }

    const readings: LiturgicalDay['readings'] = {};
    for (const key of ['oldTestament', 'epistle', 'gospel', 'sermon'] as const) {
        const reference = value.readings[key];
        if (reference === undefined) continue;
        if (!isRecord(reference) || typeof reference.reference !== 'string') {
            throw new Error(`Lectionary response contains an invalid ${key} reading.`);
        }
        readings[key] = normalizeReference(reference);
    }

    return {
        id: value.id,
        date: value.date,
        name: value.name,
        color: typeof value.color === 'string' ? value.color : undefined,
        season: typeof value.season === 'string' ? value.season : undefined,
        sermonSeries: typeof value.sermonSeries === 'string' ? value.sermonSeries : undefined,
        readings,
        weeklyPsalm: typeof value.weeklyPsalm === 'string' ? value.weeklyPsalm : undefined,
        weeklyHymn: normalizeWeeklyHymn(value.weeklyHymn),
    };
}

function normalizeReference(value: Record<string, unknown>): ScriptureReference {
    return {
        reference: value.reference as string,
        ...(typeof value.translation === 'string' ? { translation: value.translation } : {}),
    };
}

function normalizeWeeklyHymn(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (!isRecord(value) || typeof value.number !== 'string') return undefined;
    if (typeof value.hymnalId === 'string' && value.hymnalId.trim()) return `${value.hymnalId}:${value.number}`;
    return typeof value.title === 'string' && value.title.trim() ? value.title : value.number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
