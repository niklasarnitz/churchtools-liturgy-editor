<script setup lang="ts">
import { Alert, Button, Card, EmptyState, Icon, ProgressBar } from './styleguide';
import { computed, ref } from 'vue';

import type { HymnalDefinition } from '../data/hymnals';
import type { HymnalImportState } from '../domain/imports';
import type { ImportProgressView } from './types';

const props = defineProps<{
    hymnals: HymnalDefinition[];
    installed: (hymnalId: string) => HymnalImportState | undefined;
    progress?: ImportProgressView;
    busy?: boolean;
}>();

const emit = defineEmits<{
    (event: 'install', hymnal: HymnalDefinition): void;
    (event: 'uninstall', hymnal: HymnalDefinition): void;
    (event: 'retry', hymnal: HymnalDefinition): void;
}>();

const confirmInstall = ref<HymnalDefinition>();
const confirmUpdate = ref<HymnalDefinition>();

const isUpdateAvailable = (hymnal: HymnalDefinition) => {
    const state = props.installed(hymnal.id);
    return state?.status === 'completed' && state.hymnalVersion < hymnal.version;
};

const stateLabel = (hymnal: HymnalDefinition) => {
    const state = props.installed(hymnal.id);
    if (!state) return 'Nicht installiert';
    if (state.status === 'completed') {
        if (state.hymnalVersion < hymnal.version) return `Update verfügbar (v${state.hymnalVersion} → v${hymnal.version})`;
        return 'Installiert';
    }
    if (state.status === 'partially-completed') return 'Teilweise installiert';
    if (state.status === 'failed') return 'Import fehlgeschlagen';
    return 'Import läuft';
};

const countLabel = (hymnal: HymnalDefinition) => `${hymnal.songs.length} ${hymnal.songs.length === 1 ? 'Eintrag' : 'Einträge'}`;
const current = computed(() => (props.progress && props.progress.total > 0 ? props.progress : undefined));

const badgeClass = (hymnal: HymnalDefinition) => {
    const state = props.installed(hymnal.id);
    if (isUpdateAvailable(hymnal)) return 'bg-amber-100 text-amber-900';
    if (!state) return 'bg-slate-100 text-slate-600';
    if (state.status === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (state.status === 'partially-completed') return 'bg-amber-100 text-amber-900';
    if (state.status === 'failed') return 'bg-rose-100 text-rose-800';
    return 'bg-sky-100 text-sky-800';
};
</script>

<template>
    <div class="grid gap-4">
        <div v-if="hymnals.length === 0" class="grid min-h-[260px] place-items-center rounded-[10px] border border-slate-200 bg-white"><EmptyState title="Keine Gesangbücher verfügbar" icon="fas fa-book-open" /></div>
        <div v-for="hymnal in hymnals" :key="hymnal.id">
            <Card>
                <template #titleFull>
                    <div class="flex items-start justify-between gap-5">
                        <div>
                            <div class="text-[11px] font-bold uppercase tracking-[.055em] text-slate-500">{{ hymnal.shortName }} · Version {{ hymnal.version }}</div>
                            <h2 class="my-1.5 mb-1 text-xl font-semibold tracking-[-.025em]">{{ hymnal.name }}</h2>
                            <p class="m-0 text-[13px] leading-6 text-slate-500">{{ hymnal.description }}</p>
                        </div>
                        <div class="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600"><Icon icon="fas fa-book-open" size="L" /></div>
                    </div>
                </template>
                <div class="mt-[18px] flex flex-wrap gap-4 text-xs text-slate-500">
                    <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-list-ol" size="S" /> {{ countLabel(hymnal) }}</span>
                    <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-landmark" size="S" /> {{ hymnal.organizationIds.join(', ') }}</span>
                    <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" :class="badgeClass(hymnal)">{{ stateLabel(hymnal) }}</span>
                </div>
                <div v-if="current && props.installed(hymnal.id)?.hymnalId === hymnal.id" class="mt-5 border-t border-slate-200 pt-4">
                    <div class="mb-2 flex justify-between text-xs font-bold text-slate-500"><span>{{ current.completed }} / {{ current.total }}</span><span>{{ current.percent }} %</span></div>
                    <ProgressBar :planned="current.total" :used="current.completed" />
                    <p v-if="current.failed" class="mt-2 text-red-700">{{ current.failed }} Einträge konnten nicht importiert werden.</p>
                </div>
                <div class="mt-5 flex justify-end gap-2">
                    <Button v-if="!props.installed(hymnal.id) || props.installed(hymnal.id)?.status === 'failed'" label="Installieren" icon="fas fa-download" :loading="busy" @click="confirmInstall = hymnal" />
                    <Button v-else-if="props.installed(hymnal.id)?.status === 'partially-completed'" label="Fehlgeschlagene erneut versuchen" icon="fas fa-rotate-right" :loading="busy" :outlined="true" @click="emit('retry', hymnal)" />
                    <template v-else-if="props.installed(hymnal.id)?.status === 'completed'">
                        <Button v-if="isUpdateAvailable(hymnal)" label="Aktualisieren" icon="fas fa-rotate" :loading="busy" @click="confirmUpdate = hymnal" />
                        <Button label="Deinstallieren" icon="fas fa-trash" :outlined="true" :loading="busy" @click="emit('uninstall', hymnal)" />
                    </template>
                </div>
            </Card>
        </div>
    </div>

    <Alert v-if="confirmInstall" title="Gesangbuch installieren" :description="`Das Gesangbuch „${confirmInstall.name}“ enthält ${confirmInstall.songs.length} Lieder. Diese werden als Songs in ChurchTools angelegt.`" button="Installieren" cancel-button="Abbrechen" @ok="emit('install', confirmInstall); confirmInstall = undefined" @cancel="confirmInstall = undefined" />
    <Alert v-if="confirmUpdate" title="Gesangbuch aktualisieren" :description="`Das Gesangbuch „${confirmUpdate.name}“ wird von Version ${props.installed(confirmUpdate.id)?.hymnalVersion} auf Version ${confirmUpdate.version} aktualisiert. Neue Lieder werden hinzugefügt und unveränderte Lieder aktualisiert.`" button="Aktualisieren" cancel-button="Abbrechen" @ok="emit('install', confirmUpdate); confirmUpdate = undefined" @cancel="confirmUpdate = undefined" />
</template>
