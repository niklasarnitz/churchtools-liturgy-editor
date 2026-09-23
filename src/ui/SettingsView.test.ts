import { describe, expect, it } from 'vitest';
import { SUPPORTED_ORGANIZATIONS } from './supported-organizations';
import { resourceRegistry } from '../data/registry';
import { scopeResourceRegistry } from '../application/resource-scope';

describe('SettingsView configuration', () => {
    it('defines LCMS, Evangelische Kirche Baden, and SELK as supported church bodies', () => {
        const supportedIds = SUPPORTED_ORGANIZATIONS.map((org) => org.id);
        expect(supportedIds).toEqual(['lcms', 'ekiba', 'selk']);
    });

    it('each supported organization matches a valid organization in the resource registry', () => {
        for (const supported of SUPPORTED_ORGANIZATIONS) {
            const registryOrg = resourceRegistry.organizations.find((org) => org.id === supported.id);
            expect(registryOrg).toBeDefined();
            expect(supported.shortName.toLowerCase()).toBe(registryOrg!.shortName.toLowerCase());
        }
    });

    it('offers SELK a neutral order and LCMS the five LSB outlines', () => {
        const selk = resourceRegistry.organizations.find((org) => org.id === 'selk')!;
        const lcms = resourceRegistry.organizations.find((org) => org.id === 'lcms')!;
        expect(selk.liturgyIds).toEqual(['selk-order-1', 'selk-order-1-communion', 'selk-order-2', 'selk-free-order']);
        expect(lcms.liturgyIds).toEqual([
            'lcms-divine-service-1', 'lcms-divine-service-2', 'lcms-divine-service-3',
            'lcms-divine-service-4', 'lcms-divine-service-5', 'lcms-free-order',
        ]);
        expect(SUPPORTED_ORGANIZATIONS.find((org) => org.id === 'lcms')?.description).toContain('fünf Divine-Service-Settings');
    });

    it('each supported organization provides its associated hymnal with accurate song counts', () => {
        // LCMS -> Lutheran Service Book (LSB)
        const lcmsScope = scopeResourceRegistry(resourceRegistry, 'lcms');
        expect(lcmsScope.hymnals.map((h) => h.id)).toContain('lutheran-service-book');
        const lsb = lcmsScope.hymnals.find((h) => h.id === 'lutheran-service-book')!;
        expect(lsb.songs.length).toBe(636);
        const lcmsConfig = SUPPORTED_ORGANIZATIONS.find((o) => o.id === 'lcms')!;
        expect(lcmsConfig.songCount).toBe(lsb.songs.length);

        // Baden (ekiba) -> Evangelisches Gesangbuch Baden (EG Baden)
        const ekibaScope = scopeResourceRegistry(resourceRegistry, 'ekiba');
        expect(ekibaScope.hymnals.map((h) => h.id)).toContain('eg-baden');
        const egBaden = ekibaScope.hymnals.find((h) => h.id === 'eg-baden')!;
        expect(egBaden.songs.length).toBe(786);
        const ekibaConfig = SUPPORTED_ORGANIZATIONS.find((o) => o.id === 'ekiba')!;
        expect(ekibaConfig.songCount).toBe(egBaden.songs.length);

        // SELK -> Evangelisch-Lutherisches Kirchengesangbuch² (ELKG²)
        const selkScope = scopeResourceRegistry(resourceRegistry, 'selk');
        expect(selkScope.hymnals.map((h) => h.id)).toContain('elkg2');
        const elkg2 = selkScope.hymnals.find((h) => h.id === 'elkg2')!;
        expect(elkg2.songs.length).toBe(864);
        const selkConfig = SUPPORTED_ORGANIZATIONS.find((o) => o.id === 'selk')!;
        expect(selkConfig.songCount).toBe(elkg2.songs.length);
    });
});
