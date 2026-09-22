<script setup lang="ts">
import { Button, Card, Icon, Input, SelectDropdown, Textarea } from './styleguide';
import { computed, onMounted, reactive, ref, watch } from 'vue';

import type { AgendaSlotValue, NormalizedAgenda, SongSlotValue } from '../domain/agenda-generation';
import { generateNormalizedAgenda } from '../domain/agenda-generation';
import { resolveLiturgicalDay, formatScriptureReference } from '../domain/lectionary';
import type { LiturgyNode, LiturgyDefinition } from '../data/liturgies';
import type { OrganizationDefinition } from '../data/organizations';
import type { LiturgicalDay } from '../data/lectionaries';
import type { LiturgicalSuggestion } from '../application';
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
    organizationId?: string;
    liturgies: LiturgyDefinition[];
    organizations: OrganizationDefinition[];
    songs: WorkspaceSong[];
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    saveAgenda: (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options?: { series?: string; force?: boolean }) => Promise<unknown>;
    inspectAgenda: (event: WorkspaceEvent) => Promise<AgendaDriftView | undefined>;
    suggestLiturgicalDay?: (input: { date: string; organizationId: string; liturgyId?: string; overrides?: Parameters<typeof resolveLiturgicalDay>[0]['overrides'] }) => Promise<LiturgicalSuggestion>;
}>();

const emit = defineEmits<{
    (event: 'back'): void;
    (event: 'saved'): void;
    (event: 'drift', value: AgendaDriftView): void;
}>();

const initialLiturgy = props.liturgies.find((item) => item.id === props.initialLiturgyId) ?? props.liturgies[0];
const selectedOrganizationId = computed(() => props.organizationId ?? '');
const selectedLiturgyId = ref(initialLiturgy?.id ?? '');
const selectedDate = ref(props.event.startDate.slice(0, 10));
const sermonSeries = ref('');
const textSlots = reactive<Record<string, string>>({});
const songSlots = reactive<Record<string, SongSlotValue | undefined>>({});
const optionalSections = reactive<Record<string, boolean>>({});
const liturgicalDay = ref<LiturgicalDay>();
const suggestionSource = ref<LiturgicalSuggestion['source']>('none');
const suggestionLoading = ref(false);
let refreshToken = 0;
const preview = ref<NormalizedAgenda>();
const saving = ref(false);
const saveError = ref<string>();

const selectedOrganization = computed(() => props.organizations.find((item) => item.id === selectedOrganizationId.value));
const selectedLiturgy = computed(() => props.liturgies.find((item) => item.id === selectedLiturgyId.value));

type OptionalSectionItem = {
    sectionKey: string;
    label: string;
};

const findOptionalSections = (nodes: LiturgyNode[], result: OptionalSectionItem[] = []): OptionalSectionItem[] => {
    nodes.forEach((node) => {
        if (node.type === 'optionalSection') {
            result.push({ sectionKey: node.sectionKey, label: node.label ?? node.sectionKey });
            findOptionalSections(node.nodes, result);
        } else if (node.type === 'communionSection') {
            findOptionalSections(node.nodes, result);
        }
    });
    return result;
};

const availableOptionalSections = computed(() =>
    selectedLiturgy.value ? findOptionalSections(selectedLiturgy.value.nodes) : []
);

