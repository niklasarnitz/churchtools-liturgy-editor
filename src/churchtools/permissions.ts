import type { GetPermissionsGlobalResponse } from '@churchtools/api-types';
import type { ChurchToolsRequestClient } from './request';
import type { NativeGlobalPermissions } from './types';
import { ChurchToolsError } from './errors';

export type PermissionValue = boolean | number[] | undefined;

function isPermissionRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

export class ChurchToolsPermissionsAdapter {
    private readonly client: ChurchToolsRequestClient;
    private globalPermissions?: NativeGlobalPermissions;
    private globalPermissionsRequest?: Promise<NativeGlobalPermissions>;
    private permissionsLoadedAt = 0;

    constructor(client: ChurchToolsRequestClient) {
        this.client = client;
    }

    getGlobal(): Promise<NativeGlobalPermissions> {
        if (this.globalPermissions && Date.now() - this.permissionsLoadedAt < 2 * 60_000) return Promise.resolve(this.globalPermissions);
        if (this.globalPermissionsRequest) return this.globalPermissionsRequest;
        this.globalPermissionsRequest = this.client.get<GetPermissionsGlobalResponse['data']>('/permissions/global')
            .then((permissions) => {
                this.globalPermissions = permissions;
                this.permissionsLoadedAt = Date.now();
                return permissions;
            })
            .finally(() => {
                this.globalPermissionsRequest = undefined;
            });
        return this.globalPermissionsRequest;
    }

    /** Reload permissions after an explicit host-side permission change. */
    invalidate(): void {
        this.globalPermissions = undefined;
        this.permissionsLoadedAt = 0;
    }

    async can(moduleName: string, permission: string, dataId?: number): Promise<boolean> {
        const permissions = await this.getGlobal();
        const modulePermissions = permissions[moduleName];
        if (!isPermissionRecord(modulePermissions)) return false;
        const value = modulePermissions[permission];
        if (value === true) return true;
        if (!isNumberArray(value)) return false;
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

    /** Global installation settings and song catalog changes are managed through ChurchTools master data. */
    async canManageSettings(): Promise<boolean> {
        return this.can('churchservice', 'edit masterdata');
    }

    async assertSettingsWrite(): Promise<void> {
        await this.assert('churchservice', 'edit masterdata');
    }

    async assertAgendaRead(calendarId?: number): Promise<void> {
        await this.assert('churchservice', 'view agenda', calendarId);
    }

    async assertAgendaWrite(calendarId?: number): Promise<void> {
        await this.assert('churchservice', 'edit agenda', calendarId);
    }
}
