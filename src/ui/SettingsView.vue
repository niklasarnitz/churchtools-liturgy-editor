<script setup lang="ts">
import { computed } from 'vue';
import { Button, Card, EmptyState, Icon, SelectDropdown } from './styleguide';
import HymnalCatalog from './HymnalCatalog.vue';
import { SUPPORTED_ORGANIZATIONS } from './supported-organizations';
import type { HymnalDefinition } from '../data/hymnals';
import type { OrganizationDefinition } from '../data/organizations';
import type { HymnalImportState } from '../domain/imports';
import type { ImportProgressView } from './types';

const props = defineProps<{
    selectedOrganizationId?: string;
    organizations: OrganizationDefinition[];
    availableHymnals: HymnalDefinition[];
    installed: (hymnalId: string) => HymnalImportState | undefined;
    progress?: ImportProgressView;
    busy?: boolean;
    isOnline?: boolean;
    apiConfigured?: boolean;
    availableLiturgiesCount?: number;
    availableLectionariesCount?: number;
    uninstallReport?: { removedCount: number; retainedCount: number };
}>();

const emit = defineEmits<{
    (event: 'selectOrganization', organizationId: string): void;
    (event: 'install', hymnal: HymnalDefinition): void;
    (event: 'uninstall', hymnal: HymnalDefinition): void;
    (event: 'retry', hymnal: HymnalDefinition): void;
}>();

const selectedOrganization = computed(() =>
    props.organizations.find((org) => org.id === props.selectedOrganizationId),
);

const organizationDropdownOptions = computed(() => [
    { id: '', name: '– Kein Kirchenkörper ausgewählt –' },
    ...SUPPORTED_ORGANIZATIONS.map((org) => ({
        id: org.id,
        name: org.displayName,
    })),
]);

const onDropdownChange = (value: string | number) => {
    emit('selectOrganization', String(value || ''));
};

const chooseOrganization = (orgId: string) => {
    emit('selectOrganization', orgId);
};
</script>

