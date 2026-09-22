export type ExtensionPoint = 'main' | 'admin';

export type ExtensionContextInput = {
    search?: string;
    pathname?: string;
    host?: string;
    dataset?: Record<string, string | undefined>;
    settings?: Record<string, unknown>;
};

const asExtensionPoint = (value: unknown): ExtensionPoint | undefined => {
    if (value === 'main' || value === 'admin') return value;
    return undefined;
};

/**
 * ChurchTools embeds extension points in more than one host surface. The
 * contract currently does not provide a runtime context object, so this
 * resolver accepts explicit host data first and only then uses conservative
 * URL hints. Unknown contexts intentionally fall back to the main module.
 */
export const detectExtensionPoint = (input: ExtensionContextInput): ExtensionPoint => {
    const params = new URLSearchParams(input.search ?? '');
    const explicit = [
        input.dataset?.extensionPoint,
        input.dataset?.extensionpoint,
        input.settings?.extensionPoint,
        input.settings?.extension_point,
        params.get('extensionPoint'),
        params.get('extension_point'),
        params.get('point'),
        params.get('mode'),
    ]
        .map(asExtensionPoint)
        .find((value): value is ExtensionPoint => value !== undefined);
    if (explicit) return explicit;

    const path = `${input.pathname ?? ''} ${input.host ?? ''}`.toLowerCase();
    if (/(^|[/?_-])admin([/?_-]|$)/.test(path) || path.includes('extension-settings')) return 'admin';
    return 'main';
};

export const readRuntimeExtensionPoint = (): ExtensionPoint => {
    if (typeof window === 'undefined') return 'main';
    const root = document.documentElement.dataset;
    const settings = (window as Window & { settings?: Record<string, unknown> }).settings;
    return detectExtensionPoint({
        search: window.location.search,
        pathname: window.location.pathname,
        host: window.location.host,
        dataset: root,
        settings,
    });
};
