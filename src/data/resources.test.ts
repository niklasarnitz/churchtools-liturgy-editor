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

    it('marks the bundled resources as demo fixtures until authoritative data is supplied', () => {
        expect(resourceRegistry.hymnals.every((hymnal) => hymnal.demo === true)).toBe(true);
        expect(resourceRegistry.liturgies.every((liturgy) => liturgy.tags.includes('demo'))).toBe(true);
        expect(resourceRegistry.lectionaries.every((lectionary) => lectionary.id.startsWith('demo-'))).toBe(true);
    });

    it('reports duplicate stable hymn-song IDs', () => {
        const duplicateSong = resourceRegistry.hymnals[0].songs[0];
        const invalid = {
            ...resourceRegistry,
            hymnals: [
                ...resourceRegistry.hymnals,
                { ...resourceRegistry.hymnals[0], id: 'second-demo', songs: [duplicateSong] },
            ],
        };

        expect(validateResourceRegistry(invalid)).toContain('duplicate hymnal song id "eg-baden-demo:001"');
    });
});
