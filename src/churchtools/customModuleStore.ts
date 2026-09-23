import type {
    CustomModule,
    CustomModuleCreate,
    CustomModuleDataCategory,
    CustomModuleDataCategoryCreate,
    CustomModuleDataValue,
    CustomModuleDataValueCreate,
} from '@churchtools/api-types';
import type { ChurchToolsRequestClient } from './request';
import { ChurchToolsError, toChurchToolsError } from './errors';

export type { CustomModule } from '@churchtools/api-types';
export type CustomDataCategory = CustomModuleDataCategory;
export type CustomDataValue = CustomModuleDataValue;

type CustomModuleDataValueUpdate = Partial<CustomModuleDataValueCreate>;

export type JsonStateStore = {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
};

export class ChurchToolsCustomModuleStore implements JsonStateStore {
    private module?: CustomModule;
    private moduleLookup?: Promise<CustomModule>;
    private moduleEnsure?: Promise<CustomModule>;
    private readonly categories = new Map<string, CustomModuleDataCategory>();
    private readonly categoryEnsures = new Map<string, Promise<CustomModuleDataCategory>>();
    private readonly values = new Map<string, CustomModuleDataValue[]>();
    private readonly valueLoads = new Map<string, Promise<CustomModuleDataValue[]>>();
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
                const createData: CustomModuleCreate = {
                    shorty: this.extensionKey,
                    name: this.extensionName,
                    description: this.extensionDescription,
                    inMenu: true,
                    sortKey: 100,
                };
                this.module = await this.client.post<CustomModule>('/custommodules', createData);
                return this.module;
            }).finally(() => {
                this.moduleEnsure = undefined;
            });
        }
        return this.moduleEnsure;
    }

    async listCategories(): Promise<CustomModuleDataCategory[]> {
        const module = await this.ensureModule();
        return this.client.get<CustomModuleDataCategory[]>(`/custommodules/${module.id}/customdatacategories`);
    }

    async getCategory(shorty: string): Promise<CustomModuleDataCategory | undefined> {
        const cached = this.categories.get(shorty);
        if (cached) return cached;
        const category = (await this.listCategories()).find((candidate) => candidate.shorty === shorty);
        if (category) this.categories.set(shorty, category);
        return category;
    }

    async ensureCategory(shorty: string, name = shorty, description = `State for ${shorty}`): Promise<CustomModuleDataCategory> {
        const existing = await this.getCategory(shorty);
        if (existing) return existing;
        const pending = this.categoryEnsures.get(shorty);
        if (pending) return pending;
        const operation = this.ensureModule().then(async (module) => {
            const createData: CustomModuleDataCategoryCreate = {
                customModuleId: module.id,
                shorty,
                name,
                description,
            };
            const category = await this.client.post<CustomModuleDataCategory>(
                `/custommodules/${module.id}/customdatacategories`,
                createData,
            );
            this.categories.set(shorty, category);
            return category;
        }).finally(() => {
            this.categoryEnsures.delete(shorty);
        });
        this.categoryEnsures.set(shorty, operation);
        return operation;
    }

    async listValues(categoryShorty: string): Promise<CustomModuleDataValue[]> {
        const cached = this.values.get(categoryShorty);
        if (cached) return cached;
        const pending = this.valueLoads.get(categoryShorty);
        if (pending) return pending;
        const category = await this.ensureCategory(categoryShorty);
        const module = await this.ensureModule();
        const loadedWhileResolving = this.values.get(categoryShorty);
        if (loadedWhileResolving) return loadedWhileResolving;
        const startedWhileResolving = this.valueLoads.get(categoryShorty);
        if (startedWhileResolving) return startedWhileResolving;
        const operation = this.client.get<CustomModuleDataValue[]>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
        ).then((values) => {
            this.values.set(categoryShorty, values);
            return values;
        }).finally(() => {
            this.valueLoads.delete(categoryShorty);
        });
        this.valueLoads.set(categoryShorty, operation);
        return operation;
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
        const values = await this.listValues(this.extensionKey);
        const encoded = JSON.stringify({ key, data });
        const existing = values.find((candidate) => {
            const parsed = parseStoredRecord(candidate.value);
            return parsed?.key === key;
        });
        if (existing) {
            const updateData: CustomModuleDataValueUpdate = { dataCategoryId: category.id, value: encoded };
            const updated = await this.client.put<CustomModuleDataValue>(
                `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues/${existing.id}`,
                updateData,
            );
            values.splice(values.indexOf(existing), 1, updated);
            return;
        }
        const createData: CustomModuleDataValueCreate = { dataCategoryId: category.id, value: encoded };
        const created = await this.client.post<CustomModuleDataValue>(
            `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues`,
            createData,
        );
        values.push(created);
    }

    async delete(key: string): Promise<void> {
        const category = await this.getCategory(this.extensionKey);
        if (!category) return;
        const module = await this.ensureModule();
        const values = await this.listValues(this.extensionKey);
        const existing = values.find((candidate) => parseStoredRecord(candidate.value)?.key === key);
        if (existing) {
            await this.client.deleteApi<void>(
                `/custommodules/${module.id}/customdatacategories/${category.id}/customdatavalues/${existing.id}`,
            );
            values.splice(values.indexOf(existing), 1);
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
