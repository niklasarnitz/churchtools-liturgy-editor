import { ChurchToolsError, toChurchToolsError } from './errors';

export type RetryPolicy = {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: ChurchToolsError) => boolean;
    onRetry?: (error: ChurchToolsError, attempt: number, delayMs: number) => void | Promise<void>;
};

const defaultShouldRetry = (error: ChurchToolsError): boolean =>
    error.kind === 'network' || error.kind === 'rate-limited' || (error.status !== undefined && error.status >= 500);

export async function withRetry<T>(operation: () => Promise<T>, policy: RetryPolicy = {}): Promise<T> {
    const maxAttempts = Math.max(1, policy.maxAttempts ?? 3);
    const initialDelayMs = Math.max(0, policy.initialDelayMs ?? 250);
    const maxDelayMs = Math.max(initialDelayMs, policy.maxDelayMs ?? 4_000);
    const shouldRetry = policy.shouldRetry ?? defaultShouldRetry;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            const normalized = toChurchToolsError(error);
            if (attempt >= maxAttempts || !shouldRetry(normalized)) throw normalized;
            const delayMs = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
            await policy.onRetry?.(normalized, attempt, delayMs);
            if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw new ChurchToolsError('Retry operation ended unexpectedly.');
}

export async function mapWithConcurrency<T, R>(
    values: readonly T[],
    worker: (value: T, index: number) => Promise<R>,
    concurrency = 4,
): Promise<R[]> {
    const result = new Array<R>(values.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), values.length || 1);

    const run = async (): Promise<void> => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= values.length) return;
            result[index] = await worker(values[index], index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => run()));
    return result;
}
