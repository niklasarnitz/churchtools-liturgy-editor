import type { ResourceRegistry } from '../../data/registry';
import type { LiturgyNode } from '../../data/liturgies/types';

export class ResourceValidationError extends Error {
    public readonly errors: string[];

    constructor(errors: string[]) {
        super(`Static resource validation failed: ${errors.join('; ')}`);
        this.name = 'ResourceValidationError';
        this.errors = errors;
    }
}

const hasPositiveVersion = (version: unknown): version is number =>
    typeof version === 'number' && Number.isInteger(version) && version > 0;

const addNodeErrors = (nodes: LiturgyNode[], path: string, errors: string[], seen = new Set<string>()) => {
    for (const [index, node] of nodes.entries()) {
        const nodePath = `${path}.nodes[${index}]`;
        if (!node.id) errors.push(`${nodePath}.id is required`);
        if (seen.has(node.id)) errors.push(`${path} contains duplicate node id "${node.id}"`);
        seen.add(node.id);

        if (node.type === 'optionalSection' || node.type === 'communionSection' || node.type === 'serviceBlock') {
            addNodeErrors(node.nodes, `${nodePath}`, errors, seen);
        }
    }
};

const allNodes = (nodes: LiturgyNode[]): LiturgyNode[] => nodes.flatMap((node) =>
    node.type === 'optionalSection' || node.type === 'communionSection' || node.type === 'serviceBlock'
        ? [node, ...allNodes(node.nodes)] : [node]);

