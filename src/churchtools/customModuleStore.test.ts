import { describe, expect, it } from 'vitest';

import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsCustomModuleStore } from './customModuleStore';

describe('ChurchToolsCustomModuleStore module lookup', () => {
    it('loads all modules and resolves a hyphenated extension key by shorty', async () => {
        const requested: string[] = [];
        const client = {
            get: (async (uri: string) => {
                requested.push(uri);
                return [{ id: 17, shorty: 'liturgy-editor', name: 'Liturgie-Editor', sortKey: 100 }];
            }) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');

        await expect(store.getModule()).resolves.toMatchObject({ id: 17, shorty: 'liturgy-editor' });
        expect(requested).toEqual(['/custommodules']);
    });

    it('deduplicates concurrent category creation', async () => {
        let categoryCreates = 0;
        const client = {
            get: (async (uri: string) => {
                if (uri === '/custommodules') return [{ id: 17, shorty: 'liturgy-editor', name: 'Liturgie-Editor', sortKey: 100 }];
                if (uri === '/custommodules/17/customdatacategories') return [];
                throw new Error(`Unexpected GET ${uri}`);
            }) as ChurchToolsRequestClient['get'],
            post: (async (uri: string) => {
                expect(uri).toBe('/custommodules/17/customdatacategories');
                categoryCreates += 1;
                return { id: 23, customModuleId: 17, shorty: 'liturgy-editor', name: 'Liturgy Editor', description: 'state' };
            }) as ChurchToolsRequestClient['post'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');

        const categories = await Promise.all([
            store.ensureCategory('liturgy-editor'),
            store.ensureCategory('liturgy-editor'),
            store.ensureCategory('liturgy-editor'),
        ]);

        expect(categories.map((category) => category.id)).toEqual([23, 23, 23]);
        expect(categoryCreates).toBe(1);
    });

    it('caches custom values so repeated state writes do not list the category again', async () => {
        let valueLists = 0;
        let writes = 0;
        const value = { id: 31, dataCategoryId: 23, value: JSON.stringify({ key: 'state', data: { count: 0 } }) };
        const client = {
            get: (async (uri: string) => {
                if (uri === '/custommodules') return [{ id: 17, shorty: 'liturgy-editor', name: 'Liturgie-Editor', sortKey: 100 }];
                if (uri === '/custommodules/17/customdatacategories') {
                    return [{ id: 23, customModuleId: 17, shorty: 'liturgy-editor', name: 'Liturgy Editor', description: 'state' }];
                }
                if (uri.endsWith('/customdatavalues')) {
                    valueLists += 1;
                    return [value];
                }
                throw new Error(`Unexpected GET ${uri}`);
            }) as ChurchToolsRequestClient['get'],
            put: (async (_uri: string, data: Record<string, unknown>) => {
                writes += 1;
                return { ...value, value: data.value };
            }) as ChurchToolsRequestClient['put'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');

        await store.set('state', { count: 1 });
        await store.set('state', { count: 2 });

        expect(valueLists).toBe(1);
        expect(writes).toBe(2);
        await expect(store.get('state')).resolves.toEqual({ count: 2 });
    });

    it('deduplicates the first concurrent custom-value load', async () => {
        let valueLists = 0;
        const client = {
            get: (async (uri: string) => {
                if (uri === '/custommodules') return [{ id: 17, shorty: 'liturgy-editor', name: 'Liturgie-Editor', sortKey: 100 }];
                if (uri === '/custommodules/17/customdatacategories') {
                    return [{ id: 23, customModuleId: 17, shorty: 'liturgy-editor', name: 'Liturgy Editor', description: 'state' }];
                }
                if (uri.endsWith('/customdatavalues')) {
                    valueLists += 1;
                    return [];
                }
                throw new Error(`Unexpected GET ${uri}`);
            }) as ChurchToolsRequestClient['get'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');

        await Promise.all([
            store.listValues('liturgy-editor'),
            store.listValues('liturgy-editor'),
            store.listValues('liturgy-editor'),
        ]);

        expect(valueLists).toBe(1);
    });
});
