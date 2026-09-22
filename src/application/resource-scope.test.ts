import { describe, expect, it } from 'vitest';

import { resourceRegistry } from '../data/registry';
import { scopeResourceRegistry } from './resource-scope';

describe('scopeResourceRegistry', () => {
    it('keeps only resources assigned to the selected organization', () => {
        const scoped = scopeResourceRegistry(resourceRegistry, 'ekiba');

        expect(scoped.organizations.map((organization) => organization.id)).toEqual(['ekiba']);
        expect(scoped.liturgies.map((liturgy) => liturgy.id)).toEqual(['baden-predigtgottesdienst-demo']);
        expect(scoped.hymnals.map((hymnal) => hymnal.id)).toEqual(['eg-baden', 'eg-baden-demo']);
        expect(scoped.lectionaries.map((lectionary) => lectionary.id)).toEqual(['demo-minimal']);
    });

    it('does not fall back when the installation has no organization selected', () => {
        expect(() => scopeResourceRegistry(resourceRegistry, undefined)).toThrow(
            'Cannot scope resources without an installation organizationId.',
        );
    });

    it('rejects an organization that is not installed', () => {
        expect(() => scopeResourceRegistry(resourceRegistry, 'not-installed')).toThrow(
            'Cannot scope resources: unknown organizationId "not-installed".',
        );
    });

    it('does not mutate the source registry', () => {
        const scoped = scopeResourceRegistry(resourceRegistry, 'selk');

        expect(scoped.organizations).not.toBe(resourceRegistry.organizations);
        expect(scoped.liturgies).not.toBe(resourceRegistry.liturgies);
        expect(resourceRegistry.organizations).toHaveLength(5);
        expect(resourceRegistry.liturgies).toHaveLength(2);
    });
});
