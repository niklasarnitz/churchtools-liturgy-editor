import { createApp } from 'vue';
import '@churchtools/styleguide/style';
import '@churchtools/styleguide-fonts';
import '@churchtools/fontawesome-pro/css/all.css';
import ctPlugin from '@churchtools/styleguide-plugin';
import './styles/tailwind.css';
import { churchtoolsClient } from '@churchtools/churchtools-client';
import App from './App.vue';
import { readRuntimeExtensionPoint } from './ui/context';

declare global {
    interface Window { settings?: { base_url?: string; extensionPoint?: string; extension_point?: string }; }
}

const baseUrl = window.settings?.base_url ?? import.meta.env.VITE_BASE_URL;
if (baseUrl) churchtoolsClient.setBaseUrl(baseUrl);

const username = import.meta.env.VITE_USERNAME;
const password = import.meta.env.VITE_PASSWORD;
if (import.meta.env.MODE === 'development' && username && password) {
    try { await churchtoolsClient.post('/login', { username, password }); } catch { /* Preview mode handles an unavailable API. */ }
}

export const KEY = import.meta.env.VITE_KEY || 'liturgy-editor';
const extensionPoint = readRuntimeExtensionPoint();
const emitNotification = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    window.dispatchEvent(new CustomEvent('churchtools:notification:show', { detail: { message, type, duration: 5000 } }));
};

createApp(App, { extensionPoint, baseUrl, emitNotification }).use(ctPlugin).mount('#app');
