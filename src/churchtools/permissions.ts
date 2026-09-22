import type { ChurchToolsRequestClient } from './request';
import type { NativeGlobalPermissions } from './types';
import { ChurchToolsError } from './errors';

export type PermissionValue = boolean | number[] | undefined;

export class ChurchToolsPermissionsAdapter {
    private readonly client: ChurchToolsRequestClient;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    getGlobal(): Promise<NativeGlobalPermissions> {
        return this.client.get<NativeGlobalPermissions>('/permissions/global');
    }

    async can(moduleName: string, permission: string, dataId?: number): Promise<boolean> {
        const permissions = await this.getGlobal();
        const modulePermissions = permissions[moduleName];
        if (!modulePermissions) return false;
        const value = modulePermissions[permission] as PermissionValue;
        if (value === true) return true;
        if (!Array.isArray(value)) return false;
        return dataId !== undefined ? value.includes(dataId) : value.length > 0;
    }

    async assert(moduleName: string, permission: string, dataId?: number): Promise<void> {
        if (!(await this.can(moduleName, permission, dataId))) {
            throw new ChurchToolsError(
                `Missing ChurchTools permission: ${moduleName}/${permission}`,
                { kind: 'forbidden', status: 403 },
            );
        }
    }

    async assertSongRead(): Promise<void> {
        await this.assert('churchservice', 'view');
    }

    async assertSongWrite(): Promise<void> {
        await this.assert('churchservice', 'edit masterdata');
    }

    async assertAgendaRead(calendarId?: number): Promise<void> {
        await this.assert('churchservice', 'view agenda', calendarId);
    }

    async assertAgendaWrite(calendarId?: number): Promise<void> {
        await this.assert('churchservice', 'edit agenda', calendarId);
    }
}
