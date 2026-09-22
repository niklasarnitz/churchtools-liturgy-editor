import { describe, expect, it } from 'vitest';
import { FetchLectionarySource } from './lectionary-fetch';

const jsonResponse = (payload: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
}) as Response;

describe('FetchLectionarySource', () => {
    it('calls the separate church-year endpoint with encoded query parameters', async () => {
        let request: { input: string; init?: RequestInit } | undefined;
        const source = new FetchLectionarySource('https://lectionar.example.test/', async (input, init) => {
            request = { input, init };
            return jsonResponse({
                id: 'ekd:2026-11-29',
                date: '2026-11-29',
                name: '1. Sonntag im Advent',
                season: 'advent',
                readings: { gospel: { reference: 'Mt 21,1–11', label: 'Evangelium' } },
                weeklyHymn: { hymnalId: 'eg', number: '1', title: 'Macht hoch die Tür' },
            });
        });

        await expect(source.fetchDay({ date: '2026-11-29', organizationId: 'ekiba', lectionaryId: 'ekd' })).resolves.toMatchObject({
            id: 'ekd:2026-11-29',
            readings: { gospel: { reference: 'Mt 21,1–11' } },
            weeklyHymn: 'eg:1',
        });
        expect(request?.input).toBe('https://lectionar.example.test/api/church-year?date=2026-11-29&organizationId=ekiba&lectionaryId=ekd');
        expect(request?.init).toMatchObject({ method: 'GET', headers: { Accept: 'application/json' } });
    });

    it('preserves a configured endpoint when the API path is supplied directly', async () => {
        let requested = '';
        const source = new FetchLectionarySource('/lectionar/api/church-year', async (input) => {
            requested = input;
            return jsonResponse(null);
        });

        await source.fetchDay({ date: '2026-11-29', organizationId: 'ekiba' });
        expect(requested).toBe('/lectionar/api/church-year?date=2026-11-29&organizationId=ekiba');
    });

    it('surfaces API errors and rejects malformed successful responses', async () => {
        const failing = new FetchLectionarySource('https://lectionar.example.test', async () => jsonResponse({ error: 'Unknown church-year profile: bad' }, 400));
        await expect(failing.fetchDay({ date: '2026-11-29', organizationId: 'ekiba', lectionaryId: 'bad' })).rejects.toThrow('Unknown church-year profile: bad');

        const malformed = new FetchLectionarySource('https://lectionar.example.test', async () => jsonResponse({ id: 'missing-readings' }));
        await expect(malformed.fetchDay({ date: '2026-11-29', organizationId: 'ekiba' })).rejects.toThrow('valid liturgical day');
    });
});

