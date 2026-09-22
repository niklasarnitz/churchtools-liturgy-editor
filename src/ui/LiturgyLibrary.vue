<script setup lang="ts">
import { Button, Card, EmptyState, Icon, SelectDropdown } from './styleguide';
import { computed, ref } from 'vue';

import type { LiturgyDefinition } from '../data/liturgies';
import type { OrganizationDefinition } from '../data/organizations';

const props = defineProps<{ liturgies: LiturgyDefinition[]; organizations?: OrganizationDefinition[] }>();
const emit = defineEmits<{ (event: 'use', liturgy: LiturgyDefinition): void }>();
const communion = ref<'all' | 'yes' | 'no'>('all');
const communionOptions = [
    { id: 'all', name: 'Alle' },
    { id: 'yes', name: 'Mit Abendmahl' },
    { id: 'no', name: 'Ohne Abendmahl' },
];

const filtered = computed(() => props.liturgies.filter((liturgy) => {
    return communion.value === 'all' || liturgy.tags.includes('abendmahl') === (communion.value === 'yes');
}));
</script>

<template>
    <div class="grid gap-4">
        <div class="mb-1 flex flex-wrap gap-3" aria-label="Liturgien filtern">
            <SelectDropdown v-model="communion" class="min-w-48" label="Abendmahl" :options="communionOptions" :emit-id="true" :clear="false" size="S" />
        </div>
        <div v-if="filtered.length === 0" class="grid min-h-[260px] place-items-center rounded-[10px] border border-slate-200 bg-white"><EmptyState title="Keine Liturgie passt zu den Filtern" icon="fas fa-church" /></div>
        <div v-for="liturgy in filtered" :key="liturgy.id">
            <Card>
                <template #titleFull>
                    <div class="flex items-start justify-between gap-5">
                        <div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-slate-500">{{ liturgy.organizationId }} · Version {{ liturgy.version }}</div><h2 class="my-1.5 mb-1 text-xl font-semibold tracking-[-.025em]">{{ liturgy.name }}</h2><p class="m-0 text-[13px] leading-6 text-slate-500">{{ liturgy.tags.join(' · ') }}</p></div>
                        <div class="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600"><Icon icon="fas fa-church" size="L" /></div>
                    </div>
                </template>
                <div class="mt-[18px] flex flex-wrap gap-4 text-xs text-slate-500"><span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-language" size="S" /> {{ liturgy.language }}</span><span class="inline-flex items-center gap-1.5"><Icon icon="fas fa-list" size="S" /> {{ liturgy.nodes.length }} Bausteine</span><span v-if="liturgy.lectionaryId" class="inline-flex items-center gap-1.5"><Icon icon="fas fa-calendar-days" size="S" /> {{ liturgy.lectionaryId }}</span></div>
                <div class="mt-5 flex justify-end gap-2"><Button label="Für Gottesdienst verwenden" icon="fas fa-arrow-right" @click="emit('use', liturgy)" /></div>
            </Card>
        </div>
    </div>
</template>
