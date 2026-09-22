import { withRetry, type RetryPolicy } from './retry';

export interface ChurchToolsRequestClient {
    get<T>(uri: string, params?: Record<string, unknown>): Promise<T>;
    post<T>(uri: string, data?: Record<string, unknown> | FormData): Promise<T>;
    put<T>(uri: string, data?: Record<string, unknown>): Promise<T>;
    patch?<T>(uri: string, data?: Record<string, unknown>): Promise<T>;
    deleteApi<T>(uri: string, data?: Record<string, unknown>): Promise<T>;
    oldApi?<T>(module: string, func: string, params?: Record<string, unknown>): Promise<T>;
    setBaseUrl?(baseUrl: string): void;
    setLoadCSRFForAPI?(): void;
}

export const retryPolicyForRequest = <T>(operation: () => Promise<T>, _label: string): Promise<T> =>
    withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 250,
        maxDelayMs: 4_000,
    } satisfies RetryPolicy);
