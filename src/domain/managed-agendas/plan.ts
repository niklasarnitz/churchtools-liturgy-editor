import type { NativeAgenda } from '../../churchtools/types';
import type { AgendaUpdateOperation, AgendaUpdatePlan, GeneratedAgendaItem, ManagedAgenda } from './types';

export const planAgendaUpdate = (
    current: NativeAgenda,
    managed: ManagedAgenda,
    generated: readonly GeneratedAgendaItem[],
): AgendaUpdatePlan => {
    const operations: AgendaUpdateOperation[] = [];
    const currentIds = new Set(current.items.map((item) => item.id));
    const generatedNodeIds = new Set(generated.map((item) => item.nodeId));
    const mappingByNode = managed.nodeMappings;

    for (const [nodeId, mapping] of Object.entries(mappingByNode)) {
        if (!generatedNodeIds.has(nodeId)) {
            for (const itemId of mapping.agendaItemIds) {
                if (currentIds.has(itemId)) operations.push({ kind: 'delete', nodeId, itemId });
            }
        }
    }

    for (const generatedItem of generated) {
        const mappedId = mappingByNode[generatedItem.nodeId]?.agendaItemIds[0];
        if (mappedId !== undefined && currentIds.has(mappedId)) {
            operations.push({ kind: 'update', nodeId: generatedItem.nodeId, itemId: mappedId, item: generatedItem.item });
        } else {
            operations.push({ kind: 'create', nodeId: generatedItem.nodeId, item: generatedItem.item });
        }
        const oldIds = mappingByNode[generatedItem.nodeId]?.agendaItemIds.slice(1) ?? [];
        for (const oldId of oldIds) {
            if (currentIds.has(oldId)) operations.push({ kind: 'delete', nodeId: generatedItem.nodeId, itemId: oldId });
        }
    }

    const existingDesiredIds = generated
        .map((generatedItem) => mappingByNode[generatedItem.nodeId]?.agendaItemIds[0])
        .filter((itemId): itemId is number => itemId !== undefined && currentIds.has(itemId));
    for (let index = 1; index < existingDesiredIds.length; index += 1) {
        const itemId = existingDesiredIds[index];
        const previousId = existingDesiredIds[index - 1];
        if (current.items.findIndex((item) => item.id === itemId) < current.items.findIndex((item) => item.id === previousId)) {
            operations.push({
                kind: 'reorder',
                nodeId: generated[index].nodeId,
                itemId,
                afterId: previousId,
            });
        }
    }

    return { operations, desiredNodeOrder: generated.map((item) => item.nodeId) };
};
