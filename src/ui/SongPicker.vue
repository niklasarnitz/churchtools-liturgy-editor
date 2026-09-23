<script setup lang="ts">
import { Button, Card, Icon, Input, Textarea } from './styleguide';
import { computed, ref, useId, watch } from 'vue';

import type { SongSlotValue } from '../domain/agenda-generation';
import type { WorkspaceArrangement, WorkspaceSong } from './types';

const props = defineProps<{
    modelValue?: SongSlotValue;
    label: string;
    songs: WorkspaceSong[];
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    createArrangement: (songId: number, input: { name: string; description?: string }) => Promise<WorkspaceArrangement>;
    canCreateArrangements?: boolean;
    required?: boolean;
}>();
const pickerId = useId();

const emit = defineEmits<{ (event: 'update:modelValue', value: SongSlotValue | undefined): void }>();

const query = ref('');
const isOpen = ref(false);
const results = ref<WorkspaceSong[]>([]);
const isSearching = ref(false);
const searchError = ref(false);
const chosenSong = ref<WorkspaceSong>();
const selectedArrangementId = ref<number | null>(null);
const stanzaInput = ref('');
const isCreatingArrangement = ref(false);
const arrangementError = ref('');
const arrangementName = computed(() => {
    const stanzas = parseStanzas(stanzaInput.value);
    return stanzas.length ? `Strophen ${stanzas.join(', ')}` : '';
});
let searchToken = 0;

const selected = computed(() => {
    if (!props.modelValue) return undefined;
    return props.songs.find((song) => song.id === props.modelValue?.songId)
        ?? (chosenSong.value?.id === props.modelValue.songId ? chosenSong.value : undefined);
});

const displayValue = computed(() => {
    const song = selected.value;
    if (!props.modelValue) return 'Lied auswählen';
    if (!song) return props.modelValue.title || 'Ausgewähltes Lied';
    return song.number
        ? `${song.category?.name ?? 'Lied'} ${song.number} – ${song.name}`
        : song.name;
});

let debounceTimer: number | undefined;
const runSearch = async (value: string) => {
    const token = ++searchToken;
    isSearching.value = true;
    searchError.value = false;
    try {
        const found = await props.searchSongs(value);
        if (token === searchToken) results.value = found;
    } catch {
        if (token === searchToken) {
            results.value = [];
            searchError.value = true;
        }
    } finally {
        if (token === searchToken) isSearching.value = false;
    }
};

watch(query, (value) => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void runSearch(value), 120);
});

const open = async () => {
    isOpen.value = true;
    await runSearch(query.value);
};

const choose = (song: WorkspaceSong) => {
    chosenSong.value = song;
    const arrangement = song.arrangements?.find((item) => item.isDefault) ?? song.arrangements?.[0];
    selectedArrangementId.value = arrangement?.id ?? null;
    emit('update:modelValue', {
        kind: 'song',
        songId: song.id,
        arrangementId: arrangement?.id ?? null,
        title: song.name,
        arrangementName: arrangement?.name,
        stanzas: arrangement?.name?.match(/^Strophen\s+([\d, ]+)$/i)?.[1].split(',').map(Number).filter((number) => Number.isInteger(number) && number > 0),
        sourceName: song.category?.name ?? song.hymnalName,
        number: song.number,
    });
    isOpen.value = false;
    query.value = '';
};

function parseStanzas(value: string): number[] {
    return [...new Set(value.split(/[\s,;]+/).map((part) => Number(part)).filter((number) => Number.isInteger(number) && number > 0))];
}

const updateArrangement = (arrangementId: number | null) => {
    selectedArrangementId.value = arrangementId;
    if (!props.modelValue) return;
    const arrangement = selected.value?.arrangements?.find((item) => item.id === arrangementId);
    const stanzas = arrangement?.name?.match(/^Strophen\s+([\d, ]+)$/i)?.[1]
        ?.split(',').map(Number).filter((number) => Number.isInteger(number) && number > 0);
    emit('update:modelValue', {
        ...props.modelValue,
        arrangementId,
        arrangementName: arrangement?.name,
        stanzas: stanzas?.length ? stanzas : undefined,
    });
};

const createArrangement = async () => {
    const song = selected.value;
    if (!song || !arrangementName.value || isCreatingArrangement.value) return;
    isCreatingArrangement.value = true;
    arrangementError.value = '';
    try {
        const created = await props.createArrangement(song.id, {
            name: arrangementName.value,
            description: arrangementName.value,
        });
        const updated = { ...song, arrangements: [...(song.arrangements ?? []), created] };
        chosenSong.value = updated;
        selectedArrangementId.value = created.id;
        if (props.modelValue) emit('update:modelValue', {
            ...props.modelValue,
            arrangementId: created.id,
            arrangementName: created.name ?? arrangementName.value,
            stanzas: parseStanzas(stanzaInput.value),
        });
        stanzaInput.value = '';
    } catch {
        arrangementError.value = 'Das Arrangement konnte nicht angelegt werden.';
    } finally {
        isCreatingArrangement.value = false;
    }
};

