import { describe, expect, it, vi } from 'vitest';

import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsPermissionsAdapter } from './permissions';

describe('ChurchToolsPermissionsAdapter', () => {
    it('refreshes permissions after the cache lifetime', async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
            let requests = 0;
            const client = {
                get: (async () => {
                    requests += 1;
                    return { churchservice: { 'edit agenda': requests === 1 } };
                }) as ChurchToolsRequestClient['get'],
            } as ChurchToolsRequestClient;
            const permissions = new ChurchToolsPermissionsAdapter(client);
            await expect(permissions.can('churchservice', 'edit agenda')).resolves.toBe(true);
            vi.advanceTimersByTime(2 * 60_000);
            await expect(permissions.can('churchservice', 'edit agenda')).resolves.toBe(false);
            expect(requests).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });
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

    it('uses ChurchTools master-data permission for global settings changes', async () => {
        const client = {
            get: (async () => ({ churchservice: { 'edit masterdata': true } })) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const permissions = new ChurchToolsPermissionsAdapter(client);

        await expect(permissions.canManageSettings()).resolves.toBe(true);
        await expect(permissions.assertSettingsWrite()).resolves.toBeUndefined();
    });

    it('denies global settings changes when master-data permission is missing', async () => {
        const client = {
            get: (async () => ({ churchservice: { view: true } })) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const permissions = new ChurchToolsPermissionsAdapter(client);

        await expect(permissions.canManageSettings()).resolves.toBe(false);
        await expect(permissions.assertSettingsWrite()).rejects.toMatchObject({ kind: 'forbidden', status: 403 });
    });
});
