import type { NativeAgendaItemInput } from '../../churchtools/types';
import type { LiturgyNode } from '../../data/liturgies/types';
import type { LiturgicalDay } from '../../data/lectionaries/types';
import type { AgendaSlotValue } from '../agenda-generation/types';

export type ManagedEditorSnapshot = {
    nodes: LiturgyNode[];
    slots: Record<string, AgendaSlotValue | undefined>;
    series?: string;
    variantKey?: string;
    selectedDate?: string;
    liturgicalDay?: LiturgicalDay;
};

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
    /** Exact editor input used for this managed version, so reopening is lossless. */
    editorSnapshot?: ManagedEditorSnapshot;
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
