import { churchtoolsClient as defaultClient } from '@churchtools/churchtools-client';

import { toChurchToolsError } from './errors';
import { retryPolicyForRequest, type ChurchToolsRequestClient } from './request';

export type { ChurchToolsRequestClient } from './request';

/**
 * The sole low-level boundary to ChurchTools. Domain code receives a
 * `ChurchToolsRequestClient` in tests and never imports axios or the global
 * ChurchTools singleton directly.
 */
export class ChurchToolsClientAdapter implements ChurchToolsRequestClient {
    private readonly client: ChurchToolsRequestClient;
    private readonly minimumRequestIntervalMs: number;
    private scheduleTail: Promise<void> = Promise.resolve();
    private nextRequestAt = 0;

    constructor(
        client?: ChurchToolsRequestClient,
        options: { minimumRequestIntervalMs?: number } = {},
    ) {
        this.client = client ?? (defaultClient as unknown as ChurchToolsRequestClient);
        // ChurchTools defaults to 600 requests/minute. A 110 ms interval is
        // approximately 545/minute and leaves headroom without making large
        // hymnal imports unnecessarily slow.
        this.minimumRequestIntervalMs = Math.max(0, options.minimumRequestIntervalMs ?? 110);
    }

    setBaseUrl(baseUrl: string): void {
        this.client.setBaseUrl?.(baseUrl);
    }

    setLoadCSRFForAPI(): void {
        this.client.setLoadCSRFForAPI?.();
    }

    async get<T>(uri: string, params?: Record<string, unknown>): Promise<T> {
        return retryPolicyForRequest(
            () => this.schedule(() => this.request(() => this.client.get<T>(uri, params), `GET ${uri}`)),
            `GET ${uri}`,
        );
    }

    async post<T>(uri: string, data?: Record<string, unknown> | FormData): Promise<T> {
        return this.schedule(() => this.request(() => this.client.post<T>(uri, data), `POST ${uri}`));
    }

    async put<T>(uri: string, data?: Record<string, unknown>): Promise<T> {
        return this.schedule(() => this.request(() => this.client.put<T>(uri, data), `PUT ${uri}`));
    }

    async patch<T>(uri: string, data?: Record<string, unknown>): Promise<T> {
        const patch = this.client.patch;
        if (!patch) throw new Error('The configured ChurchTools client does not support PATCH.');
        return this.schedule(() => this.request(() => patch<T>(uri, data), `PATCH ${uri}`));
    }

    async deleteApi<T>(uri: string, data?: Record<string, unknown>): Promise<T> {
        return this.schedule(() => this.request(() => this.client.deleteApi<T>(uri, data), `DELETE ${uri}`));
    }

    async oldApi<T>(module: string, func: string, params?: Record<string, unknown>): Promise<T> {
        const oldApi = this.client.oldApi;
        if (!oldApi) throw new Error('The configured ChurchTools client does not support the legacy API.');
        return this.schedule(() => this.request(() => oldApi<T>(module, func, params), `LEGACY ${module}/${func}`));
    }

    private async schedule<T>(operation: () => Promise<T>): Promise<T> {
        const turn = this.scheduleTail.catch(() => undefined).then(async () => {
            const delayMs = Math.max(0, this.nextRequestAt - Date.now());
            if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
            this.nextRequestAt = Date.now() + this.minimumRequestIntervalMs;
        });
        this.scheduleTail = turn;
        await turn;
        return operation();
    }

    private async request<T>(operation: () => Promise<T>, label: string): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            throw toChurchToolsError(error, label);
        }
    }
}
