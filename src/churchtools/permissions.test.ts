import { describe, expect, it } from 'vitest';

import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsPermissionsAdapter } from './permissions';

describe('ChurchToolsPermissionsAdapter', () => {
    it('shares one global-permission request across event checks', async () => {
        let requests = 0;
        let resolveRequest: ((value: unknown) => void) | undefined;
        const response = new Promise((resolve) => { resolveRequest = resolve; });
        const client = {
            get: (async (uri: string) => {
                expect(uri).toBe('/permissions/global');
                requests += 1;
                return response;
            }) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const permissions = new ChurchToolsPermissionsAdapter(client);

        const checks = [permissions.assertAgendaRead(1), permissions.assertAgendaRead(2)];
        expect(requests).toBe(1);
        resolveRequest?.({ churchservice: { view: true, 'view agenda': [1, 2] } });

        await expect(Promise.all(checks)).resolves.toEqual([undefined, undefined]);
        await permissions.assertSongRead();
        expect(requests).toBe(1);
    });

    it('does not cache a failed permission request', async () => {
        let requests = 0;
        const client = {
            get: (async () => {
                requests += 1;
                if (requests === 1) throw new Error('temporary failure');
                return { churchservice: { view: true } };
            }) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const permissions = new ChurchToolsPermissionsAdapter(client);

        await expect(permissions.assertSongRead()).rejects.toThrow('temporary failure');
        await expect(permissions.assertSongRead()).resolves.toBeUndefined();
        expect(requests).toBe(2);
    });
});
