export const workspaceQueryKeys = (baseUrl: string, userId?: number) => {
    const scope = ['workspace', baseUrl, userId ?? 'anonymous'] as const;
    return {
        settings: [...scope, 'installation-settings'] as const,
        events: (from: string, page: number) => [...scope, 'upcoming-events', from, page] as const,
        inspections: () => [...scope, 'event-inspection'] as const,
        inspection: (eventId: number) => [...scope, 'event-inspection', eventId] as const,
        songs: () => [...scope, 'songs'] as const,
        songSearch: (query: string, limit: number) => [...scope, 'songs', query, limit] as const,
        imports: () => [...scope, 'hymnal-import'] as const,
        import: (hymnalId: string) => [...scope, 'hymnal-import', hymnalId] as const,
    };
};