const updateComment = (comment: string) => {
    if (!props.modelValue) return;
    emit('update:modelValue', { ...props.modelValue, comment });
};

const clear = () => emit('update:modelValue', undefined);

watch(() => props.modelValue?.arrangementId, (id) => {
    selectedArrangementId.value = id ?? null;
});
</script>

<template>
    <div class="relative min-w-0">
        <label class="mb-1.5 block text-xs font-bold text-[#5e6974]" :for="pickerId">{{ label }}<span v-if="required"> *</span></label>
        <button :id="pickerId" class="flex min-h-10 w-full items-center justify-between rounded-md border border-[#cfd6dc] bg-white px-[11px] py-2 text-left text-[#1f2933] focus:outline focus:outline-2 focus:outline-[#b6c5dc]" type="button" :aria-expanded="isOpen" @click="open">
            <span :class="!selected ? 'text-[#89939d] font-normal' : 'font-medium'">{{ displayValue }}</span>
            <Icon icon="fas fa-chevron-down" size="S" />
        </button>
        <div v-if="selected" class="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#66717d]">
            <span><strong>{{ selected.category?.name ?? 'ChurchTools' }}</strong><span v-if="selected.number"> (Nr. {{ selected.number }})</span> · {{ selected.name }}</span>
            <Button aria-label="Lied entfernen" :icon="'fas fa-xmark'" :text="true" :color="'basic'" size="S" @click="clear" />
        </div>
        <div v-if="modelValue" class="mt-2">
            <label class="mb-1.5 block text-xs font-bold text-[#5e6974]" :for="`${pickerId}-arrangement`">Arrangement</label>
            <select :id="`${pickerId}-arrangement`" class="mb-2 min-h-9 w-full rounded-md border border-[#cfd6dc] bg-white px-2 text-sm" :value="selectedArrangementId ?? ''" @change="updateArrangement(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)">
                <option value="">Kein Arrangement</option>
                <option v-for="arrangement in selected?.arrangements ?? []" :key="arrangement.id" :value="arrangement.id">{{ arrangement.name || `Arrangement ${arrangement.id}` }}{{ arrangement.isDefault ? ' (Standard)' : '' }}</option>
            </select>
            <details v-if="canCreateArrangements" class="mb-2 rounded-md border border-[#e1e6ea] px-2.5 py-2">
                <summary class="cursor-pointer text-xs font-semibold text-[#4b5d79]">Neues Arrangement mit Strophen anlegen</summary>
                <div class="mt-2 flex gap-2">
                    <Input v-model="stanzaInput" label="Strophen" placeholder="z. B. 1, 3, 4" :show-label="false" />
                    <Button :text="false" :color="'primary'" size="S" :disabled="!arrangementName || isCreatingArrangement" @click="createArrangement">{{ isCreatingArrangement ? 'Wird angelegt …' : 'Anlegen' }}</Button>
                </div>
                <p v-if="arrangementName" class="mt-1 text-[11px] text-[#66717d]">Name: {{ arrangementName }}</p>
                <p v-if="arrangementError" class="mt-1 text-[11px] text-red-700">{{ arrangementError }}</p>
            </details>
            <p v-else class="mb-2 text-[11px] text-[#66717d]">Neue Arrangements erfordern die ChurchTools-Berechtigung „churchservice / edit masterdata“.</p>
            <label class="mb-1.5 block text-xs font-bold text-[#5e6974]" :for="`song-comment-${label}`">Kommentar hinzufügen</label>
            <Textarea
                :id="`song-comment-${label}`"
                :model-value="modelValue.comment ?? ''"
                placeholder="z. B. Strophen 1, 3 und 4 · Fietz-Melodie"
                @update:model-value="updateComment"
            />
        </div>
        <Card v-if="isOpen" class="absolute left-0 right-0 top-[calc(100%+8px)] z-[5] shadow-[0_14px_32px_rgba(25,37,48,.17)]" :data-cy="`song-picker-${label}`" @keydown.esc.stop="isOpen = false">
            <div class="flex items-center gap-1.5">
                <Input v-model="query" label="Song suchen" placeholder="z. B. EG 317 oder Lobe den Herren" :show-label="false" />
                <Button aria-label="Suche schließen" :icon="'fas fa-xmark'" :text="true" :color="'basic'" size="S" @click="isOpen = false" />
            </div>
            <div v-if="isSearching" class="px-1 pt-[18px] text-xs text-[#66717d]">Suche …</div>
            <div v-else-if="searchError" class="px-1 pt-[18px] text-xs text-[#66717d]">Die Suche ist fehlgeschlagen. Bitte erneut versuchen.</div>
            <div v-else-if="results.length === 0" class="px-1 pt-[18px] text-xs text-[#66717d]">Keine passenden Songs gefunden.</div>
            <div v-else class="mt-2.5 grid max-h-60 overflow-auto">
                <button v-for="song in results" :key="song.id" class="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-0 border-t border-[#edf0f2] bg-transparent px-[7px] py-[9px] text-left text-[#1f2933] hover:bg-[#f3f6f9]" type="button" @click="choose(song)">
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
