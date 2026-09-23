import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

export const createWorkspaceQueryClient = (): QueryClient => new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // The ChurchTools adapter already retries idempotent reads and
            // understands its normalized error contract.
            retry: false,
        },
        mutations: { retry: false },
    },
});

export const workspaceQueryClient = createWorkspaceQueryClient();

export { VueQueryPlugin };
