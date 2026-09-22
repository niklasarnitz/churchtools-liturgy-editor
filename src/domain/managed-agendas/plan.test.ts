import { describe, expect, it } from 'vitest';

import { planAgendaUpdate } from './plan';
import type { ManagedAgenda } from './types';

const managed: ManagedAgenda = {
    eventId: 1,
    agendaId: 2,
    templateId: 'demo',
    templateVersion: 1,
    nodeMappings: {
        heading: { agendaItemIds: [10] },
        song: { agendaItemIds: [11] },
    },
    lastAppliedFingerprint: 'known',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('planAgendaUpdate', () => {
    it('produces deterministic updates and removes deleted optional nodes', () => {
        const plan = planAgendaUpdate(
            {
                id: 2,
                calendarId: 3,
                items: [
                    { id: 10, type: 'header', title: 'Heading' },
                    { id: 11, type: 'song', title: 'Old', arrangementId: 99 },
                ],
            },
            managed,
            [
                { nodeId: 'heading', item: { type: 'header', title: 'Heading' } },
                { nodeId: 'text', item: { type: 'text', title: 'Text' } },
            ],
        );

        expect(plan.operations).toEqual([
            { kind: 'delete', nodeId: 'song', itemId: 11 },
            { kind: 'update', nodeId: 'heading', itemId: 10, item: { type: 'header', title: 'Heading' } },
            { kind: 'create', nodeId: 'text', item: { type: 'text', title: 'Text' } },
        ]);
        expect(plan.desiredNodeOrder).toEqual(['heading', 'text']);
    });
});
