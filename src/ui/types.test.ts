import { describe, expect, it } from 'vitest';

import { serviceStatusLabels } from './types';

describe('serviceStatusLabels', () => {
    it('provides the user-facing label for every application service status', () => {
        expect(serviceStatusLabels).toEqual({
            loading: 'Ablauf wird geprüft …',
            'no-agenda': 'Noch kein Ablauf',
            managed: 'Vorhandener ChurchTools-Ablauf',
            complete: 'Vollständig',
            'externally-changed': 'Außerhalb der Extension verändert',
            unavailable: 'Nicht verfügbar',
        });
    });
});