<template>
    <section class="space-y-8" data-cy="settings-screen">
        <!-- Screen Header -->
        <div>
            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Extension-Konfiguration</div>
            <h2 class="mt-2 text-2xl font-bold tracking-tight">Einstellungen</h2>
            <p class="mt-2 text-sm text-slate-500">
                Wähle den Kirchenkörper deiner Gemeinde aus und installiere die zugehörigen Gesangbücher für ChurchTools.
            </p>
        </div>

        <!-- 1. Kirchenkörper Selection Section -->
        <Card class="!p-6">
            <template #titleFull>
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Schritt 1: Kirchenkörper</div>
                        <h3 class="mt-1 text-lg font-semibold">Kirchenkörper auswählen</h3>
                        <p class="mt-1 text-sm text-slate-500">
                            Die Auswahl bestimmt, welche Gesangbücher, Liturgievorlagen und Lektionare in ChurchTools bereitgestellt werden.
                        </p>
                    </div>
                    <div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon icon="fas fa-church" size="L" />
                    </div>
                </div>
            </template>

            <!-- Cards for currently available church bodies -->
            <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Verfügbare Kirchenkörper">
                <div
                    v-for="org in SUPPORTED_ORGANIZATIONS"
                    :key="org.id"
                    role="radio"
                    :aria-checked="props.selectedOrganizationId === org.id"
                    tabindex="0"
                    class="group relative flex flex-col justify-between rounded-xl border-2 p-5 text-left transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0f70b7]"
                    :class="[
                        props.selectedOrganizationId === org.id
                            ? 'border-[#0f70b7] bg-sky-50/60 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    ]"
                    @click="chooseOrganization(org.id)"
                    @keydown.space.prevent="chooseOrganization(org.id)"
                    @keydown.enter.prevent="chooseOrganization(org.id)"
                >
                    <div>
                        <!-- Header badge row -->
                        <div class="flex items-center justify-between gap-2">
                            <span class="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                                {{ org.shortName }}
                            </span>
                            <span
                                v-if="props.selectedOrganizationId === org.id"
                                class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                            >
                                <Icon icon="fas fa-check" size="S" /> Aktiv
                            </span>
                            <span v-else class="text-xs font-medium text-slate-400">
                                {{ org.language }}
                            </span>
                        </div>

                        <!-- Organization Title -->
                        <h4 class="mt-3 text-base font-semibold tracking-tight text-slate-900 group-hover:text-[#0f70b7]">
                            {{ org.subtitle }}
                        </h4>
                        <p class="mt-1 text-xs leading-relaxed text-slate-500">
                            {{ org.description }}
                        </p>
                    </div>

                    <!-- Hymnal tag and select button -->
                    <div class="mt-4 border-t border-slate-100 pt-3">
                        <div class="flex items-center gap-1.5 text-xs text-slate-600">
                            <Icon icon="fas fa-book-open" size="S" class="text-slate-400" />
                            <span class="font-medium truncate">{{ org.hymnalName }}</span>
                        </div>
                        <div class="mt-1 text-[11px] text-slate-400">
                            {{ org.songCount }} Lieder verfügbar
                        </div>

                        <div class="mt-3">
                            <Button
                                v-if="props.selectedOrganizationId === org.id"
                                label="Ausgewählt"
                                icon="fas fa-check"
                                size="S"
                                :disabled="props.busy"
                                class="w-full justify-center !bg-emerald-600 !border-emerald-600"
                            />
                            <Button
                                v-else
                                label="Diesen Kirchenkörper wählen"
                                size="S"
                                :outlined="true"
                                :disabled="props.busy"
                                class="w-full justify-center"
                                @click.stop="chooseOrganization(org.id)"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Dropdown alternative -->
            <div class="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div class="max-w-md flex-1">
                    <SelectDropdown
                        id="organization-quick-select"
                        :model-value="props.selectedOrganizationId ?? ''"
                        label="Kirchenkörper (Schnellauswahl / Zurücksetzen)"
                        :options="organizationDropdownOptions"
                        :emit-id="true"
                        :clear="false"
                        @update:model-value="onDropdownChange"
                    />
                </div>
                <div v-if="props.selectedOrganizationId" class="text-xs text-slate-500">
                    <Button
                        label="Auswahl aufheben"
                        size="S"
                        :outlined="true"
                        :disabled="props.busy"
                        @click="chooseOrganization('')"
                    />
                </div>
            </div>

            <!-- In-preparation note -->
            <p class="mt-3 text-xs text-slate-400">
                Hinweis: Weitere Kirchenkörper (wie z. B. ELKB, ELK-WUE) befinden sich derzeit in Vorbereitung.
            </p>
        </Card>

        <!-- 2. Hymnals Installation Section -->
        <div class="space-y-4">
            <div>
                <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Schritt 2: Gesangbücher</div>
                <h3 class="mt-1 text-xl font-bold tracking-tight">Dazugehörige Gesangbücher</h3>
                <p class="mt-1 text-sm text-slate-500">
                    <template v-if="selectedOrganization">
                        Verfügbare Gesangbücher für <strong class="text-slate-800">{{ selectedOrganization.name }}</strong>.
                        Installierte Lieder werden als native ChurchTools-Songs angelegt.
                    </template>
                    <template v-else>
                        Wähle zuerst einen Kirchenkörper aus, um die dazugehörigen Gesangbücher anzuzeigen und zu installieren.
                    </template>
                </p>
            </div>

            <!-- Safe Uninstall report banner -->
            <div
                v-if="uninstallReport"
                class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
                <Icon icon="fas fa-shield-check" size="S" />
                <span>
                    Deinstallation abgeschlossen: {{ uninstallReport.removedCount }} Songs sicher entfernt
                    <span v-if="uninstallReport.retainedCount">
                        ({{ uninstallReport.retainedCount }} Songs mit Anpassungen, Verwendungen oder fehlgeschlagenen Löschungen erhalten)
                    </span>.
                </span>
            </div>

            <!-- Empty state when no organization selected -->
            <div
                v-if="!props.selectedOrganizationId"
                class="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"
            >
                <EmptyState
                    title="Kein Kirchenkörper ausgewählt"
                    icon="fas fa-book-open"
                >
                    <p class="text-sm text-slate-500 max-w-md mx-auto">
                        Wähle oben deinen Kirchenkörper (LCMS, Evangelische Kirche Baden oder SELK) aus, um die zugehörigen Gesangbücher anzuzeigen und zu installieren.
                    </p>
                </EmptyState>
            </div>

            <!-- Hymnal Catalog list -->
            <HymnalCatalog
                v-else
                :hymnals="props.availableHymnals"
                :installed="props.installed"
                :progress="props.progress"
                :busy="props.busy"
                @install="emit('install', $event)"
                @retry="emit('retry', $event)"
                @uninstall="emit('uninstall', $event)"
            />
        </div>

        <!-- 3. System & Diagnostics Section -->
        <div class="grid gap-5 xl:grid-cols-2">
            <Card>
                <template #titleFull>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Verbindung</div>
                            <h3 class="mt-1 text-lg font-semibold">ChurchTools</h3>
                        </div>
                        <Icon icon="fas fa-plug" size="L" class="text-slate-500" />
                    </div>
                </template>
                <div class="divide-y divide-slate-100">
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Status</span>
                        <strong>{{ props.isOnline ? 'Verbunden' : props.apiConfigured ? 'Verbindung fehlgeschlagen' : 'Nicht konfiguriert' }}</strong>
                    </div>
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Native APIs</span>
                        <span>Events · Songs · Agenda · Berechtigungen</span>
                    </div>
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Speicher</span>
                        <span>ChurchTools Custom Module State</span>
                    </div>
                </div>
            </Card>

            <Card>
                <template #titleFull>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Ressourcen</div>
                            <h3 class="mt-1 text-lg font-semibold">Gefilterte Grundlagen</h3>
                        </div>
                        <Icon icon="fas fa-database" size="L" class="text-slate-500" />
                    </div>
                </template>
                <div class="divide-y divide-slate-100">
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Organisation</span>
                        <strong>{{ selectedOrganization?.name ?? 'Keine konfiguriert' }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Liturgievorlagen</span>
                        <strong>{{ props.availableLiturgiesCount ?? 0 }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Verfügbare Gesangbücher</span>
                        <strong>{{ props.availableHymnals.length }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Lektionare</span>
                        <strong>{{ props.availableLectionariesCount ?? 0 }}</strong>
                    </div>
                </div>
            </Card>
        </div>
    </section>
</template>
