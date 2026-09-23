import { describe, expect, it } from 'vitest';
import { useWorkspace } from './useWorkspace';
import { resourceRegistry } from '../data/registry';
import type { WorkspaceEvent } from './types';
import type { LiturgyDefinition } from '../data/liturgies';
import type { HymnalDefinition } from '../data/hymnals';
import { ChurchToolsPermissionsAdapter } from '../churchtools/permissions';
import type { ChurchToolsRequestClient } from '../churchtools/request';

const testEvent: WorkspaceEvent = {
    id: 10,
    name: 'Sonntagsgottesdienst',
    startDate: '2026-09-27T10:00:00Z',
    calendar: {
        domainIdentifier: '4',
        domainAttributes: { campusName: 'Mitte' },
        domainType: 'calendar',
        frontendUrl: '/calendar/4',
        icon: 'calendar',
        title: 'Gottesdienste',
    },
    status: 'no-agenda',
};

const createWorkspace = () => {
    const values = new Map<string, unknown>();
    return useWorkspace({
        permissions: new ChurchToolsPermissionsAdapter({
            get: async () => ({ churchservice: { 'edit masterdata': true, 'edit agenda': true } }),
            post: async () => ({}),
            put: async () => ({}),
            deleteApi: async () => ({}),
        } as ChurchToolsRequestClient),
        state: {
            async get<T>(key: string) { return values.get(key) as T | undefined; },
            async set<T>(key: string, value: T) { values.set(key, value); },
            async delete(key: string) { values.delete(key); },
        },
    });
};

describe('useWorkspace connection status', () => {
    it('does not report online before a successful request, even when a base URL is configured', () => {
        const workspace = useWorkspace({ baseUrl: 'https://churchtools.example' });

        expect(workspace.apiConfigured).toBe(true);
        expect(workspace.isOnline).toBe(false);
    });
});

describe('useWorkspace installation settings and resource scoping', () => {
    it('initializes with empty scoped resources when no organization is configured', async () => {
        const workspace = createWorkspace();
        await workspace.loadSettings();

        expect(workspace.installationSettings.version).toBe(1);
        expect(workspace.installationSettings.organizationId).toBeUndefined();
        expect(workspace.selectedOrganization).toBeUndefined();
        expect(workspace.availableLiturgies).toEqual([]);
        expect(workspace.availableHymnals).toEqual([]);
        expect(workspace.availableLectionaries).toEqual([]);
    });

    it('scopes the Durmersheim liturgy and real hymnals without local lectionary fixtures', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization('ekiba');

        expect(workspace.installationSettings.organizationId).toBe('ekiba');
        expect(workspace.selectedOrganization?.id).toBe('ekiba');
        expect(workspace.selectedOrganization?.name).toBe('Evangelische Landeskirche in Baden');

        expect(workspace.availableLiturgies.map((liturgy) => liturgy.id)).toEqual(['baden-durmersheim']);

        expect(workspace.availableHymnals.length).toBeGreaterThan(0);
        expect(workspace.availableHymnals.every((h) => h.organizationIds.includes('ekiba'))).toBe(true);

        expect(workspace.availableLectionaries).toEqual([]);
    });

    it('fails closed when attempting to save an agenda without configured organization', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization(undefined);

        const liturgy: LiturgyDefinition = {
            id: 'test-liturgy', version: 1, name: 'Testliturgie', organizationId: 'ekiba', language: 'de', tags: [], nodes: [],
        };
        await expect(
            workspace.saveAgenda(testEvent, liturgy, {}),
        ).rejects.toThrow('Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt');
    });

    it('fails closed when saving an agenda with a template from another organization', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization('ekiba');

        const wrongLiturgy: LiturgyDefinition = {
            id: 'selk-test',
            version: 1,
            name: 'SELK Liturgie',
            organizationId: 'selk',
            language: 'de',
            tags: [],
            nodes: [],
        };

        await expect(
            workspace.saveAgenda(testEvent, wrongLiturgy, {}),
        ).rejects.toThrow('gehört nicht zum konfigurierten Kirchenkörper');
    });

    it('fails closed when attempting to import a hymnal without configured organization', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization(undefined);

        const hymnal = resourceRegistry.hymnals[0];
        await expect(
            workspace.importHymnal(hymnal),
        ).rejects.toThrow('Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt');
    });

    it('fails closed when importing a hymnal that does not belong to the configured organization', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization('ekiba');

        const foreignHymnal: HymnalDefinition = {
            id: 'foreign-hymnal',
            version: 1,
            name: 'Anderes Gesangbuch',
            shortName: 'AG',
            language: 'de',
            organizationIds: ['selk'],
            songs: [],
        };

        await expect(
            workspace.importHymnal(foreignHymnal),
        ).rejects.toThrow('gehört nicht zum konfigurierten Kirchenkörper');
    });

    it('scopes ELKG² hymnal when SELK organization is saved', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization('selk');

        expect(workspace.installationSettings.organizationId).toBe('selk');
        expect(workspace.selectedOrganization?.id).toBe('selk');
        expect(workspace.availableHymnals.map((h) => h.id)).toEqual(['elkg2']);
        expect(workspace.availableHymnals[0].songs.length).toBe(864);
        expect(workspace.availableLiturgies.map((liturgy) => liturgy.id)).toEqual(['selk-order-1', 'selk-order-1-communion', 'selk-order-2', 'selk-free-order']);
    });

    it('scopes Lutheran Service Book hymnal when LCMS organization is saved', async () => {
        const workspace = createWorkspace();
        await workspace.saveInstallationOrganization('lcms');

        expect(workspace.installationSettings.organizationId).toBe('lcms');
        expect(workspace.selectedOrganization?.id).toBe('lcms');
        expect(workspace.availableHymnals.map((h) => h.id)).toEqual(['lutheran-service-book']);
        expect(workspace.availableHymnals[0].songs.length).toBe(636);
        expect(workspace.availableLiturgies.map((liturgy) => liturgy.id)).toEqual([
            'lcms-divine-service-1', 'lcms-divine-service-2', 'lcms-divine-service-3',
            'lcms-divine-service-4', 'lcms-divine-service-5', 'lcms-free-order',
        ]);
    });
});
