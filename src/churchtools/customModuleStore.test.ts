import { describe, expect, it } from 'vitest';

import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsCustomModuleStore } from './customModuleStore';

describe('ChurchToolsCustomModuleStore module lookup', () => {
    it('does not create a category when reading absent state', async () => {
        let posts = 0;
        const client = {
            get: (async (uri: string) => uri === '/custommodules'
                ? [{ id: 17, shorty: 'liturgy-editor' }]
                : []) as ChurchToolsRequestClient['get'],
            post: (async () => { posts += 1; return {}; }) as ChurchToolsRequestClient['post'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');
        await expect(store.get('missing')).resolves.toBeUndefined();
        expect(posts).toBe(0);
    });

    it('stores personal block shards in a user-specific permission category', async () => {
        const calls: string[] = [];
        const categories: Array<{ id: number; customModuleId: number; shorty: string; name: string; description: string }> = [];
        const client = {
            get: (async (uri: string) => {
                if (uri === '/custommodules') return [{ id: 17, shorty: 'liturgy-editor' }];
                if (uri.endsWith('/customdatacategories')) return categories;
                if (uri.endsWith('/customdatavalues')) return [];
                throw new Error(uri);
            }) as ChurchToolsRequestClient['get'],
            post: (async (uri: string, body: Record<string, unknown>) => {
                calls.push(uri);
                if (uri.endsWith('/customdatacategories')) {
                    const category = { id: 23, customModuleId: 17, shorty: String(body.shorty), name: String(body.name), description: String(body.description) };
                    categories.push(category);
                    return category;
                }
                return { id: 31, dataCategoryId: 23, value: body.value };
            }) as ChurchToolsRequestClient['post'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');
        await store.set('liturgy-editor:manifest:blocks:ekiba:7', { version: 2, inline: [] });
        expect(categories[0].shorty).toBe('liturgy-editor-user-7');
        expect(calls.some((uri) => uri.endsWith('/customdatacategories/23/customdatavalues'))).toBe(true);
    });

    it('migrates an old personal value out of the shared category on save', async () => {
        const key = 'liturgy-editor:manifest:blocks:ekiba:7';
        const categories = [{ id: 20, customModuleId: 17, shorty: 'liturgy-editor', name: 'Shared', description: '' }];
        const shared = [{ id: 30, dataCategoryId: 20, value: JSON.stringify({ key, data: { version: 1, inline: ['old'] } }) }];
        const deleted: string[] = [];
        const client = {
            get: (async (uri: string) => {
                if (uri === '/custommodules') return [{ id: 17, shorty: 'liturgy-editor' }];
                if (uri.endsWith('/customdatacategories')) return categories;
                if (uri.endsWith('/20/customdatavalues')) return [...shared];
                if (uri.endsWith('/21/customdatavalues')) return [];
                throw new Error(uri);
            }) as ChurchToolsRequestClient['get'],
            post: (async (uri: string, body: Record<string, unknown>) => {
                if (uri.endsWith('/customdatacategories')) {
                    const category = { id: 21, customModuleId: 17, shorty: String(body.shorty), name: 'Private', description: '' };
                    categories.push(category);
                    return category;
                }
                return { id: 31, dataCategoryId: 21, value: String(body.value) };
            }) as ChurchToolsRequestClient['post'],
            deleteApi: (async (uri: string) => {
                deleted.push(uri);
                shared.splice(0);
            }) as ChurchToolsRequestClient['deleteApi'],
        } as ChurchToolsRequestClient;
        const store = new ChurchToolsCustomModuleStore(client, 'liturgy-editor');
        await expect(store.get(key)).resolves.toEqual({ version: 1, inline: ['old'] });
        await store.set(key, { version: 2, inline: ['new'] });
        expect(deleted).toEqual(['/custommodules/17/customdatacategories/20/customdatavalues/30']);
        await expect(store.get(key)).resolves.toEqual({ version: 2, inline: ['new'] });
    });
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
