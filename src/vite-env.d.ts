/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
    export default component;
}

declare module '@churchtools/styleguide/style' {
    const stylesheet: string;
    export default stylesheet;
}

declare module '@churchtools/styleguide-fonts';

declare module '@churchtools/styleguide-plugin' {
    import type { Plugin } from 'vue';
    const plugin: Plugin;
    export default plugin;
}

declare module '@churchtools/styleguide-components/*' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
    export default component;
}
