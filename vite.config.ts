import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vitejs.dev/config/
export default ({ mode }) => {
    process.env = { ...loadEnv(mode, process.cwd()), ...process.env };
    return defineConfig({
        plugins: [vue(), tailwindcss()],
        resolve: {
            alias: {
                '@churchtools/fontawesome-pro': path.resolve(process.cwd(), '../../work/churchtools/node_modules/@churchtools/fontawesome-pro'),
                '@churchtools/styleguide-fonts': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/styleguide/src/css/fonts.css'),
                '@churchtools/styleguide-plugin': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/styleguide/src/ctPlugin.ts'),
                '@churchtools/design-system/style': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/design-system/dist/design-system.css'),
                '@churchtools/styleguide-components': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/styleguide/src/components'),
                '@churchtools/markdown/core': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/markdown/src/core.ts'),
                '@churchtools/markdown/renderer': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/markdown/src/renderer.ts'),
                '@churchtools/markdown/editor': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/markdown/src/editor.ts'),
                '@churchtools/utils': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/utils/src/lib.ts'),
                '@churchtools/api-types': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/api-types/index.ts'),
                '@churchtools/colors': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/colors/src/lib.ts'),
                '@churchtools/vue-query': path.resolve(process.cwd(), '../../work/churchtools/frontend-packages/vue-query/src/lib.ts'),
            },
        },
        server: {
            fs: {
                allow: [searchForWorkspaceRoot(process.cwd()), path.resolve(process.cwd(), '../../work/churchtools')],
            },
        },
        base: `/ccm/${process.env.VITE_KEY}/`,
    });
};
