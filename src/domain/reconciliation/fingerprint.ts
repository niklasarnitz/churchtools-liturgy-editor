import type { NativeAgenda, NativeAgendaItem } from '../../churchtools/types';
import { stableJson } from '../imports/fingerprint';
import type { ManagedAgenda } from '../managed-agendas/types';

export const normalizeAgendaItem = (item: NativeAgendaItem): Record<string, unknown> => ({
    id: item.id,
    type: item.type,
    title: item.title ?? null,
    duration: item.duration ?? null,
    note: item.note ?? null,
    responsible:
        typeof item.responsible === 'string'
            ? item.responsible
            : item.responsible?.text ?? null,
    arrangementId: item.arrangementId ?? item.song?.arrangementId ?? null,
    songId: item.songId ?? item.song?.songId ?? null,
    isBeforeEvent: item.isBeforeEvent ?? false,
});

export const agendaFingerprint = (agenda: NativeAgenda): string =>
    stableJson({
        agendaId: agenda.id,
        calendarId: agenda.calendarId,
        eventStartPosition: agenda.eventStartPosition ?? null,
        isLocked: agenda.isLocked ?? false,
        series: agenda.series ?? null,
        items: agenda.items.map(normalizeAgendaItem),
    });

export type AgendaDriftReason =
    | { kind: 'item-missing'; itemId: number; nodeId?: string }
    | { kind: 'item-changed'; itemId: number; nodeId?: string }
    | { kind: 'item-added'; itemId: number }
    | { kind: 'agenda-changed' };

export type AgendaReconciliation = {
    status: 'unchanged' | 'externally-changed' | 'missing-agenda';
    currentFingerprint?: string;
    reasons: AgendaDriftReason[];
};

export const reconcileManagedAgenda = (
    agenda: NativeAgenda | undefined,
    managed: ManagedAgenda,
): AgendaReconciliation => {
    if (!agenda) return { status: 'missing-agenda', reasons: [] };
    const expectedIds = new Map<number, string>();
    for (const [nodeId, mapping] of Object.entries(managed.nodeMappings)) {
        for (const itemId of mapping.agendaItemIds) expectedIds.set(itemId, nodeId);
    }
    const currentById = new Map(agenda.items.map((item) => [item.id, item]));
    const acceptedExternalIds = new Set(managed.acceptedExternalItemIds ?? []);
    const reasons: AgendaDriftReason[] = [];
    for (const [itemId, nodeId] of expectedIds) {
        const item = currentById.get(itemId);
        if (!item) reasons.push({ kind: 'item-missing', itemId, nodeId });
    }
    for (const item of agenda.items) {
        const nodeId = expectedIds.get(item.id);
        if (!nodeId && !acceptedExternalIds.has(item.id)) reasons.push({ kind: 'item-added', itemId: item.id });
    }
    const currentFingerprint = agendaFingerprint(agenda);
    if (currentFingerprint !== managed.lastAppliedFingerprint) reasons.push({ kind: 'agenda-changed' });
    return {
        status: reasons.length > 0 ? 'externally-changed' : 'unchanged',
        currentFingerprint,
        reasons,
    };
};