export const validateResourceRegistry = (registry: ResourceRegistry): string[] => {
    const errors: string[] = [];
    const organizationIds = new Set<string>();
    const hymnalIds = new Set<string>();
    const hymnalSongIds = new Set<string>();
    const liturgyIds = new Set<string>();
    const lectionaryIds = new Set<string>();

    for (const [index, organization] of registry.organizations.entries()) {
        const path = `organizations[${index}]`;
        if (!organization.id) errors.push(`${path}.id is required`);
        if (organizationIds.has(organization.id)) errors.push(`duplicate organization id "${organization.id}"`);
        organizationIds.add(organization.id);
        if (!organization.name) errors.push(`${path}.name is required`);
        if (!organization.shortName) errors.push(`${path}.shortName is required`);
        if (!organization.language) errors.push(`${path}.language is required`);
    }

    for (const [index, hymnal] of registry.hymnals.entries()) {
        const path = `hymnals[${index}]`;
        if (!hymnal.id) errors.push(`${path}.id is required`);
        if (hymnalIds.has(hymnal.id)) errors.push(`duplicate hymnal id "${hymnal.id}"`);
        hymnalIds.add(hymnal.id);
        if (!hasPositiveVersion(hymnal.version)) errors.push(`${path}.version must be a positive integer`);
        if (!hymnal.name) errors.push(`${path}.name is required`);
        if (!hymnal.shortName) errors.push(`${path}.shortName is required`);
        if (!hymnal.language) errors.push(`${path}.language is required`);
        for (const organizationId of hymnal.organizationIds) {
            if (!organizationIds.has(organizationId)) {
                errors.push(`${path} references unknown organization "${organizationId}"`);
            }
        }
        for (const [songIndex, song] of hymnal.songs.entries()) {
            const songPath = `${path}.songs[${songIndex}]`;
            if (!song.id) errors.push(`${songPath}.id is required`);
            if (hymnalSongIds.has(song.id)) errors.push(`duplicate hymnal song id "${song.id}"`);
            hymnalSongIds.add(song.id);
            if (!song.number) errors.push(`${songPath}.number is required`);
            if (!song.title) errors.push(`${songPath}.title is required`);
        }
    }

    for (const [index, lectionary] of registry.lectionaries.entries()) {
        const path = `lectionaries[${index}]`;
        if (!lectionary.id) errors.push(`${path}.id is required`);
        if (lectionaryIds.has(lectionary.id)) errors.push(`duplicate lectionary id "${lectionary.id}"`);
        lectionaryIds.add(lectionary.id);
        if (!hasPositiveVersion(lectionary.version)) errors.push(`${path}.version must be a positive integer`);
        if (!lectionary.name) errors.push(`${path}.name is required`);
        if (!lectionary.language) errors.push(`${path}.language is required`);
        for (const organizationId of lectionary.organizationIds) {
            if (!organizationIds.has(organizationId)) {
                errors.push(`${path} references unknown organization "${organizationId}"`);
            }
        }
        for (const [dayIndex, day] of lectionary.days.entries()) {
            if (!day.id) errors.push(`${path}.days[${dayIndex}].id is required`);
            if (!day.date || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
                errors.push(`${path}.days[${dayIndex}].date must be YYYY-MM-DD`);
            }
            if (!day.name) errors.push(`${path}.days[${dayIndex}].name is required`);
        }
    }

    for (const [index, liturgy] of registry.liturgies.entries()) {
        const path = `liturgies[${index}]`;
        if (!liturgy.id) errors.push(`${path}.id is required`);
        if (liturgyIds.has(liturgy.id)) errors.push(`duplicate liturgy id "${liturgy.id}"`);
        liturgyIds.add(liturgy.id);
        if (!hasPositiveVersion(liturgy.version)) errors.push(`${path}.version must be a positive integer`);
        if (!liturgy.organizationId) errors.push(`${path}.organizationId is required`);
        if (!organizationIds.has(liturgy.organizationId)) {
            errors.push(`${path} references unknown organization "${liturgy.organizationId}"`);
        }
        if (!liturgy.name) errors.push(`${path}.name is required`);
        if (!liturgy.language) errors.push(`${path}.language is required`);
        if (liturgy.lectionaryId && !lectionaryIds.has(liturgy.lectionaryId)) {
            errors.push(`${path} references unknown lectionary "${liturgy.lectionaryId}"`);
        }
        const seenNodeIds = new Set<string>();
        addNodeErrors(liturgy.nodes, path, errors, seenNodeIds);
        if (liturgy.blocks) addNodeErrors(liturgy.blocks, `${path}.blocks`, errors, seenNodeIds);
        const blockKeys = new Set<string>();
        for (const [blockIndex, block] of (liturgy.blocks ?? []).entries()) {
            if (!block.blockKey) errors.push(`${path}.blocks[${blockIndex}].blockKey is required`);
            if (blockKeys.has(block.blockKey)) errors.push(`${path} contains duplicate block key "${block.blockKey}"`);
            blockKeys.add(block.blockKey);
            if (block.suggestedAfter && !liturgy.nodes.some((node) => node.id === block.suggestedAfter)) {
                errors.push(`${path}.blocks[${blockIndex}] references unknown insertion point "${block.suggestedAfter}"`);
            }
        }
        for (const node of [...allNodes(liturgy.nodes), ...allNodes(liturgy.blocks ?? [])]) {
            if (node.showWhen && !blockKeys.has(node.showWhen.blockKey)) {
                errors.push(`${path} node "${node.id}" references unknown block "${node.showWhen.blockKey}"`);
            }
        }
    }

    for (const organization of registry.organizations) {
        for (const hymnalId of organization.hymnalIds) {
            if (!hymnalIds.has(hymnalId)) errors.push(`organization "${organization.id}" references unknown hymnal "${hymnalId}"`);
        }
        for (const liturgyId of organization.liturgyIds) {
            if (!liturgyIds.has(liturgyId)) errors.push(`organization "${organization.id}" references unknown liturgy "${liturgyId}"`);
        }
        for (const lectionaryId of organization.lectionaryIds) {
            if (!lectionaryIds.has(lectionaryId)) {
                errors.push(`organization "${organization.id}" references unknown lectionary "${lectionaryId}"`);
            }
        }
    }

    return errors;
};

export const assertValidResourceRegistry = (registry: ResourceRegistry): void => {
    const errors = validateResourceRegistry(registry);
    if (errors.length > 0) throw new ResourceValidationError(errors);
};
