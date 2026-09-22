import type { NativeAgendaItemInput } from '../../churchtools/types';

export type ManagedNodeMapping = {
    agendaItemIds: number[];
};

export type ManagedAgenda = {
    eventId: number;
    agendaId: number;
    templateId: string;
    templateVersion: number;
    nodeMappings: Record<string, ManagedNodeMapping>;
    lastAppliedFingerprint: string;
    updatedAt: string;
    /** Native items explicitly accepted by the user through the keep decision. */
    acceptedExternalItemIds?: number[];
};

export type GeneratedAgendaItem = {
    nodeId: string;
    item: NativeAgendaItemInput;
};

export type AgendaUpdateOperation =
    | { kind: 'create'; nodeId: string; item: NativeAgendaItemInput; beforeId?: number; afterId?: number }
    | { kind: 'update'; nodeId: string; itemId: number; item: NativeAgendaItemInput }
    | { kind: 'delete'; nodeId: string; itemId: number }
    | { kind: 'reorder'; nodeId: string; itemId: number; beforeId?: number; afterId?: number };

export type AgendaUpdatePlan = {
    operations: AgendaUpdateOperation[];
    desiredNodeOrder: string[];
};
