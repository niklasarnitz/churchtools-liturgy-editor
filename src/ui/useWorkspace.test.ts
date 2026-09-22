import { describe, expect, it } from 'vitest';
import { useWorkspace } from './useWorkspace';
import { resourceRegistry } from '../data/registry';
import type { WorkspaceEvent } from './types';
import type { LiturgyDefinition } from '../data/liturgies';
import type { HymnalDefinition } from '../data/hymnals';

const testEvent: WorkspaceEvent = {
    id: 10,
    name: 'Sonntagsgottesdienst',
    startDate: '2026-09-27T10:00:00Z',
    status: 'no-agenda',
};

describe('useWorkspace installation settings and resource scoping', () => {
    it('initializes with empty scoped resources when no organization is configured', async () => {
        const workspace = useWorkspace();
        await workspace.loadSettings();

        expect(workspace.installationSettings.version).toBe(1);
        expect(workspace.installationSettings.organizationId).toBeUndefined();
        expect(workspace.selectedOrganization).toBeUndefined();
        expect(workspace.availableLiturgies).toEqual([]);
        expect(workspace.availableHymnals).toEqual([]);
        expect(workspace.availableLectionaries).toEqual([]);
    });

    it('scopes liturgies, hymnals, and lectionaries when an organization is saved', async () => {
        const workspace = useWorkspace();
        await workspace.saveInstallationOrganization('ekiba');

        expect(workspace.installationSettings.organizationId).toBe('ekiba');
        expect(workspace.selectedOrganization?.id).toBe('ekiba');
        expect(workspace.selectedOrganization?.name).toBe('Evangelische Landeskirche in Baden');

        expect(workspace.availableLiturgies.length).toBeGreaterThan(0);
        expect(workspace.availableLiturgies.every((l) => l.organizationId === 'ekiba')).toBe(true);

        expect(workspace.availableHymnals.length).toBeGreaterThan(0);
        expect(workspace.availableHymnals.every((h) => h.organizationIds.includes('ekiba'))).toBe(true);

        expect(workspace.availableLectionaries.length).toBeGreaterThan(0);
        expect(workspace.availableLectionaries.every((lec) => lec.organizationIds.includes('ekiba'))).toBe(true);
    });

    it('fails closed when attempting to save an agenda without configured organization', async () => {
        const workspace = useWorkspace();
        await workspace.saveInstallationOrganization(undefined);

        const liturgy = resourceRegistry.liturgies[0];
        await expect(
            workspace.saveAgenda(testEvent, liturgy, {}),
        ).rejects.toThrow('Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt');
    });

    it('fails closed when saving an agenda with a template from another organization', async () => {
        const workspace = useWorkspace();
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
        const workspace = useWorkspace();
        await workspace.saveInstallationOrganization(undefined);

        const hymnal = resourceRegistry.hymnals[0];
        await expect(
            workspace.importHymnal(hymnal),
        ).rejects.toThrow('Für diese ChurchTools-Installation ist kein Kirchenkörper festgelegt');
    });

    it('fails closed when importing a hymnal that does not belong to the configured organization', async () => {
        const workspace = useWorkspace();
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
});
