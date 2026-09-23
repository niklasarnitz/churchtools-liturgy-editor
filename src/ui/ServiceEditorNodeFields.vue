<script setup lang="ts">
import Input from '@churchtools/styleguide-components/form/input/Input.vue';
import SelectDropdown from '@churchtools/styleguide-components/form/select/SelectDropdown.vue';
import Textarea from '@churchtools/styleguide-components/form/textarea/Textarea.vue';
import type { LiturgyNode, ReadingSlotKey } from '../data/liturgies/types';
import type { SongSlotValue } from '../domain/agenda-generation/types';
import type { WorkspaceArrangement, WorkspaceSong } from './types';
import SongPicker from './SongPicker.vue';

defineProps<{
    node: LiturgyNode;
    songs: WorkspaceSong[];
    songSlots: Record<string, SongSlotValue | undefined>;
    textSlots: Record<string, string>;
    sermonTitles: Record<string, string>;
    sermonTexts: Record<string, string>;
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    createArrangement: (songId: number, input: { name: string; description?: string }) => Promise<WorkspaceArrangement>;
    canCreateArrangements?: boolean;
    readingHint: (slot: string) => string;
}>();

const readingOptions = [
    { id: 'oldTestament', name: 'Altes Testament' },
    { id: 'psalm', name: 'Psalm' },
    { id: 'epistle', name: 'Epistel' },
    { id: 'gospel', name: 'Evangelium' },
];

const editableText = (node: LiturgyNode): string => {
    if (node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer') return node.text ?? '';
    return node.type === 'creed' ? node.creed ?? '' : '';
};
const updateEditableText = (node: LiturgyNode, value: string) => {
    if (node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer') node.text = value;
    if (node.type === 'creed') node.creed = value;
};
const updateReadingSlot = (node: LiturgyNode, value: string | number) => {
    if (node.type === 'readingSlot') node.lectionarySlot = String(value) as ReadingSlotKey;
};
</script>

<template>
    <Input v-if="node.type === 'heading'" v-model="node.text" label="Überschrift" />
    <SongPicker
        v-else-if="node.type === 'songSlot'"
        :label="node.label ?? 'Lied'"
        :required="node.required"
        :songs="songs"
        :search-songs="searchSongs"
        :create-arrangement="createArrangement"
        :can-create-arrangements="canCreateArrangements"
        :model-value="songSlots[node.slot]"
        @update:model-value="songSlots[node.slot] = $event"
    />
    <div v-else-if="node.type === 'readingSlot'" class="grid gap-2 sm:grid-cols-2">
        <SelectDropdown :model-value="node.lectionarySlot ?? node.slot" label="Lesungstyp" :options="readingOptions" :emit-id="true" :clear="false" @update:model-value="updateReadingSlot(node, $event)" />
        <div>
            <Input v-model="textSlots[node.slot]" :label="node.label ?? 'Lesung'" :placeholder="readingHint(node.lectionarySlot ?? node.slot)" />
            <small class="text-basic-secondary">Vorschlag: {{ readingHint(node.lectionarySlot ?? node.slot) }}</small>
        </div>
    </div>
    <div v-else-if="node.type === 'sermonSlot'" class="grid gap-2 sm:grid-cols-2">
        <Input v-model="sermonTitles[node.slot ?? 'sermon']" label="Predigttitel" />
        <Input v-model="sermonTexts[node.slot ?? 'sermon']" label="Predigttext" :placeholder="readingHint('sermon')" />
    </div>
    <Textarea v-else-if="node.type === 'freeTextSlot'" v-model="textSlots[node.slot]" :label="node.label ?? 'Freier Text'" />
    <div v-else-if="node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer' || node.type === 'creed'">
        <p class="whitespace-pre-line text-sm text-basic-secondary">{{ editableText(node) || 'Noch kein Text hinterlegt' }}</p>
        <details class="mt-2">
            <summary class="cursor-pointer text-sm text-accent-primary">Text bearbeiten</summary>
            <div class="mt-2 grid gap-2">
                <Input :model-value="node.label ?? ''" label="Bezeichnung" @update:model-value="node.label = $event" />
                <Textarea :model-value="editableText(node)" label="Text" @update:model-value="updateEditableText(node, $event)" />
            </div>
        </details>
    </div>
</template>
