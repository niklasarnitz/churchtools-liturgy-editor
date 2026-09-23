import { QueryClient, type MutationKey, VueQueryPlugin } from '@tanstack/vue-query';

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

export async function executeMutation<TData, TVariables>(
    client: QueryClient,
    mutationKey: MutationKey,
    mutationFn: (variables: TVariables) => Promise<TData>,
    variables: TVariables,
): Promise<TData> {
    return client.getMutationCache()
        .build<TData, Error, TVariables, unknown>(client, { mutationKey, mutationFn })
        .execute(variables);
}

export { VueQueryPlugin };