const flattenNodes = (nodes: LiturgyNode[], result: SlotField[] = []): SlotField[] => {
    nodes.forEach((node) => {
        if (node.type === 'songSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? 'Lied', kind: 'song', required: node.required });
        if (node.type === 'readingSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? (node.slot === 'psalm' ? 'Psalm' : `Lesung · ${node.slot}`), kind: 'reading', required: node.required });
        if (node.type === 'sermonSlot') result.push({ id: node.id, slot: node.slot ?? 'sermon', label: node.label ?? 'Predigttext', kind: 'sermon', required: node.required });
        if (node.type === 'freeTextSlot') result.push({ id: node.id, slot: node.slot, label: node.label ?? node.slot, kind: 'text', required: node.required });
        if (node.type === 'optionalSection') {
            if (optionalSections[node.sectionKey] === true) flattenNodes(node.nodes, result);
        } else if (node.type === 'communionSection') {
            flattenNodes(node.nodes, result);
        }
    });
    return result;
};

const liturgicalColor = (color?: string): string => {
    if (!color) return '#4b5d79';
    const c = color.toLowerCase();
    if (c === 'weiß' || c === 'weiss' || c === 'white') return '#ffffff';
    if (c === 'rot' || c === 'red') return '#dc2626';
    if (c === 'grün' || c === 'gruen' || c === 'green') return '#16a34a';
    if (c === 'violett' || c === 'purple') return '#7c3aed';
    if (c === 'schwarz' || c === 'black') return '#1e293b';
    return '#4b5d79';
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

const refreshDay = async () => {
    const token = ++refreshToken;
    liturgicalDay.value = undefined;
    suggestionSource.value = 'none';
    if (!selectedOrganization.value || !selectedLiturgy.value) return;
    suggestionLoading.value = true;
    try {
        const suggestion = props.suggestLiturgicalDay
            ? await props.suggestLiturgicalDay({
                  date: selectedDate.value,
                  organizationId: selectedOrganization.value.id,
                  liturgyId: selectedLiturgy.value.id,
                  overrides: sermonSeries.value ? { sermonSeries: sermonSeries.value } : undefined,
              })
            : {
                  day: resolveLiturgicalDay({
                      date: selectedDate.value,
                      organization: selectedOrganization.value,
                      liturgy: selectedLiturgy.value,
                      lectionaries: resourceRegistry.lectionaries,
                      overrides: sermonSeries.value ? { sermonSeries: sermonSeries.value } : undefined,
                  }),
                  source: 'local' as const,
                  overrides: {},
              };
        if (token !== refreshToken) return;
        liturgicalDay.value = suggestion.day;
        suggestionSource.value = suggestion.source;
        if (liturgicalDay.value?.sermonSeries && !sermonSeries.value) sermonSeries.value = liturgicalDay.value.sermonSeries;
    } catch {
        if (token !== refreshToken) return;
        liturgicalDay.value = undefined;
        suggestionSource.value = 'none';
    } finally {
        if (token === refreshToken) suggestionLoading.value = false;
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

watch([selectedDate, selectedOrganizationId, selectedLiturgyId], () => { void refreshDay(); }, { immediate: true });
watch([selectedLiturgyId, effectiveSlots, optionalSections, sermonSeries, liturgicalDay], buildPreview, { deep: true });
onMounted(() => {
    buildPreview();
    void props.inspectAgenda(props.event).then((drift) => {
        if (drift) emit('drift', drift);
    }).catch((cause: unknown) => {
        saveError.value = cause instanceof Error ? cause.message : 'Der native Ablauf konnte nicht geladen werden.';
    });
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
                    <div v-if="selectedOrganization" class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5"><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Kirchenkörper</div><div class="mt-1 text-sm font-semibold text-slate-800">{{ selectedOrganization.name }}</div><div class="mt-0.5 text-[11px] text-[#66717d]">In den Einstellungen festgelegt</div></div>
                    <div v-else class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Bitte zuerst einen Kirchenkörper in den Einstellungen festlegen.</div>
                    <SelectDropdown v-model="selectedLiturgyId" class="col-span-full max-[560px]:col-auto" label="Liturgie" :options="liturgies.map((item) => ({ id: item.id, name: item.name }))" :emit-id="true" :clear="false" />
                    <Input v-model="sermonSeries" label="Predigtreihe" placeholder="z. B. III" />
                </div>
                <div v-if="suggestionLoading" class="mt-5 flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]"><Icon icon="fas fa-spinner" size="S" /> Kirchenjahr-Vorschlag wird geladen …</div>
                <div v-else-if="liturgicalDay" class="mt-5 flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]">
                    <span
                        class="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 shadow-sm"
                        :style="{ backgroundColor: liturgicalColor(liturgicalDay.color) }"
                        :title="`Liturgische Farbe: ${liturgicalDay.color ?? 'keine'}`"
                    ></span>
                    <div>
                        <strong>{{ liturgicalDay.name }}</strong>
                        <span v-if="liturgicalDay.season"> · {{ liturgicalDay.season }}</span>
                        <span v-if="liturgicalDay.color" class="text-slate-500"> (Liturgische Farbe: {{ liturgicalDay.color }})</span>
                        <p class="my-0.5 text-[#66717d]">Vorschläge aus {{ suggestionSource === 'external' ? 'dem verbundenen Lektionar' : 'den installierten Ressourcen' }}. Alle Angaben bleiben überschreibbar.</p>
                        <p v-if="liturgicalDay.weeklyHymn" class="my-0.5 font-medium text-accent-primary">
                            Wochenlied laut Lektionar: <strong>{{ liturgicalDay.weeklyHymn }}</strong>
                        </p>
                    </div>
                </div>
                <div v-else class="mt-5 flex items-start gap-2.5 rounded-[7px] bg-[#f5f7fa] px-3.5 py-3 text-xs leading-[1.5] text-[#52606e]"><Icon icon="fas fa-circle-info" size="S" /> Für dieses Datum liegt kein Lektionar-Vorschlag vor. Die Felder können manuell ausgefüllt werden.</div>
            </Card>

            <Card>
                <template #titleFull><div class="flex items-start justify-between gap-5"><div><div class="text-[11px] font-bold uppercase tracking-[.055em] text-[#66717d]">Variable Teile</div><h3 class="mt-1 text-[18px] font-semibold tracking-[-.02em]">Nur die relevanten Felder</h3></div><Icon icon="fas fa-sliders" size="L" /></div></template>
                <div v-if="availableOptionalSections.length > 0" class="mb-4 flex flex-wrap gap-4 border-b border-slate-200 pb-3">
                    <label v-for="section in availableOptionalSections" :key="section.sectionKey" class="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                        <input v-model="optionalSections[section.sectionKey]" type="checkbox" class="rounded border-slate-300 text-accent-primary" />
                        <span>{{ section.label }}</span>
                    </label>
                </div>
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
