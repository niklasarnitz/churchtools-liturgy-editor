import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsError, toChurchToolsError } from './errors';

export type CustomModule = {
    id: number;
    shorty: string;
    name: string;
    description?: string | null;
    inMenu?: boolean;
    sortKey: number;
};

export type CustomDataCategory = {
    id: number;
    customModuleId: number;
    shorty: string;
    name: string;
    description: string;
    data?: string;
};

export type CustomDataValue = {
    id: number;
    dataCategoryId: number;
    value: string;
};

export type JsonStateStore = {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
};

export class ChurchToolsCustomModuleStore implements JsonStateStore {
    private module?: CustomModule;
    private moduleLookup?: Promise<CustomModule>;
    private moduleEnsure?: Promise<CustomModule>;
    private readonly categories = new Map<string, CustomDataCategory>();
    private readonly categoryEnsures = new Map<string, Promise<CustomDataCategory>>();
    private readonly client: ChurchToolsRequestClient;
    private readonly extensionKey: string;
    private readonly extensionName: string;
    private readonly extensionDescription: string;

    constructor(
        client: ChurchToolsRequestClient,
        extensionKey: string,
        extensionName = 'Liturgy Editor',
        extensionDescription = 'Authoring layer for native ChurchTools church services.',
    ) {
        this.client = client;
        this.extensionKey = extensionKey;
        this.extensionName = extensionName;
        this.extensionDescription = extensionDescription;
    }

    async getModule(): Promise<CustomModule> {
        if (this.module) return this.module;
        if (!this.moduleLookup) {
            this.moduleLookup = this.client.get<CustomModule[]>('/custommodules').then((modules) => {
                const module = modules.find((candidate) => candidate.shorty === this.extensionKey);
                if (!module) {
                    throw new ChurchToolsError(`Custom module "${this.extensionKey}" wurde nicht gefunden.`, {
                        kind: 'not-found',
                        status: 404,
                    });
                }
                this.module = module;
                return module;
            }).finally(() => {
                this.moduleLookup = undefined;
            });
        }
        return this.moduleLookup;
    }

    async ensureModule(): Promise<CustomModule> {
        if (this.module) return this.module;
        if (!this.moduleEnsure) {
            this.moduleEnsure = this.getModule().catch(async (error) => {
                if (toChurchToolsError(error).kind !== 'not-found') throw error;
                this.module = await this.client.post<CustomModule>('/custommodules', {
                    shorty: this.extensionKey,
                    name: this.extensionName,
                    description: this.extensionDescription,
                    inMenu: true,
                    sortKey: 100,
                });
                return this.module;
            }).finally(() => {
                this.moduleEnsure = undefined;
            });
        }
        return this.moduleEnsure;
    }

    async listCategories(): Promise<CustomDataCategory[]> {
        const module = await this.ensureModule();
        return this.client.get<CustomDataCategory[]>(`/custommodules/${module.id}/customdatacategories`);
    }

    async getCategory(shorty: string): Promise<CustomDataCategory | undefined> {
        const cached = this.categories.get(shorty);
        if (cached) return cached;
        const category = (await this.listCategories()).find((candidate) => candidate.shorty === shorty);
        if (category) this.categories.set(shorty, category);
        return category;
    }

    async ensureCategory(shorty: string, name = shorty, description = `State for ${shorty}`): Promise<CustomDataCategory> {
        const existing = await this.getCategory(shorty);
        if (existing) return existing;
        const pending = this.categoryEnsures.get(shorty);
        if (pending) return pending;
        const operation = this.ensureModule().then(async (module) => {
            const category = await this.client.post<CustomDataCategory>(
                `/custommodules/${module.id}/customdatacategories`,
                {
                    customModuleId: module.id,
                    shorty,
                    name,
                    description,
                },
            );
            this.categories.set(shorty, category);
            return category;
        }).finally(() => {
            this.categoryEnsures.delete(shorty);
        });
        this.categoryEnsures.set(shorty, operation);
        return operation;
    }

    async listValues(categoryShorty: string): Promise<CustomDataValue[]> {
        const category = await this.ensureCategory(categoryShorty);
        const module = await this.ensureModule();
        return this.client.get<CustomDataValue[]>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
        );
    }

    async get<T>(key: string): Promise<T | undefined> {
        const values = await this.listValues(this.extensionKey);
        const value = values.find((candidate) => parseStoredRecord(candidate.value)?.key === key);
        if (!value) return undefined;
        return parseStoredValue<T>(value.value);
    }

    async set<T>(key: string, data: T): Promise<void> {
        const category = await this.ensureCategory(this.extensionKey, this.extensionName, this.extensionDescription);
        const module = await this.ensureModule();
        const values = await this.client.get<CustomDataValue[]>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
        );
        const encoded = JSON.stringify({ key, data });
        const existing = values.find((candidate) => {
            const parsed = parseStoredRecord(candidate.value);
            return parsed?.key === key;
        });
        if (existing) {
            await this.client.put<CustomDataValue>(
                `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues/${existing.id}`,
                { dataCategoryId: category.id, value: encoded },
            );
            return;
        }
        await this.client.post<CustomDataValue>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
            { dataCategoryId: category.id, value: encoded },
        );
    }

    async delete(key: string): Promise<void> {
        const category = await this.getCategory(this.extensionKey);
        if (!category) return;
        const module = await this.ensureModule();
        const values = await this.client.get<CustomDataValue[]>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
        );
        const existing = values.find((candidate) => parseStoredRecord(candidate.value)?.key === key);
        if (existing) {
            await this.client.deleteApi<void>(
                `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues/${existing.id}`,
            );
        }
    }
}

function parseStoredRecord(value: string): { key?: string; data?: unknown } | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null ? (parsed as { key?: string; data?: unknown }) : undefined;
    } catch {
        return undefined;
    }
}

function parseStoredValue<T>(value: string): T | undefined {
    return parseStoredRecord(value)?.data as T | undefined;
}
