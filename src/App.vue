<script setup lang="ts">
import { Button, Card, DialogSmall, EmptyState, Icon, LoadingMessage, SelectDropdown } from './ui/styleguide';
import { computed, onMounted, reactive, ref } from 'vue';

import type { HymnalDefinition } from './data/hymnals';
import type { LiturgyDefinition } from './data/liturgies';
import { useWorkspace } from './ui/useWorkspace';
import { serviceStatusLabels, type AgendaDriftView, type WorkspaceEvent } from './ui/types';
import type { ExtensionPoint } from './ui/context';
import HymnalCatalog from './ui/HymnalCatalog.vue';
import LiturgyLibrary from './ui/LiturgyLibrary.vue';
import ServiceEditor from './ui/ServiceEditor.vue';
import { formatScriptureReference } from './domain/lectionary';
import { resourceRegistry } from './data/registry';
import type { HymnalImportState } from './domain/imports';
import type { AgendaDriftReason } from './domain/reconciliation/fingerprint';

type Section = 'services' | 'liturgies' | 'hymnals' | 'settings';
type Notice = { id: number; message: string; type: 'info' | 'success' | 'warning' | 'error' };

const props = defineProps<{ extensionPoint: ExtensionPoint; baseUrl?: string; emitNotification?: (message: string, type: Notice['type']) => void }>();

const activeSection = ref<Section>(props.extensionPoint === 'admin' ? 'settings' : 'services');
const selectedEvent = ref<WorkspaceEvent>();
const selectedLiturgy = ref<LiturgyDefinition>();
const editorRef = ref<InstanceType<typeof ServiceEditor>>();
const drift = ref<AgendaDriftView>();
const notices = ref<Notice[]>([]);
const noticeSequence = ref(0);
const importStates = reactive<Record<string, HymnalImportState | undefined>>({});
const uninstallReport = ref<{ safeCount: number; conflictCount: number }>();
const driftDetailsVisible = ref(false);
const driftBusy = ref(false);

const addNotice = (message: string, type: Notice['type'] = 'info') => {
    const id = ++noticeSequence.value;
    notices.value.push({ id, message, type });
    props.emitNotification?.(message, type);
    window.setTimeout(() => {
        notices.value = notices.value.filter((notice) => notice.id !== id);
    }, 6500);
};

const workspace = useWorkspace({ baseUrl: props.baseUrl, notify: addNotice });

const sectionItems = computed(() => props.extensionPoint === 'admin'
    ? [
          { key: 'hymnals' as const, label: 'Gesangbücher', icon: 'fas fa-book-open' },
          { key: 'settings' as const, label: 'Einstellungen', icon: 'fas fa-sliders' },
      ]
    : [
          { key: 'services' as const, label: 'Gottesdienste', icon: 'fas fa-calendar-days' },
          { key: 'liturgies' as const, label: 'Liturgien', icon: 'fas fa-church' },
          { key: 'hymnals' as const, label: 'Gesangbücher', icon: 'fas fa-book-open' },
      ]);

