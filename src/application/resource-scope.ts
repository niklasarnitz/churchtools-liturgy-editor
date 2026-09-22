import type { ResourceRegistry } from '../data/registry';

/**
 * Return the resources available for the installation's selected
 * organization. The installation must choose an organization explicitly;
 * an incomplete or unknown selection is an application configuration error.
 */
export function scopeResourceRegistry(
    registry: ResourceRegistry,
    organizationId: string | undefined,
): ResourceRegistry {
    if (typeof organizationId !== 'string' || organizationId.length === 0) {
        throw new Error('Cannot scope resources without an installation organizationId.');
    }

    if (!registry.organizations.some((organization) => organization.id === organizationId)) {
        throw new Error(`Cannot scope resources: unknown organizationId "${organizationId}".`);
    }

    return {
        organizations: registry.organizations.filter((organization) => organization.id === organizationId),
        liturgies: registry.liturgies.filter((liturgy) => liturgy.organizationId === organizationId),
        hymnals: registry.hymnals.filter((hymnal) => hymnal.organizationIds.includes(organizationId)),
        lectionaries: registry.lectionaries.filter((lectionary) => lectionary.organizationIds.includes(organizationId)),
    };
}
