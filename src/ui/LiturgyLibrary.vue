<script setup lang="ts">
import { Button, Card, EmptyState, Icon, Input, SelectDropdown } from './styleguide';
import { computed, ref } from 'vue';

import type { LiturgyDefinition } from '../data/liturgies';
import type { OrganizationDefinition } from '../data/organizations';

const props = defineProps<{ liturgies: LiturgyDefinition[]; organizations?: OrganizationDefinition[]; canUse?: boolean }>();
const emit = defineEmits<{ (event: 'use', liturgy: LiturgyDefinition): void }>();

const searchQuery = ref('');
const communion = ref<'all' | 'yes' | 'no'>('all');
const communionOptions = [
    { id: 'all', name: 'Alle' },
    { id: 'yes', name: 'Mit Abendmahl' },
    { id: 'no', name: 'Ohne Abendmahl' },
];

const tradition = ref('all');
const traditionOptions = computed(() => {
    const set = new Set<string>();
    props.liturgies.forEach((l) => { if (l.tradition) set.add(l.tradition); });
    return [
        { id: 'all', name: 'Alle Traditionen' },
        ...Array.from(set).map((t) => ({ id: t, name: t.charAt(0).toUpperCase() + t.slice(1) })),
    ];
});

const serviceType = ref('all');
const serviceTypeOptions = computed(() => {
    const set = new Set<string>();
    props.liturgies.forEach((l) => { if (l.serviceType) set.add(l.serviceType); });
    return [
        { id: 'all', name: 'Alle Gottesdiensttypen' },
        ...Array.from(set).map((s) => ({ id: s, name: s.charAt(0).toUpperCase() + s.slice(1) })),
    ];
});

const filtered = computed(() => props.liturgies.filter((liturgy) => {
    if (communion.value !== 'all') {
        const hasCommunion = liturgy.tags.includes('abendmahl') || liturgy.tags.includes('Holy Communion') || liturgy.nodes.some((n) => n.type === 'communionSection');
        if (hasCommunion !== (communion.value === 'yes')) return false;
    }
    if (tradition.value !== 'all' && liturgy.tradition !== tradition.value) {
        return false;
    }
    if (serviceType.value !== 'all' && liturgy.serviceType !== serviceType.value) {
        return false;
    }
    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase().trim();
        const matches = liturgy.name.toLowerCase().includes(q) || liturgy.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
    }
    return true;
}));
</script>

<template>
    <div class="grid gap-4">
        <div class="mb-1 flex flex-wrap items-end gap-3" aria-label="Liturgien filtern">
            <div class="min-w-60 flex-1">
                <Input v-model="searchQuery" label="Suche" placeholder="Liturgie oder Schlagwort suchen …" size="S" />
            </div>
            <SelectDropdown v-model="communion" class="min-w-40" label="Abendmahl" :options="communionOptions" :emit-id="true" :clear="false" size="S" />
            <SelectDropdown v-if="traditionOptions.length > 2" v-model="tradition" class="min-w-44" label="Tradition" :options="traditionOptions" :emit-id="true" :clear="false" size="S" />
            <SelectDropdown v-if="serviceTypeOptions.length > 2" v-model="serviceType" class="min-w-48" label="Gottesdiensttyp" :options="serviceTypeOptions" :emit-id="true" :clear="false" size="S" />
        </div>
        <div v-if="filtered.length === 0" class="grid min-h-[260px] place-items-center rounded-[10px] border border-slate-200 bg-white"><EmptyState :title="liturgies.length === 0 ? 'Keine Liturgievorlage verfügbar' : 'Keine Liturgie passt zu den Filtern'" icon="fas fa-church" /></div>
        <div v-for="liturgy in filtered" :key="liturgy.id">
            <Card>
                <template #titleFull>
                    <div class="flex items-start justify-between gap-5">
                        <div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-slate-500">{{ liturgy.organizationId }} · Version {{ liturgy.version }}</div><h2 class="my-1.5 mb-1 text-xl font-semibold tracking-[-.025em]">{{ liturgy.name }}</h2><p class="m-0 text-[13px] leading-6 text-slate-500">{{ liturgy.tags.join(' · ') }}</p></div>
                        <div class="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600"><Icon icon="fas fa-church" size="L" /></div>
                    </div>
                </template>
                <div class="mt-[18px] flex flex-wrap gap-4 text-xs text-slate-500">
                    <span v-if="liturgy.tradition" class="inline-flex items-center gap-1.5"><Icon icon="fas fa-landmark" size="S" /> {{ liturgy.tradition }}</span>
                    <span v-if="liturgy.serviceType" class="inline-flex items-center gap-1.5"><Icon icon="fas fa-cross" size="S" /> {{ liturgy.serviceType }}</span>
                    <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-language" size="S" /> {{ liturgy.language }}</span>
                    <span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-list" size="S" /> {{ liturgy.nodes.length }} Bausteine</span>
                    <span v-if="liturgy.lectionaryId" class="inline-flex items-center gap-1.5"><Icon icon="fas fa-calendar-days" size="S" /> {{ liturgy.lectionaryId }}</span>
                </div>
                <div v-if="props.canUse" class="mt-5 flex justify-end gap-2"><Button label="Für Gottesdienst verwenden" icon="fas fa-arrow-right" @click="emit('use', liturgy)" /></div>
            </Card>
        </div>
    </div>
</template>
