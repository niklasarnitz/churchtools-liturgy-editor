import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./styleguide', async () => {
    const { h: render } = await import('vue');
    return {
        Button: (props: { label?: string }) => render('button', props.label),
        Icon: () => render('span'),
        Input: (props: { label?: string }) => render('label', props.label),
        SelectDropdown: (props: { label?: string }) => render('label', props.label),
    };
});
vi.mock('./SongPicker.vue', async () => {
    const { h: render } = await import('vue');
    return { default: () => render('div', 'Lied auswählen') };
});

import { badenDurmersheimLiturgy } from '../data/liturgies/baden-durmersheim';
import { organizationsById } from '../data/organizations';
import ServiceEditor from './ServiceEditor.vue';

describe('ServiceEditor block actions', () => {
    it('offers custom and template blocks alongside duplication controls', async () => {
        const app = createSSRApp({ render: () => h(ServiceEditor, {
            event: { id: 10, name: 'Sonntag', startDate: '2026-09-27T10:00:00Z' },
            currentUserId: undefined,
            organizationId: 'ekiba',
            liturgies: [badenDurmersheimLiturgy],
            organizations: [organizationsById.ekiba],
            songs: [],
            searchSongs: async () => [],
            createArrangement: async () => ({ id: 1 }),
            saveAgenda: async () => undefined,
            inspectAgenda: async () => undefined,
            suggestLiturgicalDay: async () => ({ source: 'none' as const, overrides: {} }),
            loadSavedBlocks: async () => [],
            saveSavedBlocks: async () => undefined,
        }) });
        const html = await renderToString(app);
        expect(html).toContain('Eigener Baustein');
        expect(html).toContain('Taufe');
        expect(html).toContain('Abendmahl');
        expect(html).toContain('duplizieren');
    });
});
