<script setup lang="ts">
import { Button, Card, EmptyState, Icon, ProgressBar } from './styleguide';
import { computed } from 'vue';

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

const isUpdateAvailable = (hymnal: HymnalDefinition) => {
    const state = props.installed(hymnal.id);
    return state?.status === 'completed' && state.hymnalVersion < hymnal.version;
};

const isImportActive = (hymnal: HymnalDefinition) => {
    return props.busy
        && props.progress?.operation === 'install'
        && props.progress.hymnalId === hymnal.id;
};

const stateLabel = (hymnal: HymnalDefinition) => {
    if (isImportActive(hymnal)) return 'Import läuft';
    const state = props.installed(hymnal.id);
    if (!state) return 'Nicht installiert';
    if (state.status === 'completed') {
        if (state.hymnalVersion < hymnal.version) return `Update verfügbar (v${state.hymnalVersion} → v${hymnal.version})`;
        return 'Installiert';
    }
    if (state.status === 'partially-completed') return 'Teilweise installiert';
    if (state.status === 'failed') return 'Import fehlgeschlagen';
    return 'Import unterbrochen';
};

const countLabel = (hymnal: HymnalDefinition) => `${hymnal.songs.length} ${hymnal.songs.length === 1 ? 'Eintrag' : 'Einträge'}`;
const current = computed(() => props.progress);
const processed = computed(() => current.value ? current.value.completed + current.value.failed : 0);

const badgeClass = (hymnal: HymnalDefinition) => {
    if (isImportActive(hymnal)) return 'bg-sky-100 text-sky-800';
    const state = props.installed(hymnal.id);
    if (isUpdateAvailable(hymnal)) return 'bg-amber-100 text-amber-900';
    if (!state) return 'bg-slate-100 text-slate-600';
    if (state.status === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (state.status === 'partially-completed') return 'bg-amber-100 text-amber-900';
    if (state.status === 'failed') return 'bg-rose-100 text-rose-800';
    return 'bg-amber-100 text-amber-900';
};
</script>

<template>
    <div class="grid gap-4">
        <div v-if="hymnals.length === 0" class="grid min-h-[260px] place-items-center rounded-[10px] border border-slate-200 bg-white"><EmptyState title="Keine Gesangbücher verfügbar" icon="fas fa-book-open" /></div>
        <div v-for="hymnal in hymnals" :key="hymnal.id">
            <Card>
                <template #full>
                    <div class="p-6">
                        <div class="flex items-start justify-between gap-5">
                            <div>
                                <div class="text-[11px] font-bold uppercase tracking-[.055em] text-slate-500">{{ hymnal.shortName }} · Version {{ hymnal.version }}</div>
                                <h2 class="my-1.5 mb-1 text-xl font-semibold tracking-[-.025em]">{{ hymnal.name }}</h2>
                                <p class="m-0 text-[13px] leading-6 text-slate-500">{{ hymnal.description }}</p>
                            </div>
                            <div class="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600"><Icon icon="fas fa-book-open" size="L" /></div>
                        </div>
                        <div class="mt-[18px] flex flex-wrap gap-4 text-xs text-slate-500">
                            <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-list-ol" size="S" /> {{ countLabel(hymnal) }}</span>
                            <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-landmark" size="S" /> {{ hymnal.organizationIds.join(', ') }}</span>
                            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" :class="badgeClass(hymnal)">{{ stateLabel(hymnal) }}</span>
                        </div>
                        <div v-if="current?.hymnalId === hymnal.id" class="mt-5 border-t border-slate-200 pt-4" aria-live="polite">
                            <div class="mb-2 flex justify-between gap-3 text-xs font-bold text-slate-500">
                                <span>{{ current.operation === 'install' ? 'Installation' : 'Deinstallation' }}</span>
                                <span v-if="current.total > 0">{{ processed }} / {{ current.total }} · {{ current.percent }} %</span>
                                <span v-else>Wird vorbereitet …</span>
                            </div>
                            <ProgressBar v-if="current.total > 0" :planned="current.total" :used="processed" />
                            <div v-else class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full w-1/3 animate-pulse rounded-full bg-sky-500"></div></div>
                            <p v-if="current.failed && current.operation === 'install'" class="mt-2 text-xs text-red-700">{{ current.failed }} Einträge konnten nicht importiert werden.</p>
                            <p v-else-if="current.failed" class="mt-2 text-xs text-amber-700">{{ current.failed }} Einträge bleiben geschützt oder konnten nicht gelöscht werden.</p>
                        </div>
                        <div class="mt-5 flex justify-end gap-2">
                            <template v-if="!isImportActive(hymnal)">
                                <Button v-if="!props.installed(hymnal.id) || props.installed(hymnal.id)?.status === 'failed'" label="Installieren" icon="fas fa-download" :loading="busy" @click="emit('install', hymnal)" />
                                <Button v-else-if="props.installed(hymnal.id)?.status === 'pending' || props.installed(hymnal.id)?.status === 'running'" label="Import fortsetzen" icon="fas fa-rotate-right" :loading="busy" :outlined="true" @click="emit('retry', hymnal)" />
                                <Button v-else-if="props.installed(hymnal.id)?.status === 'partially-completed'" label="Fehlgeschlagene erneut versuchen" icon="fas fa-rotate-right" :loading="busy" :outlined="true" @click="emit('retry', hymnal)" />
                                <template v-else-if="props.installed(hymnal.id)?.status === 'completed'">
                                    <Button v-if="isUpdateAvailable(hymnal)" label="Aktualisieren" icon="fas fa-rotate" :loading="busy" @click="emit('install', hymnal)" />
                                    <Button label="Deinstallieren" icon="fas fa-trash" :outlined="true" :loading="busy" @click="emit('uninstall', hymnal)" />
                                </template>
                            </template>
                        </div>
                    </div>
                </template>
            </Card>
        </div>
    </div>
</template>
