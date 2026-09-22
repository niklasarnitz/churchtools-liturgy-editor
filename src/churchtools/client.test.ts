import { describe, expect, it } from 'vitest';

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
});
