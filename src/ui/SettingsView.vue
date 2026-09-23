<script setup lang="ts">
import { computed } from 'vue';
import { EmptyState, Icon } from './styleguide';
import HymnalCatalog from './HymnalCatalog.vue';
import SettingsOrganizationSelector from './SettingsOrganizationSelector.vue';
import SettingsDiagnostics from './SettingsDiagnostics.vue';
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
    connectionChecking?: boolean;
    availableLiturgiesCount?: number;
    availableLectionariesCount?: number;
    uninstallReport?: { removedCount: number; retainedCount: number };
    canManageSettings?: boolean;
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

        <div v-if="!props.canManageSettings" class="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700" role="status">
            Lesemodus: Du kannst die Extension-Konfiguration ansehen. Änderungen kann nur ein Konto mit ChurchTools-Berechtigung „churchservice / edit masterdata“ speichern.
        </div>

        <SettingsOrganizationSelector
            :selected-organization-id="props.selectedOrganizationId"
            :organizations="props.organizations"
            :busy="props.busy"
            :can-manage-settings="props.canManageSettings"
            @select-organization="emit('selectOrganization', $event)"
        />

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
                :can-manage="props.canManageSettings"
                @install="emit('install', $event)"
                @retry="emit('retry', $event)"
                @uninstall="emit('uninstall', $event)"
            />
        </div>

        <SettingsDiagnostics
            :selected-organization="selectedOrganization"
            :available-hymnals-count="props.availableHymnals.length"
            :available-liturgies-count="props.availableLiturgiesCount"
            :available-lectionaries-count="props.availableLectionariesCount"
            :is-online="props.isOnline"
            :api-configured="props.apiConfigured"
            :connection-checking="props.connectionChecking"
        />
    </section>
</template>
