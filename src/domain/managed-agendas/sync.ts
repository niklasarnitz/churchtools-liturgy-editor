import { ChurchToolsError } from '../../churchtools/errors';
import type { ChurchToolsAgendasAdapter } from '../../churchtools/agendas';
import type { NativeAgendaItem, NativeAgendaItemInput } from '../../churchtools/types';
import { agendaFingerprint, reconcileManagedAgenda } from '../reconciliation/fingerprint';
import { planAgendaUpdate } from './plan';
import type { GeneratedAgendaItem, ManagedAgenda, ManagedNodeMapping } from './types';

export class ManagedAgendaConflictError extends ChurchToolsError {
    readonly reconciliation: ReturnType<typeof reconcileManagedAgenda>;

    constructor(reconciliation: ReturnType<typeof reconcileManagedAgenda>) {
        super('Der native ChurchTools-Ablauf wurde außerhalb des Liturgie-Editors verändert.', {
            kind: 'conflict',
            status: 409,
            details: reconciliation,
        });
        this.name = 'ManagedAgendaConflictError';
        this.reconciliation = reconciliation;
    }
}

export class ManagedAgendaSynchronizer {
    private readonly agendas: ChurchToolsAgendasAdapter;

    constructor(agendas: ChurchToolsAgendasAdapter) {
        this.agendas = agendas;
    }

    async apply(
        eventId: number,
        current: ManagedAgenda,
        generated: readonly GeneratedAgendaItem[],
        options: { force?: boolean; now?: () => string } = {},
    ): Promise<ManagedAgenda> {
        const existing = await this.agendas.get(eventId);
        const reconciliation = reconcileManagedAgenda(existing, current);
        if (reconciliation.status !== 'unchanged' && !options.force) {
            throw new ManagedAgendaConflictError(reconciliation);
        }
        if (!existing) throw new ChurchToolsError('Der verwaltete Ablauf existiert nicht mehr.', { kind: 'not-found', status: 404 });
        const plan = planAgendaUpdate(existing, current, generated);
        const createdIds = new Map<string, number>();
        for (const operation of plan.operations) {
            if (operation.kind === 'delete') {
                await this.agendas.deleteItem(eventId, operation.itemId);
            } else if (operation.kind === 'update') {
                await this.agendas.updateItem(eventId, operation.itemId, operation.item);
            } else if (operation.kind === 'create') {
                const previousNode = generated[generated.findIndex((item) => item.nodeId === operation.nodeId) - 1]?.nodeId;
                const previousId = previousNode
                    ? createdIds.get(previousNode) ?? current.nodeMappings[previousNode]?.agendaItemIds[0]
                    : undefined;
                const created = await this.agendas.createItem(eventId, operation.item, previousId ? { afterId: previousId } : {});
                createdIds.set(operation.nodeId, created.id);
            } else {
                const item = existing.items.find((entry) => entry.id === operation.itemId);
                if (item) await this.agendas.updateItem(eventId, operation.itemId, nativeItemInput(item), operation);
            }
        }
        const refreshed = await this.agendas.get(eventId);
        const nodeMappings: Record<string, ManagedNodeMapping> = {};
        for (const item of generated) {
            const oldId = current.nodeMappings[item.nodeId]?.agendaItemIds[0];
            const newId = createdIds.get(item.nodeId) ?? (oldId !== undefined && refreshed.items.some((entry) => entry.id === oldId) ? oldId : undefined);
            if (newId !== undefined) nodeMappings[item.nodeId] = { agendaItemIds: [newId] };
        }
        return {
            ...current,
            agendaId: refreshed.id,
            nodeMappings,
            lastAppliedFingerprint: agendaFingerprint(refreshed),
            updatedAt: (options.now ?? (() => new Date().toISOString()))(),
        };
    }
}

function nativeItemInput(item: NativeAgendaItem): NativeAgendaItemInput {
    if (item.type === 'header') return { type: 'header', title: item.title ?? null, duration: item.duration };
    const arrangementId = item.arrangementId ?? item.song?.arrangementId;
    if (item.type === 'song' && arrangementId !== undefined && arrangementId !== null) {
        return {
            type: 'song',
            title: item.title ?? null,
            duration: item.duration,
            note: item.note,
            arrangementId,
        };
    }
    return {
        type: 'text',
        title: item.title ?? null,
        duration: item.duration,
        note: item.note,
    };
}