const formatDate = (date: string) => new Date(date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const eventStatus = (event: WorkspaceEvent) => serviceStatusLabels[event.status];
const findState = (id: string) => importStates[id];

const organizationOptions = computed(() => [
    { id: '', name: '– Kein Kirchenkörper ausgewählt –' },
    ...resourceRegistry.organizations.map((org) => ({ id: org.id, name: org.name })),
]);

const onOrganizationChange = async (value: string | number) => {
    const orgId = String(value || '') || undefined;
    try {
        await workspace.saveInstallationOrganization(orgId);
        await Promise.all(workspace.availableHymnals.map(async (hymnal) => {
            importStates[hymnal.id] = await workspace.loadImport(hymnal.id);
        }));
    } catch {
        // error already notified by workspace
    }
};

const openService = (event: WorkspaceEvent, liturgy?: LiturgyDefinition) => {
    if (!workspace.installationSettings.organizationId) {
        addNotice('Bitte zuerst in den Extension-Einstellungen einen Kirchenkörper festlegen.', 'warning');
        return;
    }
    selectedEvent.value = event;
    selectedLiturgy.value = liturgy ?? selectedLiturgy.value;
    activeSection.value = 'services';
    drift.value = undefined;
    driftDetailsVisible.value = false;
};

const useLiturgy = (liturgy: LiturgyDefinition) => {
    if (!workspace.installationSettings.organizationId) {
        addNotice('Bitte zuerst in den Extension-Einstellungen einen Kirchenkörper festlegen.', 'warning');
        return;
    }
    selectedLiturgy.value = liturgy;
    if (!selectedEvent.value) {
        activeSection.value = 'services';
        addNotice('Wähle jetzt einen kommenden Gottesdienst aus.', 'info');
        return;
    }
    activeSection.value = 'services';
};

const load = async () => {
    await workspace.loadSettings();
    await workspace.loadEvents();
    await workspace.loadSongs();
    await Promise.all(workspace.availableHymnals.map(async (hymnal) => {
        importStates[hymnal.id] = await workspace.loadImport(hymnal.id);
    }));
};

const install = async (hymnal: HymnalDefinition) => {
    try {
        importStates[hymnal.id] = await workspace.importHymnal(hymnal);
    } catch {
        // The workspace exposes a translated error and notification.
    }
};

const uninstall = async (hymnal: HymnalDefinition) => {
    try {
        const plan = await workspace.uninstallHymnal(hymnal.id);
        uninstallReport.value = { safeCount: plan.safeCount, conflictCount: plan.conflictCount };
        importStates[hymnal.id] = await workspace.loadImport(hymnal.id);
        if (plan.conflictCount) addNotice(`${plan.conflictCount} Songs wurden wegen Konflikten nicht entfernt.`, 'warning');
    } catch {
        // The workspace exposes a translated error and notification.
    }
};

const closeEditor = () => {
    selectedEvent.value = undefined;
    selectedLiturgy.value = undefined;
    drift.value = undefined;
    driftDetailsVisible.value = false;
};

const openDrift = (value: AgendaDriftView) => {
    drift.value = value;
    driftDetailsVisible.value = false;
};

const reapplyDrift = async () => {
    driftBusy.value = true;
    try {
        await editorRef.value?.saveWithForce();
        drift.value = undefined;
        driftDetailsVisible.value = false;
    } catch {
        // ServiceEditor retains the translated save error and keeps the
        // dialog state available for another explicit decision.
    } finally {
        driftBusy.value = false;
    }
};

const keepDrift = async () => {
    if (!drift.value) return;
    driftBusy.value = true;
    try {
        await workspace.keepAgenda(drift.value.event.id);
        drift.value = undefined;
        driftDetailsVisible.value = false;
    } catch {
        // The workspace exposes the translated ChurchTools error.
    } finally {
        driftBusy.value = false;
    }
};

const driftReason = (reason: AgendaDriftReason): string => {
    if (reason.kind === 'item-added') return `Zusätzlicher Ablaufpunkt (ID ${reason.itemId})`;
    if (reason.kind === 'item-missing') return `Ablaufpunkt entfernt (ID ${reason.itemId})`;
    if (reason.kind === 'item-changed') return `Ablaufpunkt geändert (ID ${reason.itemId})`;
    return 'Ablaufdaten wurden außerhalb der Extension verändert';
};

// Never return the loading promise from the lifecycle hook. Host-session
// failures are rendered as state by the workspace and must not become Vue's
// unhandled mounted-hook rejection.
onMounted(() => { void load().catch(() => undefined); });
</script>

<template>
    <div class="min-h-screen bg-slate-50 text-slate-900">
        <header class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm lg:px-8">
            <div class="flex items-center gap-3"><span class="flex size-10 items-center justify-center rounded-xl bg-accent-b-bright text-xl text-white">✝</span><div><strong class="block text-sm font-semibold tracking-tight">Liturgie-Editor</strong><small class="block text-xs text-slate-500">ChurchTools Authoring Layer</small></div></div>
            <div class="flex items-center gap-2 text-sm font-medium text-slate-600"><span class="size-2 rounded-full bg-accent-b-bright"></span>{{ extensionPoint === 'admin' ? 'Administration' : 'Hauptmodul' }}</div>
        </header>
        <div class="mx-auto flex min-h-[calc(100vh-73px)] max-w-[1600px] flex-col lg:flex-row">
            <aside class="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white p-7 lg:flex" aria-label="Modulnavigation">
                <div class="mb-7"><span class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Gemeindeleben</span><h1 class="mt-2 text-2xl font-bold tracking-tight">Gottesdienst</h1><p class="mt-2 text-sm leading-6 text-slate-500">Liturgie vorbereiten und als nativen ChurchTools-Ablauf nutzen.</p></div>
                <nav class="flex flex-wrap gap-2 lg:flex-col">
                    <button v-for="item in sectionItems" :key="item.key" type="button" :class="['flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors', activeSection === item.key ? 'bg-accent-b-pale text-accent-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900']" @click="activeSection = item.key; selectedEvent = undefined"><Icon :icon="item.icon" size="S" /><span>{{ item.label }}</span></button>
                </nav>
                <div class="mt-auto hidden space-y-2 pt-8 text-xs text-slate-500 lg:block"><span class="flex items-center gap-2"><span class="size-2 rounded-full" :class="workspace.isOnline ? 'bg-emerald-500' : workspace.apiConfigured ? 'bg-red-500' : 'bg-amber-500'"></span>{{ workspace.isOnline ? 'Mit ChurchTools verbunden' : workspace.apiConfigured ? 'Verbindung fehlgeschlagen' : 'Vorschau ohne Verbindung' }}</span><span class="block">v0.1 · Ressourcen v1</span></div>
            </aside>

            <main class="min-w-0 flex-1 p-5 lg:p-9">
                <div class="mb-5 flex gap-2 overflow-x-auto lg:hidden"><button v-for="item in sectionItems" :key="item.key" type="button" :class="['whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium', activeSection === item.key ? 'bg-accent-b-bright text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200']" @click="activeSection = item.key; selectedEvent = undefined">{{ item.label }}</button></div>
                <div v-if="workspace.error" class="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="status"><Icon icon="fas fa-circle-exclamation" size="S" /><span class="min-w-0 flex-1">{{ workspace.error }}</span><Button label="Erneut versuchen" size="S" :outlined="true" @click="load" /></div>

                <div v-if="!workspace.installationSettings.organizationId && activeSection !== 'settings'" class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status">
                    <div class="flex items-start gap-3">
                        <Icon icon="fas fa-circle-exclamation" size="S" class="mt-0.5 text-amber-700" />
                        <div class="min-w-0 flex-1">
                            <strong class="block text-sm font-semibold">Kein Kirchenkörper festgelegt</strong>
                            <p class="mt-1 text-xs leading-5 text-amber-800">
                                Für diese ChurchTools-Installation wurde noch kein Kirchenkörper ausgewählt. Ein Administrator muss in den Extension-Einstellungen den zuständigen Kirchenkörper festlegen, bevor Liturgien, Gesangbücher und Abläufe genutzt werden können.
                            </p>
                        </div>
                    </div>
                </div>

                <template v-if="selectedEvent && activeSection === 'services'">
                    <ServiceEditor ref="editorRef" :event="selectedEvent" :initial-liturgy-id="selectedLiturgy?.id" :organization-id="workspace.installationSettings.organizationId" :liturgies="workspace.availableLiturgies" :organizations="workspace.selectedOrganization ? [workspace.selectedOrganization] : []" :songs="workspace.songs" :search-songs="workspace.searchSongs" :save-agenda="workspace.saveAgenda" :inspect-agenda="workspace.inspectAgenda" :suggest-liturgical-day="workspace.suggestLiturgicalDay" @back="closeEditor" @saved="selectedEvent = undefined; addNotice('Gottesdienst gespeichert.', 'success')" @drift="openDrift" />
                </template>

                <template v-else>
                    <section v-if="activeSection === 'services'" class="space-y-6">
                        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Sonntage und Feiertage</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Anstehende Gottesdienste</h2><p class="mt-2 text-sm text-slate-500">Wähle einen Gottesdienst aus, um eine Liturgie vorzubereiten.</p></div><Button label="Aktualisieren" icon="fas fa-rotate-right" :outlined="true" :loading="workspace.eventStatus === 'loading'" @click="workspace.loadEvents" /></div>
                        <div v-if="workspace.eventStatus === 'loading'"><LoadingMessage message="Gottesdienste werden geladen …" /></div>
                        <div v-else-if="workspace.events.length === 0"><EmptyState title="Keine kommenden Gottesdienste gefunden" icon="fas fa-calendar-days"><Button label="Gottesdienstliste aktualisieren" icon="fas fa-rotate-right" :outlined="true" @click="workspace.loadEvents" /></EmptyState></div>
                        <div v-else class="grid gap-4">
                            <Card v-for="event in workspace.events" :key="event.id" class="!p-0">
                                <div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"><div class="flex shrink-0 flex-col border-b border-slate-200 pb-4 sm:w-24 sm:border-b-0 sm:border-r sm:pb-0"><strong class="text-lg font-bold">{{ formatDate(event.startDate).split(' ')[0] }}</strong><span class="text-sm text-slate-500">{{ formatDate(event.startDate).replace(`${formatDate(event.startDate).split(' ')[0]} `, '') }}</span></div>
                                <div class="min-w-0 flex-1"><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">{{ event.calendar?.name ?? 'Gottesdienst' }}</div><h3 class="mt-1 text-lg font-semibold">{{ event.name }}</h3><p class="mt-1 text-sm text-slate-500">{{ new Date(event.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr · {{ event.isCanceled ? 'Abgesagt' : 'Geplant' }}</p></div>
                                <div class="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{{ eventStatus(event) }}</span><Button :label="selectedEvent?.id === event.id ? 'Bearbeiten' : 'Liturgie erstellen'" icon="fas fa-arrow-right" size="S" @click="openService(event)" /></div></div>
                            </Card>
                        </div>
                    </section>

                    <section v-else-if="activeSection === 'liturgies'" class="space-y-6"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Deklarative Vorlagen</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Liturgien</h2><p class="mt-2 text-sm text-slate-500">Wähle eine Vorlage nach Gottesdiensttyp und Tradition.</p></div><div v-if="!workspace.installationSettings.organizationId" class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">Kein Kirchenkörper festgelegt. Bitte wende dich an einen Administrator.</div><LiturgyLibrary v-else :liturgies="workspace.availableLiturgies" :organizations="workspace.selectedOrganization ? [workspace.selectedOrganization] : []" @use="useLiturgy" /></section>

                    <section v-else-if="activeSection === 'hymnals'" class="space-y-6"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Native ChurchTools Songs</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Gesangbücher</h2><p class="mt-2 text-sm text-slate-500">Installierte Lieder bleiben native ChurchTools-Songs und sind in allen normalen ChurchTools-Oberflächen verfügbar.</p></div><div v-if="uninstallReport" class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Icon icon="fas fa-shield-check" size="S" /> Deinstallation geprüft: {{ uninstallReport.safeCount }} sicher entfernt<span v-if="uninstallReport.conflictCount">, {{ uninstallReport.conflictCount }} Konflikte offengehalten</span>.</div><div v-if="!workspace.installationSettings.organizationId" class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">Kein Kirchenkörper festgelegt. Bitte wende dich an einen Administrator.</div><HymnalCatalog v-else :hymnals="workspace.availableHymnals" :installed="findState" :progress="workspace.importProgress" :busy="workspace.operationBusy" @install="install" @retry="install" @uninstall="uninstall" /></section>

                    <section v-else class="space-y-6"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Extension-Konfiguration</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Einstellungen</h2><p class="mt-2 text-sm text-slate-500">Ressourcen, Verbindung und technische Diagnose für Administratoren.</p></div><div class="grid gap-5 xl:grid-cols-2"><Card class="xl:col-span-2"><template #titleFull><div class="flex items-center justify-between"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Kirchenkörper / Organisation</div><h3 class="mt-1 text-lg font-semibold">Installationsweite Auswahl</h3></div><Icon icon="fas fa-church" size="L" /></div></template><div class="space-y-4"><p class="text-sm text-slate-600">Die Auswahl gilt für die gesamte ChurchTools-Installation. Hauptmodul, Liturgien, Gesangbücher und Lektionare zeigen automatisch nur passende Ressourcen.</p><div class="max-w-md"><SelectDropdown :model-value="workspace.installationSettings.organizationId ?? ''" label="Kirchenkörper" :options="organizationOptions" :emit-id="true" :clear="false" @update:model-value="onOrganizationChange" /></div><div v-if="workspace.selectedOrganization" class="text-xs text-slate-600">Aktuell aktiv: <strong class="text-slate-800">{{ workspace.selectedOrganization.name }}</strong> ({{ workspace.availableLiturgies.length }} Liturgievorlagen, {{ workspace.availableHymnals.length }} Gesangbücher verfügbar)</div><div v-else class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Es ist noch kein Kirchenkörper ausgewählt. Ohne Auswahl können Pfarrer und Anwender keine Liturgien oder Gesangbücher verwenden.</div></div></Card><Card><template #titleFull><div class="flex items-center justify-between"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Verbindung</div><h3 class="mt-1 text-lg font-semibold">ChurchTools</h3></div><Icon icon="fas fa-plug" size="L" /></div></template><div class="divide-y divide-slate-100"><div class="flex justify-between gap-4 py-3 text-sm"><span class="text-slate-500">Status</span><strong>{{ workspace.isOnline ? 'Verbunden' : workspace.apiConfigured ? 'Verbindung fehlgeschlagen' : 'Vorschau ohne Verbindung' }}</strong></div><div class="flex justify-between gap-4 py-3 text-sm"><span class="text-slate-500">Native APIs</span><span>Events · Songs · Agenda · Berechtigungen</span></div><div class="flex justify-between gap-4 py-3 text-sm"><span class="text-slate-500">Speicher</span><span>Custom Module State mit lokalem Fallback</span></div></div></Card><Card><template #titleFull><div class="flex items-center justify-between"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Ressourcen</div><h3 class="mt-1 text-lg font-semibold">Gefilterte Grundlagen</h3></div><Icon icon="fas fa-database" size="L" /></div></template><div class="divide-y divide-slate-100"><div class="flex justify-between py-3 text-sm"><span class="text-slate-500">Organisation</span><strong>{{ workspace.selectedOrganization?.name ?? 'Keine konfiguriert' }}</strong></div><div class="flex justify-between py-3 text-sm"><span class="text-slate-500">Liturgievorlagen</span><strong>{{ workspace.availableLiturgies.length }}</strong></div><div class="flex justify-between py-3 text-sm"><span class="text-slate-500">Gesangbücher</span><strong>{{ workspace.availableHymnals.length }}</strong></div><div class="flex justify-between py-3 text-sm"><span class="text-slate-500">Lektionare</span><strong>{{ workspace.availableLectionaries.length }}</strong></div></div></Card></div></section>
                </template>
            </main>
        </div>

        <div class="fixed right-4 top-20 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite"><div v-for="notice in notices" :key="notice.id" class="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg" :class="notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : notice.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'"><Icon :icon="notice.type === 'success' ? 'fas fa-check' : notice.type === 'error' ? 'fas fa-circle-exclamation' : 'fas fa-circle-info'" size="S" /><span class="min-w-0 flex-1">{{ notice.message }}</span><button class="text-lg leading-none opacity-70 hover:opacity-100" type="button" aria-label="Meldung schließen" @click="notices = notices.filter((item) => item.id !== notice.id)">×</button></div></div>

        <DialogSmall v-if="drift" title="Ablauf außerhalb der Extension geändert" :button="false" :cancel-button="false" :backdrop-close="!driftBusy" @close="drift = undefined; driftDetailsVisible = false">
            <p class="text-sm leading-6 text-slate-600">Der native ChurchTools-Ablauf wurde seit der letzten Anwendung verändert. Die Extension überschreibt diese Änderung nicht automatisch.</p>
            <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <strong>Was möchtest du tun?</strong>
                <p class="mt-1 text-xs leading-5 text-amber-800">Prüfe die Änderungen, behalte die aktuelle ChurchTools-Version oder wende die gewählte Liturgie bewusst erneut an.</p>
            </div>
            <div v-if="driftDetailsVisible" class="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <strong class="block text-sm text-slate-800">Erkannte Änderungen</strong>
                <ul class="list-disc space-y-1 pl-4"><li v-for="(reason, index) in (drift.reasons ?? [])" :key="index">{{ driftReason(reason) }}</li><li v-if="!drift.reasons?.length">Die Änderung konnte nicht weiter aufgeschlüsselt werden.</li></ul>
                <p class="mt-2 text-[11px] text-slate-500">Ablauf-ID: {{ drift.managed.agendaId }}</p>
            </div>
            <template #footer-right>
                <Button label="Änderungen ansehen" :outlined="true" :disabled="driftBusy" @click="driftDetailsVisible = !driftDetailsVisible" />
                <Button label="Ablauf beibehalten" :outlined="true" :disabled="driftBusy" @click="keepDrift" />
                <Button label="Liturgie neu anwenden" :loading="driftBusy" @click="reapplyDrift" />
            </template>
        </DialogSmall>
    </div>
</template>
