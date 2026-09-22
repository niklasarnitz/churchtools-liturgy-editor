import { describe, expect, it } from 'vitest';

import { toChurchToolsError } from './errors';

describe('toChurchToolsError', () => {
    it('classifies a direct ChurchTools error.notfound key without an HTTP status', () => {
        const error = toChurchToolsError({
            message: 'Agenda for event [3002] not found.',
            translatedMessage: 'Objekt wurde nicht gefunden.',
            messageKey: 'error.notfound',
            args: { eventId: 3002 },
            errors: [],
        });

        expect(error.kind).toBe('not-found');
        expect(error.message).toBe('Objekt wurde nicht gefunden.');
    });

    it('classifies response.data error.notfound without treating other keys as 404', () => {
        expect(
            toChurchToolsError({
                response: {
                    data: { messageKey: 'error.notfound', message: 'Agenda not found' },
                },
            }).kind,
        ).toBe('not-found');
        expect(
            toChurchToolsError({
                response: {
                    data: { messageKey: 'error.validation', message: 'Invalid agenda' },
                },
            }).kind,
        ).toBe('network');
    });
});
