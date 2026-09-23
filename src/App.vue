<script setup lang="ts">
import { Button, Card, DialogSmall, EmptyState, Icon, LoadingMessage, ProgressBar, SelectDropdown } from './ui/styleguide';
import { computed, onMounted, reactive, ref } from 'vue';

import type { HymnalDefinition } from './data/hymnals';
import type { LiturgyDefinition } from './data/liturgies';
import { useWorkspace } from './ui/useWorkspace';
import { serviceStatusLabels, type AgendaDriftView, type WorkspaceEvent } from './ui/types';
import type { ExtensionPoint } from './ui/context';
import HymnalCatalog from './ui/HymnalCatalog.vue';
import LiturgyLibrary from './ui/LiturgyLibrary.vue';
import ServiceEditor from './ui/ServiceEditor.vue';
import SettingsView from './ui/SettingsView.vue';
import { formatScriptureReference } from './domain/lectionary';
import { resourceRegistry } from './data/registry';
import type { HymnalImportState } from './domain/imports';
import type { AgendaDriftReason } from './domain/reconciliation/fingerprint';
import { workspaceQueryClient } from './ui/query';

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
const uninstallReport = ref<{ removedCount: number; retainedCount: number }>();
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

const workspace = useWorkspace({ baseUrl: props.baseUrl, notify: addNotice, queryClient: workspaceQueryClient });

