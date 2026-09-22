<script setup lang="ts">
import { Button, Card, Icon, Input, SelectDropdown, Textarea } from './styleguide';
import { computed, onMounted, reactive, ref, watch } from 'vue';

import type { AgendaSlotValue, NormalizedAgenda, SongSlotValue } from '../domain/agenda-generation';
import { generateNormalizedAgenda } from '../domain/agenda-generation';
import { resolveLiturgicalDay, formatScriptureReference } from '../domain/lectionary';
import type { LiturgyNode, LiturgyDefinition } from '../data/liturgies';
import type { OrganizationDefinition } from '../data/organizations';
import { resourceRegistry } from '../data/registry';
import type { WorkspaceEvent, WorkspaceSong, AgendaDriftView } from './types';
import SongPicker from './SongPicker.vue';

type SlotField = {
    id: string;
    slot: string;
    label: string;
    kind: 'song' | 'reading' | 'sermon' | 'text';
    required?: boolean;
};

const props = defineProps<{
    event: WorkspaceEvent;
    initialLiturgyId?: string;
    liturgies: LiturgyDefinition[];
    organizations: OrganizationDefinition[];
    songs: WorkspaceSong[];
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    saveAgenda: (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options?: { series?: string; force?: boolean }) => Promise<unknown>;
    inspectAgenda: (event: WorkspaceEvent) => Promise<AgendaDriftView | undefined>;
}>();

const emit = defineEmits<{
    (event: 'back'): void;
    (event: 'saved'): void;
    (event: 'drift', value: AgendaDriftView): void;
}>();

const initialLiturgy = props.liturgies.find((item) => item.id === props.initialLiturgyId)
    ?? props.liturgies.find((item) => item.organizationId === 'ekiba')
    ?? props.liturgies[0];
const selectedOrganizationId = ref(initialLiturgy?.organizationId ?? props.organizations[0]?.id ?? '');
const selectedLiturgyId = ref(initialLiturgy?.id ?? '');
const selectedDate = ref(props.event.startDate.slice(0, 10));
const sermonSeries = ref('');
const textSlots = reactive<Record<string, string>>({});
const songSlots = reactive<Record<string, SongSlotValue | undefined>>({});
const optionalSections = reactive<Record<string, boolean>>({});
const liturgicalDay = ref<ReturnType<typeof resolveLiturgicalDay>>();
const preview = ref<NormalizedAgenda>();
const saving = ref(false);
const saveError = ref<string>();

const selectedOrganization = computed(() => props.organizations.find((item) => item.id === selectedOrganizationId.value));
const selectedLiturgy = computed(() => props.liturgies.find((item) => item.id === selectedLiturgyId.value));

