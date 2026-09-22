import { describe, expect, it } from 'vitest';

import { agendaFingerprint, reconcileManagedAgenda } from './fingerprint';

const managed = {
    eventId: 1,
    agendaId: 2,
    templateId: 'demo',
    templateVersion: 1,
    nodeMappings: { item: { agendaItemIds: [10] } },
    lastAppliedFingerprint: agendaFingerprint({
        id: 2,
        calendarId: 3,
        items: [{ id: 10, type: 'text', title: 'Text' }],
    }),
    updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('reconcileManagedAgenda', () => {
    it('accepts an unchanged native agenda', () => {
        const result = reconcileManagedAgenda(
            { id: 2, calendarId: 3, items: [{ id: 10, type: 'text', title: 'Text' }] },
            managed,
        );
        expect(result.status).toBe('unchanged');
        expect(result.reasons).toEqual([]);
    });

    it('reports externally added and missing items', () => {
        const result = reconcileManagedAgenda(
            {
                id: 2,
                calendarId: 3,
                items: [
                    { id: 12, type: 'text', title: 'External' },
                ],
            },
            managed,
        );
        expect(result.status).toBe('externally-changed');
        expect(result.reasons).toEqual(
            expect.arrayContaining([
                { kind: 'item-missing', itemId: 10, nodeId: 'item' },
                { kind: 'item-added', itemId: 12 },
            ]),
        );
    });
});
