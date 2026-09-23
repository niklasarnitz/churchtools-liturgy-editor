import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@churchtools/styleguide-components/form/button/Button.vue', () => ({ default: (props: { label?: string }) => h('button', props.label) }));
vi.mock('@churchtools/styleguide-components/layout/card/Card.vue', () => ({ default: (_props: unknown, context: { slots: { full?: () => ReturnType<typeof h>[] } }) => h('div', null, context.slots.full?.()) }));
vi.mock('@churchtools/styleguide-components/basic/emptyState/EmptyState.vue', () => ({ default: (props: { title?: string }) => h('div', props.title) }));
vi.mock('@churchtools/styleguide-components/content/icon/Icon.vue', () => ({ default: () => h('span') }));
vi.mock('@churchtools/styleguide-components/infos/ProgressBar.vue', () => ({ default: () => h('div') }));

import type { HymnalDefinition } from '../data/hymnals/types';
import type { HymnalImportState } from '../domain/imports/types';
import HymnalCatalog from './HymnalCatalog.vue';

const hymnal: HymnalDefinition = {
    id: 'eg-baden',
    version: 1,
    name: 'Evangelisches Gesangbuch Baden',
    shortName: 'EG',
    organizationIds: ['ekiba'],
    language: 'de',
    songs: [{ id: 'eg-baden:1', number: '1', title: 'Macht hoch die Tür' }],
};

const interruptedImport: HymnalImportState = {
    operationId: 'eg-baden:1',
    hymnalId: 'eg-baden',
    hymnalVersion: 1,
    status: 'running',
    total: 1,
    completed: 0,
    failed: 0,
    mappings: {},
    failures: [],
    startedAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:00:01.000Z',
};

describe('HymnalCatalog interrupted imports', () => {
    it('does not claim an inactive persisted import is still running', async () => {
        const app = createSSRApp({
            render: () => h(HymnalCatalog, {
                hymnals: [hymnal],
                installed: () => interruptedImport,
                busy: false,
                canManage: true,
            }),
        });
        app.directive('rich-tooltip', {});

        const html = await renderToString(app);

        expect(html).toContain('Import unterbrochen');
        expect(html).toContain('Import fortsetzen');
        expect(html).not.toContain('Import läuft');
    });

    it('shows running only while this hymnal has an active install mutation', async () => {
        const app = createSSRApp({
            render: () => h(HymnalCatalog, {
                hymnals: [hymnal],
                installed: () => interruptedImport,
                busy: true,
                canManage: true,
                progress: {
                    operation: 'install',
                    hymnalId: hymnal.id,
                    completed: 0,
                    failed: 0,
                    total: 1,
                    percent: 0,
                    status: 'running',
                },
            }),
        });
        app.directive('rich-tooltip', {});

        const html = await renderToString(app);

        expect(html).toContain('Import läuft');
        expect(html).not.toContain('Import fortsetzen');
        expect(html).not.toContain('Import unterbrochen');
    });

    it('hides import actions in read-only mode', async () => {
        const app = createSSRApp({
            render: () => h(HymnalCatalog, {
                hymnals: [hymnal],
                installed: () => interruptedImport,
                busy: false,
                canManage: false,
            }),
        });
        app.directive('rich-tooltip', {});

        const html = await renderToString(app);

        expect(html).toContain('Import unterbrochen');
        expect(html).not.toContain('Import fortsetzen');
    });
});
