import { describe, expect, it } from 'vitest';

import { resourceRegistry } from './registry';
import { assertValidResourceRegistry, validateResourceRegistry } from '../domain/liturgies';
import { organizations } from './organizations';

describe('static resource registry', () => {
    it('keeps the supported organization IDs stable', () => {
        expect(organizations.map((organization) => organization.id)).toEqual([
            'ekiba',
            'elkb',
            'elk-wue',
            'selk',
            'lcms',
        ]);
    });

    it('contains valid versioned resources and cross references', () => {
        expect(() => assertValidResourceRegistry(resourceRegistry)).not.toThrow();
        expect(resourceRegistry.hymnals.every((hymnal) => hymnal.version > 0)).toBe(true);
        expect(resourceRegistry.liturgies.every((liturgy) => liturgy.version > 0)).toBe(true);
        expect(resourceRegistry.lectionaries.every((lectionary) => lectionary.version > 0)).toBe(true);
    });

    it('ships the real hymnal data and the Durmersheim liturgy without local lectionary fixtures', () => {
        expect(resourceRegistry.hymnals.map((hymnal) => hymnal.id)).toEqual([
            'eg-baden',
            'elkg2',
            'lutheran-service-book',
        ]);
        expect(resourceRegistry.liturgies.map((liturgy) => liturgy.id)).toEqual(['baden-durmersheim']);
        expect(resourceRegistry.lectionaries).toEqual([]);
    });

    it('reports duplicate stable hymn-song IDs', () => {
        const hymnal = resourceRegistry.hymnals.find((h) => h.id === 'eg-baden')!;
        const duplicateSong = hymnal.songs[0];
        const invalid = {
            ...resourceRegistry,
            hymnals: [
                ...resourceRegistry.hymnals,
                { ...hymnal, id: 'second-hymnal', songs: [duplicateSong] },
            ],
        };

        expect(validateResourceRegistry(invalid)).toContain(`duplicate hymnal song id "${duplicateSong.id}"`);
    });
});
