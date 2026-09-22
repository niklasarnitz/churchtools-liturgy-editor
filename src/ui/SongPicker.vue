<script setup lang="ts">
import { Button, Card, Icon, Input } from './styleguide';
import { computed, ref, watch } from 'vue';

import type { SongSlotValue } from '../domain/agenda-generation';
import type { WorkspaceSong } from './types';

const props = defineProps<{
    modelValue?: SongSlotValue;
    label: string;
    songs: WorkspaceSong[];
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    required?: boolean;
}>();

const emit = defineEmits<{ (event: 'update:modelValue', value: SongSlotValue | undefined): void }>();

const query = ref('');
const isOpen = ref(false);
const results = ref<WorkspaceSong[]>([]);
const isSearching = ref(false);

const selected = computed(() => {
    if (!props.modelValue) return undefined;
    return props.songs.find((song) => song.id === props.modelValue?.songId);
});

const displayValue = computed(() => {
    if (!selected.value) return 'Lied auswählen';
    return selected.value.number
        ? `${selected.value.category?.name ?? 'Lied'} ${selected.value.number} – ${selected.value.name}`
        : selected.value.name;
});

let debounceTimer: number | undefined;
watch(query, (value) => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(async () => {
        isSearching.value = true;
        try {
            results.value = await props.searchSongs(value);
        } finally {
            isSearching.value = false;
        }
    }, 120);
});

const open = async () => {
    isOpen.value = true;
    results.value = await props.searchSongs(query.value);
};

const choose = (song: WorkspaceSong) => {
    const arrangement = song.arrangements?.find((item) => item.isDefault) ?? song.arrangements?.[0];
    emit('update:modelValue', {
        kind: 'song',
        songId: song.id,
        arrangementId: arrangement?.id ?? null,
        title: song.name,
    });
    isOpen.value = false;
    query.value = '';
};

const clear = () => emit('update:modelValue', undefined);
</script>

<template>
    <div class="relative min-w-0">
        <label class="mb-1.5 block text-xs font-bold text-[#5e6974]" :for="`song-${label}`">{{ label }}<span v-if="required"> *</span></label>
        <button class="flex min-h-10 w-full items-center justify-between rounded-md border border-[#cfd6dc] bg-white px-[11px] py-2 text-left text-[#1f2933] focus:outline focus:outline-2 focus:outline-[#b6c5dc]" type="button" :aria-expanded="isOpen" @click="open">
            <span :class="!selected ? 'text-[#89939d] font-normal' : 'font-medium'">{{ displayValue }}</span>
            <Icon icon="fas fa-chevron-down" size="S" />
        </button>
        <div v-if="selected" class="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#66717d]">
            <span><strong>{{ selected.category?.name ?? 'ChurchTools' }}</strong><span v-if="selected.number"> (Nr. {{ selected.number }})</span> · {{ selected.name }}</span>
            <Button aria-label="Lied entfernen" :icon="'fas fa-xmark'" :text="true" :color="'basic'" size="S" @click="clear" />
        </div>
        <Card v-if="isOpen" class="absolute left-0 right-0 top-[calc(100%+8px)] z-[5] shadow-[0_14px_32px_rgba(25,37,48,.17)]" :data-cy="`song-picker-${label}`">
            <div class="flex items-center gap-1.5">
                <Input v-model="query" label="Song suchen" placeholder="z. B. EG 317 oder Lobe den Herren" :show-label="false" />
                <Button aria-label="Suche schließen" :icon="'fas fa-xmark'" :text="true" :color="'basic'" size="S" @click="isOpen = false" />
            </div>
            <div v-if="isSearching" class="px-1 pt-[18px] text-xs text-[#66717d]">Suche …</div>
            <div v-else-if="results.length === 0" class="px-1 pt-[18px] text-xs text-[#66717d]">Keine passenden Songs gefunden.</div>
            <div v-else class="mt-2.5 grid max-h-60 overflow-auto" role="listbox">
                <button v-for="song in results" :key="song.id" class="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-0 border-t border-[#edf0f2] bg-transparent px-[7px] py-[9px] text-left text-[#1f2933] hover:bg-[#f3f6f9]" type="button" role="option" @click="choose(song)">
                    <div class="flex items-center gap-1.5">
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-[#4b5d79]">{{ song.category?.name ?? 'Song' }}</span>
                        <span v-if="song.number" class="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">Nr. {{ song.number }}</span>
                    </div>
                    <div class="min-w-0">
                        <span class="block truncate text-xs font-medium">{{ song.name }}</span>
                        <span v-if="song.author" class="block truncate text-[11px] text-[#66717d]">{{ song.author }}</span>
                    </div>
                </button>
            </div>
        </Card>
    </div>
</template>