const flattenNodes = (nodes: LiturgyNode[], result: SlotField[] = []): SlotField[] => {
    nodes.forEach((node) => {
        if (node.type === 'songSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? 'Lied', kind: 'song', required: node.required });
        if (node.type === 'readingSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? (node.slot === 'psalm' ? 'Psalm' : `Lesung · ${node.slot}`), kind: 'reading', required: node.required });
        if (node.type === 'sermonSlot') result.push({ id: node.id, slot: node.slot ?? 'sermon', label: node.label ?? 'Predigttext', kind: 'sermon', required: node.required });
        if (node.type === 'freeTextSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? node.slot, kind: 'text', required: node.required });
        if (node.type === 'optionalSection' || node.type === 'communionSection') flattenNodes(node.nodes, result);
    });
    return result;
};

const slotFields = computed(() => selectedLiturgy.value ? flattenNodes(selectedLiturgy.value.nodes) : []);
const previewErrorMessage = (cause: unknown): string => {
    const message = cause instanceof Error ? cause.message : '';
    const prefix = 'Required liturgy slots are missing:';
    if (message.startsWith(prefix)) {
        const labels = message.slice(prefix.length).split(',').map((slot) => {
            const id = slot.trim();
            return slotFields.value.find((field) => field.slot === id)?.label ?? id;
        });
        return `Bitte fülle die Pflichtfelder aus: ${labels.join(', ')}.`;
    }
    return message || 'Die Vorschau konnte nicht erstellt werden.';
};
const readingHint = (slot: string): string => {
    if (!liturgicalDay.value) return 'Für dieses Datum liegt im gewählten Lektionar kein Vorschlag vor.';
    if (slot === 'psalm') return liturgicalDay.value.weeklyPsalm ?? 'Kein Psalm vorgeschlagen';
    const reference = liturgicalDay.value.readings[slot as keyof typeof liturgicalDay.value.readings];
    return reference ? formatScriptureReference(reference) : 'Kein Vorschlag';
};

const refreshDay = () => {
    liturgicalDay.value = undefined;
    if (!selectedOrganization.value || !selectedLiturgy.value) return;
    try {
        liturgicalDay.value = resolveLiturgicalDay({
            date: selectedDate.value,
            organization: selectedOrganization.value,
            liturgy: selectedLiturgy.value,
            lectionaries: resourceRegistry.lectionaries,
            overrides: sermonSeries.value ? { sermonSeries: sermonSeries.value } : undefined,
        });
        if (liturgicalDay.value?.sermonSeries && !sermonSeries.value) sermonSeries.value = liturgicalDay.value.sermonSeries;
    } catch {
        liturgicalDay.value = undefined;
    }
};

const effectiveSlots = computed<Record<string, AgendaSlotValue | undefined>>(() => {
    const values: Record<string, AgendaSlotValue | undefined> = { ...songSlots };
    Object.entries(textSlots).forEach(([key, value]) => {
        if (value.trim()) values[key] = value.trim();
    });
    return values;
});

const buildPreview = () => {
    if (!selectedLiturgy.value) return;
    try {
        preview.value = generateNormalizedAgenda({
            template: selectedLiturgy.value,
            slots: effectiveSlots.value,
            liturgicalDay: liturgicalDay.value,
            optionalSections,
            series: sermonSeries.value || liturgicalDay.value?.sermonSeries,
        });
        saveError.value = undefined;
    } catch (cause) {
        preview.value = undefined;
        saveError.value = previewErrorMessage(cause);
    }
};

const save = async (force = false) => {
    if (!selectedLiturgy.value) return;
    saving.value = true;
    saveError.value = undefined;
    try {
        await props.saveAgenda(props.event, selectedLiturgy.value, effectiveSlots.value, { series: sermonSeries.value || liturgicalDay.value?.sermonSeries, force });
        emit('saved');
    } catch (cause) {
        const drift = (cause as { drift?: AgendaDriftView }).drift;
        if (drift) emit('drift', drift);
        saveError.value = cause instanceof Error ? cause.message : 'Der Ablauf konnte nicht gespeichert werden.';
    } finally {
        saving.value = false;
    }
};

watch([selectedDate, selectedOrganizationId, selectedLiturgyId, sermonSeries], refreshDay, { immediate: true });
watch([selectedLiturgyId, effectiveSlots, optionalSections], buildPreview, { deep: true });
onMounted(async () => {
    refreshDay();
    buildPreview();
    const drift = await props.inspectAgenda(props.event);
    if (drift) emit('drift', drift);
});

defineExpose({ saveWithForce: () => save(true) });
</script>

<template>
    <div class="mx-auto grid max-w-[1280px] grid-cols-1 gap-7 min-[901px]:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <div class="grid gap-4">
            <div class="mb-1 flex items-start gap-[18px]">
                <Button label="Zurück" icon="fas fa-arrow-left" :text="true" :color="'basic'" @click="emit('back')" />
                <div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Gottesdienst bearbeiten</div><h2 class="my-[5px] text-[28px] font-semibold tracking-[-.035em]">{{ event.name }}</h2><p class="text-[13px] text-[#66717d]">{{ new Date(event.startDate).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }) }}</p></div>
            </div>
            <Card>
                <template #titleFull><div class="flex items-start justify-between gap-5"><div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Grundlagen</div><h3 class="mt-1 text-[18px] font-semibold tracking-[-.02em]">Liturgie und Kirchenjahr</h3></div><Icon icon="fas fa-calendar-days" size="L" /></div></template>
                <div class="grid grid-cols-1 gap-4 min-[561px]:grid-cols-2">
                    <Input v-model="selectedDate" label="Datum" type="date" />
                    <SelectDropdown v-model="selectedOrganizationId" label="Kirchenkörper" :options="organizations.map((item) => ({ id: item.id, name: item.name }))" :emit-id="true" :clear="false" />
                    <SelectDropdown v-model="selectedLiturgyId" class="col-span-full max-[560px]:col-auto" label="Liturgie" :options="liturgies.map((item) => ({ id: item.id, name: item.name }))" :emit-id="true" :clear="false" />
                    <Input v-model="sermonSeries" label="Predigtreihe" placeholder="z. B. III" />
                </div>
                <div v-if="liturgicalDay" class="mt-5 flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#4b5d79]"></span><div><strong>{{ liturgicalDay.name }}</strong><span v-if="liturgicalDay.season"> · {{ liturgicalDay.season }}</span><p class="my-0.5 text-[#66717d]">Vorschläge aus dem Test-Lektionar. Alle Angaben bleiben überschreibbar.</p></div></div>
                <div v-else class="mt-5 flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]"><Icon icon="fas fa-circle-info" size="S" /> Für dieses Datum liegt kein Lektionar-Vorschlag vor. Die Felder können manuell ausgefüllt werden.</div>
            </Card>

            <Card>
                <template #titleFull><div class="flex items-start justify-between gap-5"><div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Variable Teile</div><h3 class="mt-1 text-[18px] font-semibold tracking-[-.02em]">Nur die relevanten Felder</h3></div><Icon icon="fas fa-sliders" size="L" /></div></template>
                <div class="grid grid-cols-1 gap-x-4 gap-y-[18px] min-[561px]:grid-cols-2">
                    <template v-for="field in slotFields" :key="field.id">
                        <SongPicker v-if="field.kind === 'song'" :label="field.label" :required="field.required" :songs="songs" :search-songs="searchSongs" :model-value="songSlots[field.slot]" @update:model-value="songSlots[field.slot] = $event" />
                        <div v-else-if="field.kind === 'reading' || field.kind === 'sermon'" class="min-w-0"><Input v-model="textSlots[field.slot]" :label="field.label" :placeholder="readingHint(field.slot)" :required="field.required" /><small class="mt-1 block text-[11px] text-[#66717d]">Vorschlag: {{ readingHint(field.slot) }}</small></div>
                        <div v-else class="min-w-0"><label class="mb-1.5 block text-xs font-bold text-[#5e6974]">{{ field.label }}<span v-if="field.required"> *</span></label><Textarea v-model="textSlots[field.slot]" :placeholder="`Text für „${field.label}“`" /></div>
                    </template>
                </div>
                <div v-if="slotFields.length === 0" class="flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]">Diese Liturgie enthält keine variablen Felder.</div>
            </Card>

            <div v-if="saveError" class="flex items-center gap-2.5 rounded-lg border border-[#e7b8b8] bg-[#fff3f3] px-4 py-3 text-[13px] text-[#9b3030]" role="alert"><Icon icon="fas fa-triangle-exclamation" size="S" /> {{ saveError }}</div>
            <div class="flex justify-end gap-2.5 max-[560px]:justify-stretch"><Button label="Vorschau aktualisieren" icon="fas fa-eye" :outlined="true" @click="buildPreview" /><Button label="Ablauf erstellen" icon="fas fa-check" :loading="saving" @click="save" /></div>
        </div>
        <aside><div class="sticky top-6 rounded-[10px] border border-[#dfe4e8] bg-white p-5 max-[900px]:static"><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Vorschau</div><h3 class="my-[5px] text-[19px] font-semibold">Nativer ChurchTools-Ablauf</h3><p class="mb-[18px] text-xs leading-[1.5] text-[#66717d]">So wird der Ablauf im normalen ChurchTools-Agenda-Editor erscheinen.</p><div v-if="preview" class="grid gap-0.5"><div v-for="item in preview.items" :key="item.nodeId" class="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-[#edf0f2] px-[7px] py-[9px]" :class="item.type === 'header' ? 'mt-1.5 border-b-[#c9d3df] text-[#4b5d79]' : ''"><span class="text-[#8d98a3]"><Icon :icon="item.type === 'song' ? 'fas fa-music' : item.type === 'header' ? 'fas fa-heading' : 'fas fa-align-left'" size="S" /></span><div><strong class="block text-xs">{{ item.title }}</strong><small v-if="item.note" class="mt-0.5 block text-[11px] text-[#66717d]">{{ item.note }}</small></div></div></div><div v-else class="flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]"><Icon icon="fas fa-wand-magic-sparkles" size="S" /> Fülle die Pflichtfelder aus, um eine Vorschau zu sehen.</div></div>
        </aside>
    </div>
</template>
