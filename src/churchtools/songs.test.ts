import { describe, expect, it } from 'vitest';

import { ChurchToolsSongsAdapter } from './songs';
import type { ChurchToolsRequestClient } from './request';
import type { NativeArrangement } from './types';

describe('ChurchToolsSongsAdapter', () => {
    it('uses the dedicated PATCH endpoint instead of sending isDefault in the arrangement body', async () => {
        const requests: Array<{ method: string; uri: string; data?: Record<string, unknown> }> = [];
        const arrangement = { id: 7, name: 'Standard', isDefault: false } as NativeArrangement;
        const client = {
            get: async () => { throw new Error('unexpected GET'); },
            post: async (uri: string, data?: Record<string, unknown>) => {
                requests.push({ method: 'POST', uri, data });
                return arrangement;
            },
            put: async () => { throw new Error('unexpected PUT'); },
            patch: async (uri: string, data?: Record<string, unknown>) => {
                requests.push({ method: 'PATCH', uri, data });
            },
            deleteApi: async () => { throw new Error('unexpected DELETE'); },
        } as ChurchToolsRequestClient;

        const created = await new ChurchToolsSongsAdapter(client).createArrangement(3, {
            name: 'Standard',
            isDefault: true,
        });

        expect(requests).toEqual([
            { method: 'POST', uri: '/songs/3/arrangements', data: { name: 'Standard' } },
            { method: 'PATCH', uri: '/songs/3/arrangements/7/default', data: undefined },
        ]);
        expect(created.isDefault).toBe(true);
    });
});
