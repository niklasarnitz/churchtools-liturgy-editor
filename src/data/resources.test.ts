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

    it('keeps fixtures marked as demos and the merged Baden index as source data', () => {
        expect(resourceRegistry.hymnals.find((hymnal) => hymnal.id === 'eg-baden')?.demo).not.toBe(true);
        expect(resourceRegistry.hymnals.find((hymnal) => hymnal.id === 'eg-baden-demo')?.demo).toBe(true);
        expect(resourceRegistry.liturgies.every((liturgy) => liturgy.tags.includes('demo'))).toBe(true);
        expect(resourceRegistry.lectionaries.every((lectionary) => lectionary.id.startsWith('demo-'))).toBe(true);
    });

    it('reports duplicate stable hymn-song IDs', () => {
        const demoHymnal = resourceRegistry.hymnals.find((hymnal) => hymnal.id === 'eg-baden-demo')!;
        const duplicateSong = demoHymnal.songs[0];
        const invalid = {
            ...resourceRegistry,
            hymnals: [
                ...resourceRegistry.hymnals,
                { ...demoHymnal, id: 'second-demo', songs: [duplicateSong] },
            ],
        };

        expect(validateResourceRegistry(invalid)).toContain('duplicate hymnal song id "eg-baden-demo:001"');
    });
});