const sectionItems = computed(() => props.extensionPoint === 'admin'
    ? [
          { key: 'settings' as const, label: 'Einstellungen', icon: 'fas fa-sliders' },
          { key: 'hymnals' as const, label: 'Gesangbücher', icon: 'fas fa-book-open' },
      ]
    : [
          { key: 'services' as const, label: 'Gottesdienste', icon: 'fas fa-calendar-days' },
          { key: 'liturgies' as const, label: 'Liturgien', icon: 'fas fa-church' },
          { key: 'hymnals' as const, label: 'Gesangbücher', icon: 'fas fa-book-open' },
          { key: 'settings' as const, label: 'Einstellungen', icon: 'fas fa-sliders' },
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
    if (!liturgy && workspace.availableLiturgies.length === 0) {
        addNotice('Für diesen Kirchenkörper ist keine Liturgievorlage verfügbar.', 'warning');
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

const pendingUninstall = ref<{
    hymnal: HymnalDefinition;
    plan: {
        safeCount: number;
        conflictCount: number;
        candidates: Array<{ hymnalSongId: string; churchToolsSongId: number }>;
        conflicts: Array<{ hymnalSongId: string; churchToolsSongId?: number; reason: string; message: string }>;
    };
}>();
const uninstallExecuting = ref(false);

const uninstall = async (hymnal: HymnalDefinition) => {
    try {
        const plan = await workspace.previewUninstall(hymnal.id);
        pendingUninstall.value = { hymnal, plan };
    } catch {
        // The workspace exposes a translated error and notification.
    }
};

const executePendingUninstall = async () => {
    if (!pendingUninstall.value) return;
    const { hymnal } = pendingUninstall.value;
    uninstallExecuting.value = true;
    try {
        const result = await workspace.uninstallHymnal(hymnal.id);
        uninstallReport.value = {
            removedCount: result.state?.completed ?? 0,
            retainedCount: result.state?.failed ?? result.plan.conflictCount,
        };
        importStates[hymnal.id] = await workspace.loadImport(hymnal.id);
        pendingUninstall.value = undefined;
        if (uninstallReport.value.retainedCount) addNotice(`${uninstallReport.value.retainedCount} Songs wurden wegen Konflikten oder fehlgeschlagenen Löschungen nicht entfernt.`, 'warning');
    } catch {
        // The workspace exposes a translated error and notification.
    } finally {
        uninstallExecuting.value = false;
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
        <div class="flex min-h-[calc(100vh-73px)] flex-col lg:flex-row">
            <aside class="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white p-7 lg:flex" aria-label="Modulnavigation">
                <div class="mb-7"><span class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Gemeindeleben</span><h1 class="mt-2 text-2xl font-bold tracking-tight">Gottesdienst</h1><p class="mt-2 text-sm leading-6 text-slate-500">Liturgie vorbereiten und als nativen ChurchTools-Ablauf nutzen.</p></div>
                <nav class="flex flex-wrap gap-2 lg:flex-col">
                    <button v-for="item in sectionItems" :key="item.key" type="button" :class="['flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors', activeSection === item.key ? 'bg-accent-b-pale text-accent-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900']" @click="activeSection = item.key; selectedEvent = undefined"><Icon :icon="item.icon" size="S" /><span>{{ item.label }}</span></button>
                </nav>
                <div class="mt-auto hidden space-y-2 pt-8 text-xs text-slate-500 lg:block"><span class="flex items-center gap-2"><span class="size-2 rounded-full" :class="workspace.isOnline ? 'bg-emerald-500' : workspace.apiConfigured ? 'bg-red-500' : 'bg-amber-500'"></span>{{ workspace.isOnline ? 'Mit ChurchTools verbunden' : workspace.apiConfigured ? 'Verbindung fehlgeschlagen' : 'ChurchTools nicht konfiguriert' }}</span><span class="block">Liturgie-Editor v0.1</span></div>
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
                                Für diese ChurchTools-Installation wurde noch kein Kirchenkörper ausgewählt. Bitte wähle in den Einstellungen den zuständigen Kirchenkörper aus, um die zugehörigen Gesangbücher, Liturgien und Abläufe nutzen zu können.
                            </p>
                            <div class="mt-3">
                                <Button label="Kirchenkörper in den Einstellungen auswählen" icon="fas fa-sliders" size="S" @click="activeSection = 'settings'" />
                            </div>
                        </div>
                    </div>
                </div>

                <template v-if="selectedEvent && activeSection === 'services'">
                    <ServiceEditor ref="editorRef" :event="selectedEvent" :initial-liturgy-id="selectedLiturgy?.id" :organization-id="workspace.installationSettings.organizationId" :liturgies="workspace.availableLiturgies" :organizations="workspace.selectedOrganization ? [workspace.selectedOrganization] : []" :songs="workspace.songs" :search-songs="workspace.searchSongs" :save-agenda="workspace.saveAgenda" :inspect-agenda="workspace.inspectAgenda" :suggest-liturgical-day="workspace.suggestLiturgicalDay" @back="closeEditor" @saved="selectedEvent = undefined; addNotice('Gottesdienst gespeichert.', 'success')" @drift="openDrift" />
                </template>

                <template v-else>
                    <section v-if="activeSection === 'services'" class="space-y-6">
                        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Sonntage und Feiertage</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Anstehende Gottesdienste</h2><p class="mt-2 text-sm text-slate-500">Wähle einen Gottesdienst aus, um eine Liturgie vorzubereiten.</p></div><Button label="Aktualisieren" icon="fas fa-rotate-right" :outlined="true" :loading="workspace.eventStatus === 'loading'" @click="workspace.loadEvents()" /></div>
                        <div v-if="workspace.eventStatus === 'loading'"><LoadingMessage message="Gottesdienste werden geladen …" /></div>
                        <div v-else-if="workspace.events.length === 0"><EmptyState title="Keine kommenden Gottesdienste gefunden" icon="fas fa-calendar-days"><Button label="Gottesdienstliste aktualisieren" icon="fas fa-rotate-right" :outlined="true" @click="workspace.loadEvents()" /></EmptyState></div>
                        <div v-else class="grid gap-4">
                            <Card v-for="event in workspace.events" :key="event.id">
                                <template #full>
                                    <div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"><div class="flex shrink-0 flex-col border-b border-slate-200 pb-4 sm:w-24 sm:border-b-0 sm:border-r sm:pb-0"><strong class="text-lg font-bold">{{ formatDate(event.startDate).split(' ')[0] }}</strong><span class="text-sm text-slate-500">{{ formatDate(event.startDate).replace(`${formatDate(event.startDate).split(' ')[0]} `, '') }}</span></div>
                                    <div class="min-w-0 flex-1"><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">{{ event.calendar?.title ?? 'Gottesdienst' }}</div><h3 class="mt-1 text-lg font-semibold">{{ event.name }}</h3><p class="mt-1 text-sm text-slate-500">{{ new Date(event.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr · {{ event.isCanceled ? 'Abgesagt' : 'Geplant' }}</p></div>
                                    <div class="flex flex-col items-stretch gap-3 sm:items-end"><span class="flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><Icon v-if="event.status === 'loading'" icon="fas fa-spinner fa-spin" size="S" />{{ eventStatus(event) }}</span><Button :label="selectedEvent?.id === event.id ? 'Bearbeiten' : 'Liturgie erstellen'" icon="fas fa-arrow-right" size="S" @click="openService(event)" /></div></div>
                                </template>
                            </Card>
                            <nav class="flex items-center justify-center gap-3 pt-2" aria-label="Seitennavigation für Gottesdienste">
                                <Button label="Zurück" icon="fas fa-arrow-left" size="S" :outlined="true" :disabled="workspace.eventPage === 1 || workspace.eventStatus === 'loading'" @click="workspace.loadPreviousEvents" />
                                <span class="min-w-20 text-center text-sm font-medium text-slate-600">Seite {{ workspace.eventPage }}</span>
                                <Button label="Weiter" icon-after="fas fa-arrow-right" size="S" :outlined="true" :disabled="!workspace.eventHasNextPage || workspace.eventStatus === 'loading'" @click="workspace.loadNextEvents" />
                            </nav>
                        </div>
                    </section>

                    <section v-else-if="activeSection === 'liturgies'" class="space-y-6">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Deklarative Vorlagen</div>
                            <h2 class="mt-2 text-2xl font-bold tracking-tight">Liturgien</h2>
                            <p class="mt-2 text-sm text-slate-500">Wähle eine Vorlage nach Gottesdiensttyp und Tradition.</p>
                        </div>
                        <div v-if="!workspace.installationSettings.organizationId" class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                            <p>Kein Kirchenkörper festgelegt. Bitte wähle in den Einstellungen einen Kirchenkörper aus.</p>
                            <div class="mt-3">
                                <Button label="Kirchenkörper in den Einstellungen auswählen" icon="fas fa-sliders" size="S" @click="activeSection = 'settings'" />
                            </div>
                        </div>
                        <LiturgyLibrary v-else :liturgies="workspace.availableLiturgies" :organizations="workspace.selectedOrganization ? [workspace.selectedOrganization] : []" @use="useLiturgy" />
                    </section>

                    <section v-else-if="activeSection === 'hymnals'" class="space-y-6">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Native ChurchTools Songs</div>
                            <h2 class="mt-2 text-2xl font-bold tracking-tight">Gesangbücher</h2>
                            <p class="mt-2 text-sm text-slate-500">Installierte Lieder bleiben native ChurchTools-Songs und sind in allen normalen ChurchTools-Oberflächen verfügbar.</p>
                        </div>
                        <div v-if="uninstallReport" class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Icon icon="fas fa-shield-check" size="S" /> Deinstallation abgeschlossen: {{ uninstallReport.removedCount }} sicher entfernt<span v-if="uninstallReport.retainedCount">, {{ uninstallReport.retainedCount }} erhalten</span>.</div>
                        <div v-if="!workspace.installationSettings.organizationId" class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                            <p>Kein Kirchenkörper festgelegt. Bitte wähle in den Einstellungen einen Kirchenkörper aus, um die zugehörigen Gesangbücher zu laden.</p>
                            <div class="mt-3">
                                <Button label="Kirchenkörper in den Einstellungen auswählen" icon="fas fa-sliders" size="S" @click="activeSection = 'settings'" />
                            </div>
                        </div>
                        <HymnalCatalog v-else :hymnals="workspace.availableHymnals" :installed="findState" :progress="workspace.importProgress" :busy="workspace.operationBusy" @install="install" @retry="install" @uninstall="uninstall" />
                    </section>

                    <section v-else class="space-y-6">
                        <SettingsView
                            :selected-organization-id="workspace.installationSettings.organizationId"
                            :organizations="resourceRegistry.organizations"
                            :available-hymnals="workspace.availableHymnals"
                            :installed="findState"
                            :progress="workspace.importProgress"
                            :busy="workspace.operationBusy"
                            :is-online="workspace.isOnline"
                            :api-configured="workspace.apiConfigured"
                            :available-liturgies-count="workspace.availableLiturgies.length"
                            :available-lectionaries-count="workspace.availableLectionaries.length"
                            :uninstall-report="uninstallReport"
                            @select-organization="onOrganizationChange"
                            @install="install"
                            @retry="install"
                            @uninstall="uninstall"
                        />
                    </section>
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

        <DialogSmall
            v-if="pendingUninstall"
            title="Gesangbuch deinstallieren: Prüfergebnis"
            :button="false"
            :cancel-button="false"
            :backdrop-close="!uninstallExecuting"
            @close="pendingUninstall = undefined"
        >
            <div class="space-y-3 text-sm text-slate-600">
                <p>Prüfergebnis für das Gesangbuch <strong>{{ pendingUninstall.hymnal.name }}</strong>:</p>
                <div class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                    <div class="flex items-center gap-2 font-semibold text-emerald-800">
                        <Icon icon="fas fa-check" size="S" />
                        <span>{{ pendingUninstall.plan.safeCount }} Songs können sicher gelöscht werden.</span>
                    </div>
                    <div v-if="pendingUninstall.plan.conflictCount > 0" class="flex items-start gap-2 font-semibold text-amber-800">
                        <Icon icon="fas fa-triangle-exclamation" size="S" class="mt-0.5 shrink-0" />
                        <span>{{ pendingUninstall.plan.conflictCount }} Songs wurden verändert oder werden in bestehenden Abläufen verwendet und werden NICHT gelöscht.</span>
                    </div>
                    <div v-else class="text-slate-500">
                        Keine Konflikte gefunden. Alle Songs wurden unverändert belassen und werden nicht in Abläufen verwendet.
                    </div>
                </div>
                <p v-if="pendingUninstall.plan.safeCount > 0" class="text-xs text-slate-500">
                    Erst mit deiner ausdrücklichen Bestätigung werden die {{ pendingUninstall.plan.safeCount }} unbenutzten Songs aus ChurchTools entfernt.
                </p>
                <p v-else class="text-xs text-slate-500">
                    Es gibt keine sicher entfernbaren Songs. Die vorhandenen Songs bleiben erhalten.
                </p>
                <div v-if="uninstallExecuting && workspace.importProgress?.hymnalId === pendingUninstall.hymnal.id" class="rounded-lg border border-sky-200 bg-sky-50 p-3" aria-live="polite">
                    <div class="mb-2 flex justify-between gap-3 text-xs font-semibold text-sky-900">
                        <span>Songs werden gelöscht …</span>
                        <span v-if="workspace.importProgress.total > 0">
                            {{ workspace.importProgress.completed + workspace.importProgress.failed }} / {{ workspace.importProgress.total }} · {{ workspace.importProgress.percent }} %
                        </span>
                        <span v-else>Wird vorbereitet …</span>
                    </div>
                    <ProgressBar
                        v-if="workspace.importProgress.total > 0"
                        :planned="workspace.importProgress.total"
                        :used="workspace.importProgress.completed + workspace.importProgress.failed"
                    />
                    <div v-else class="h-2 overflow-hidden rounded-full bg-sky-100"><div class="h-full w-1/3 animate-pulse rounded-full bg-sky-500"></div></div>
                </div>
            </div>
            <template #footer-right>
                <Button label="Abbrechen" :outlined="true" :disabled="uninstallExecuting" @click="pendingUninstall = undefined" />
                <Button
                    v-if="pendingUninstall.plan.safeCount > 0"
                    label="Endgültig deinstallieren"
                    icon="fas fa-trash"
                    :loading="uninstallExecuting"
                    @click="executePendingUninstall"
                />
            </template>
        </DialogSmall>
    </div>
</template>
