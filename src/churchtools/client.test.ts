import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChurchToolsClientAdapter } from './client';
import type { ChurchToolsRequestClient } from './request';

const networkError = () => Object.assign(new Error('network'), { status: undefined });

function fakeClient(overrides: Partial<ChurchToolsRequestClient>): ChurchToolsRequestClient {
    return {
        get: async () => { throw new Error('unexpected GET'); },
        post: async () => { throw new Error('unexpected POST'); },
        put: async () => { throw new Error('unexpected PUT'); },
        deleteApi: async () => { throw new Error('unexpected DELETE'); },
        ...overrides,
    } as ChurchToolsRequestClient;
}

describe('ChurchToolsClientAdapter retries', () => {
    afterEach(() => vi.useRealTimers());

    it('retries an idempotent GET after a network failure', async () => {
        let attempts = 0;
        const adapter = new ChurchToolsClientAdapter(fakeClient({
            get: (async () => {
                attempts += 1;
                if (attempts === 1) throw networkError();
                return { id: 1 };
            }) as ChurchToolsRequestClient['get'],
        }));

        await expect(adapter.get('/events/1')).resolves.toEqual({ id: 1 });
        expect(attempts).toBe(2);
    });

    it('never retries a non-idempotent POST after an ambiguous network failure', async () => {
        let attempts = 0;
        const adapter = new ChurchToolsClientAdapter(fakeClient({
            post: async () => {
                attempts += 1;
                throw networkError();
            },
        }));

        await expect(adapter.post('/songs', { name: 'Test' })).rejects.toMatchObject({ kind: 'network' });
        expect(attempts).toBe(1);
    });

    it('paces concurrent request starts without waiting for earlier responses', async () => {
        const starts: number[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
        const adapter = new ChurchToolsClientAdapter(fakeClient({
            post: async <T>() => {
                starts.push(Date.now());
                if (starts.length === 1) await firstResponse;
                return { ok: true } as T;
            },
        }), { minimumRequestIntervalMs: 15 });

        const requests = [
            adapter.post('/songs', { name: 'One' }),
            adapter.post('/songs', { name: 'Two' }),
            adapter.post('/songs', { name: 'Three' }),
        ];
        const deadline = Date.now() + 250;
        while (starts.length < 3 && Date.now() < deadline) {
            await new Promise<void>((resolve) => setTimeout(resolve, 5));
        }
        expect(starts).toHaveLength(3);
        expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(14);
        expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(14);
        releaseFirst?.();
        await Promise.all(requests);
    });

    it('paces each physical retry attempt alongside other queued requests', async () => {
        const starts: Array<{ method: 'get' | 'post'; at: number }> = [];
        let getAttempts = 0;
        const adapter = new ChurchToolsClientAdapter(fakeClient({
            get: (async <T>() => {
                starts.push({ method: 'get', at: Date.now() });
                getAttempts += 1;
                if (getAttempts === 1) throw networkError();
                return { ok: true } as T;
            }) as ChurchToolsRequestClient['get'],
            post: async <T>() => {
                starts.push({ method: 'post', at: Date.now() });
                return { ok: true } as T;
            },
        }), { minimumRequestIntervalMs: 200 });

        await Promise.all([
            adapter.get('/events'),
            adapter.post('/songs', { name: 'Queued' }),
        ]);

        expect(starts.map((start) => start.method)).toEqual(['get', 'post', 'get']);
        expect(starts[1].at - starts[0].at).toBeGreaterThanOrEqual(190);
        expect(starts[2].at - starts[1].at).toBeGreaterThanOrEqual(190);
    });
});
