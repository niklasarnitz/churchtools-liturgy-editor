<script setup lang="ts">
import { Button, Icon, Input, SelectDropdown } from './styleguide';
import { computed, onMounted, reactive, ref, watch } from 'vue';

import type { AgendaSlotValue, NormalizedAgenda, SermonSlotValue, SongSlotValue } from '../domain/agenda-generation';
import { generateNormalizedAgenda } from '../domain/agenda-generation';
import { formatScriptureReference } from '../domain/lectionary';
import type { LiturgicalDayOverrides } from '../domain/lectionary';
import type { LiturgyNode, LiturgyDefinition, LiturgyNodeType } from '../data/liturgies';
import type { OrganizationDefinition } from '../data/organizations';
import type { LiturgicalDay } from '../data/lectionaries';
import type { LiturgicalSuggestion } from '../application';
import type { WorkspaceEvent, WorkspaceSong, AgendaDriftView } from './types';
import SongPicker from './SongPicker.vue';
import { openLiturgyPrintDialog } from '../domain/liturgy-document';

type SlotField = { id: string; slot: string; label: string; kind: 'song' | 'reading' | 'sermon' | 'text'; required?: boolean };
type PaletteKind = 'heading' | 'songSlot' | 'readingSlot' | 'sermonSlot' | 'prayer' | 'freeTextSlot';
type DragPayload = { source: 'canvas'; index: number } | { source: 'palette'; kind: PaletteKind };

const props = defineProps<{
    event: WorkspaceEvent;
    initialLiturgyId?: string;
    organizationId?: string;
    liturgies: LiturgyDefinition[];
    organizations: OrganizationDefinition[];
    songs: WorkspaceSong[];
    searchSongs: (query: string) => Promise<WorkspaceSong[]>;
    saveAgenda: (event: WorkspaceEvent, template: LiturgyDefinition, slots: Readonly<Record<string, AgendaSlotValue | undefined>>, options?: { series?: string; force?: boolean; optionalSections?: Readonly<Record<string, boolean>>; liturgicalDay?: LiturgicalDay; nodes?: LiturgyNode[] }) => Promise<unknown>;
    inspectAgenda: (event: WorkspaceEvent) => Promise<AgendaDriftView | undefined>;
    suggestLiturgicalDay: (input: { date: string; organizationId: string; liturgyId?: string; overrides?: LiturgicalDayOverrides }) => Promise<LiturgicalSuggestion>;
}>();

const emit = defineEmits<{
    (event: 'back'): void;
    (event: 'saved'): void;
    (event: 'drift', value: AgendaDriftView): void;
}>();

const palette = [
    { kind: 'heading' as const, label: 'Überschrift', hint: 'Gliedert den Ablauf', icon: 'fas fa-heading', tone: 'blue' },
    { kind: 'songSlot' as const, label: 'Lied', hint: 'Aus ChurchTools auswählen', icon: 'fas fa-music', tone: 'violet' },
    { kind: 'readingSlot' as const, label: 'Lesung', hint: 'Bibelstelle oder Lektionar', icon: 'fas fa-book-open', tone: 'green' },
    { kind: 'sermonSlot' as const, label: 'Predigt', hint: 'Titel und Predigttext', icon: 'fas fa-message-lines', tone: 'orange' },
    { kind: 'prayer' as const, label: 'Gebet', hint: 'Fester Gebetstext', icon: 'fas fa-hands-praying', tone: 'rose' },
    { kind: 'freeTextSlot' as const, label: 'Freier Text', hint: 'Individueller Inhalt', icon: 'fas fa-align-left', tone: 'slate' },
];

const initialLiturgy = props.liturgies.find((item) => item.id === props.initialLiturgyId) ?? props.liturgies[0];
const selectedOrganizationId = computed(() => props.organizationId ?? '');
const selectedOrganization = computed(() => props.organizations.find((item) => item.id === selectedOrganizationId.value));
const selectedLiturgyId = ref(initialLiturgy?.id ?? '');
const selectedLiturgy = computed(() => props.liturgies.find((item) => item.id === selectedLiturgyId.value));
const selectedDate = ref(props.event.startDate.slice(0, 10));
const sermonSeries = ref('');
const selectedVariantKey = ref('');
const editorNodes = ref<LiturgyNode[]>([]);
const textSlots = reactive<Record<string, string>>({});
const sermonTitles = reactive<Record<string, string>>({});
const sermonTexts = reactive<Record<string, string>>({});
const songSlots = reactive<Record<string, SongSlotValue | undefined>>({});
const liturgicalDay = ref<LiturgicalDay>();
const suggestionLoading = ref(false);
const preview = ref<NormalizedAgenda>();
const saving = ref(false);
const saveError = ref<string>();
const dragPayload = ref<DragPayload>();
const activeDropIndex = ref<number>();
let refreshToken = 0;
let nodeSequence = 0;

const variants = computed(() => (selectedLiturgy.value?.nodes ?? [])
    .filter((node): node is Extract<LiturgyNode, { type: 'optionalSection' }> => node.type === 'optionalSection')
    .map((node) => ({ key: node.sectionKey, label: node.label ?? node.sectionKey, nodes: node.nodes })));

const cloneNodes = (nodes: LiturgyNode[]): LiturgyNode[] => structuredClone(nodes);
const flattenContainers = (nodes: LiturgyNode[]): LiturgyNode[] => nodes.flatMap((node) => {
    if (node.type === 'communionSection') return flattenContainers(node.nodes);
    if (node.type === 'optionalSection') return [];
    return [node];
});

const resetEditor = () => {
    const template = selectedLiturgy.value;
    if (!template) {
        editorNodes.value = [];
        return;
    }
    if (variants.value.length > 0) {
        if (!variants.value.some((variant) => variant.key === selectedVariantKey.value)) selectedVariantKey.value = variants.value[0]?.key ?? '';
        const variant = variants.value.find((item) => item.key === selectedVariantKey.value);
        editorNodes.value = cloneNodes(flattenContainers(variant?.nodes ?? []));
    } else {
        editorNodes.value = cloneNodes(flattenContainers(template.nodes));
    }
};

const slotFields = computed<SlotField[]>(() => editorNodes.value.flatMap((node): SlotField[] => {
    if (node.type === 'songSlot') return [{ id: node.id, slot: node.slot, label: node.label ?? 'Lied', kind: 'song', required: node.required }];
    if (node.type === 'readingSlot') return [{ id: node.id, slot: node.slot, label: node.label ?? 'Lesung', kind: 'reading', required: node.required }];
    if (node.type === 'sermonSlot') return [{ id: node.id, slot: node.slot ?? 'sermon', label: node.label ?? 'Predigt', kind: 'sermon', required: node.required }];
    if (node.type === 'freeTextSlot') return [{ id: node.id, slot: node.slot, label: node.label ?? 'Freier Text', kind: 'text', required: node.required }];
    return [];
}));

const effectiveSlots = computed<Record<string, AgendaSlotValue | undefined>>(() => {
    const values: Record<string, AgendaSlotValue | undefined> = { ...songSlots };
    Object.entries(textSlots).forEach(([key, value]) => { if (value.trim()) values[key] = value.trim(); });
    slotFields.value.filter((field) => field.kind === 'sermon').forEach((field) => {
        const title = sermonTitles[field.slot]?.trim();
        const text = sermonTexts[field.slot]?.trim();
        if (title || text) values[field.slot] = { kind: 'sermon', title, text: text ?? '' } satisfies SermonSlotValue;
    });
    return values;
});

const editorTemplate = computed<LiturgyDefinition | undefined>(() => {
    if (!selectedLiturgy.value) return undefined;
    const variantLabel = variants.value.find((variant) => variant.key === selectedVariantKey.value)?.label;
    return { ...selectedLiturgy.value, serviceType: variantLabel ?? selectedLiturgy.value.serviceType, nodes: editorNodes.value };
});

const previewErrorMessage = (cause: unknown): string => {
    const message = cause instanceof Error ? cause.message : '';
    const prefix = 'Required liturgy slots are missing:';
    if (!message.startsWith(prefix)) return message || 'Die Vorschau konnte nicht erstellt werden.';
    const labels = message.slice(prefix.length).split(',').map((slot) => {
        const id = slot.trim();
        return slotFields.value.find((field) => field.slot === id)?.label ?? id;
    });
    return `Bitte fülle die Pflichtfelder aus: ${labels.join(', ')}.`;
};

const buildPreview = () => {
    if (!editorTemplate.value) return;
    try {
        preview.value = generateNormalizedAgenda({
            template: editorTemplate.value,
            slots: effectiveSlots.value,
            liturgicalDay: liturgicalDay.value,
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
        await props.saveAgenda(props.event, selectedLiturgy.value, effectiveSlots.value, {
            series: sermonSeries.value || liturgicalDay.value?.sermonSeries,
            force,
            liturgicalDay: liturgicalDay.value,
            nodes: cloneNodes(editorNodes.value),
        });
        emit('saved');
    } catch (cause) {
        const drift = (cause as { drift?: AgendaDriftView }).drift;
        if (drift) emit('drift', drift);
        saveError.value = cause instanceof Error ? cause.message : 'Der Ablauf konnte nicht gespeichert werden.';
    } finally {
        saving.value = false;
    }
};

const refreshDay = async () => {
    const token = ++refreshToken;
    liturgicalDay.value = undefined;
    if (!selectedOrganization.value || !selectedLiturgy.value) return;
    suggestionLoading.value = true;
    try {
        const suggestion = await props.suggestLiturgicalDay({
            date: selectedDate.value,
            organizationId: selectedOrganization.value.id,
            liturgyId: selectedLiturgy.value.id,
            overrides: sermonSeries.value ? { sermonSeries: sermonSeries.value } : undefined,
        });
        if (token !== refreshToken) return;
        liturgicalDay.value = suggestion.day;
        if (liturgicalDay.value?.sermonSeries && !sermonSeries.value) sermonSeries.value = liturgicalDay.value.sermonSeries;
    } catch {
        if (token === refreshToken) liturgicalDay.value = undefined;
    } finally {
        if (token === refreshToken) suggestionLoading.value = false;
    }
};

const readingHint = (slot: string): string => {
    if (!liturgicalDay.value) return 'Keine Empfehlung aus dem Lektionar';
    if (slot === 'psalm') return liturgicalDay.value.weeklyPsalm ?? 'Kein Psalm vorgeschlagen';
    const reference = liturgicalDay.value.readings[slot as keyof typeof liturgicalDay.value.readings];
    return reference ? formatScriptureReference(reference) : 'Keine Empfehlung aus dem Lektionar';
};

const liturgicalColor = (color?: string): string => {
    const normalized = color?.toLowerCase();
    if (normalized === 'weiß' || normalized === 'weiss' || normalized === 'white') return '#ffffff';
    if (normalized === 'rot' || normalized === 'red') return '#dc2626';
    if (normalized === 'grün' || normalized === 'gruen' || normalized === 'green') return '#16a34a';
    if (normalized === 'violett' || normalized === 'purple') return '#7c3aed';
    if (normalized === 'schwarz' || normalized === 'black') return '#1e293b';
    return '#718096';
};

const exportPdf = () => {
    buildPreview();
    if (!editorTemplate.value?.print || !preview.value) return;
    try {
        openLiturgyPrintDialog({
            event: props.event,
            template: editorTemplate.value,
            agenda: preview.value,
            slots: effectiveSlots.value,
            optionalSections: {},
        });
    } catch (cause) {
        saveError.value = cause instanceof Error ? cause.message : 'Der PDF-Export konnte nicht geöffnet werden.';
    }
};

const nodeIcon = (type: LiturgyNodeType): string => ({
    heading: 'fas fa-heading', fixedText: 'fas fa-quote-left', rubric: 'fas fa-comment-lines', songSlot: 'fas fa-music', readingSlot: 'fas fa-book-open', sermonSlot: 'fas fa-message-lines', creed: 'fas fa-cross', prayer: 'fas fa-hands-praying', optionalSection: 'fas fa-layer-group', freeTextSlot: 'fas fa-align-left', communionSection: 'fas fa-wheat-awn',
})[type];

const nodeTone = (type: LiturgyNodeType): string => ({
    heading: 'blue', fixedText: 'slate', rubric: 'slate', songSlot: 'violet', readingSlot: 'green', sermonSlot: 'orange', creed: 'blue', prayer: 'rose', optionalSection: 'blue', freeTextSlot: 'slate', communionSection: 'rose',
})[type];

const nodeTitle = (node: LiturgyNode): string => {
    if (node.label) return node.label;
    if (node.type === 'heading') return node.text;
    if (node.type === 'fixedText' || node.type === 'rubric') return node.text.split('\n')[0] ?? 'Text';
    if (node.type === 'creed') return 'Glaubensbekenntnis';
    if (node.type === 'prayer') return 'Gebet';
    if (node.type === 'songSlot') return 'Lied';
    if (node.type === 'readingSlot') return 'Lesung';
    if (node.type === 'sermonSlot') return 'Predigt';
    if (node.type === 'freeTextSlot') return 'Freier Text';
    return 'Abschnitt';
};

const nodeKindLabel = (type: LiturgyNodeType): string => ({
    heading: 'Überschrift', fixedText: 'Festtext', rubric: 'Hinweis', songSlot: 'Lied', readingSlot: 'Lesung', sermonSlot: 'Predigt', creed: 'Bekenntnis', prayer: 'Gebet', optionalSection: 'Optionaler Abschnitt', freeTextSlot: 'Freier Text', communionSection: 'Abendmahl',
})[type];

const uniqueId = (prefix: string) => `editor-${prefix}-${Date.now()}-${++nodeSequence}`;
const createNode = (kind: PaletteKind): LiturgyNode => {
    const id = uniqueId(kind);
    if (kind === 'heading') return { id, type: 'heading', text: 'Neuer Abschnitt' };
    if (kind === 'songSlot') return { id, type: 'songSlot', slot: `${id}-song`, label: 'Lied' };
    if (kind === 'readingSlot') return { id, type: 'readingSlot', slot: 'gospel', label: 'Lesung' };
    if (kind === 'sermonSlot') return { id, type: 'sermonSlot', slot: 'sermon', label: 'Predigt' };
    if (kind === 'prayer') return { id, type: 'prayer', label: 'Gebet', text: '' };
    return { id, type: 'freeTextSlot', slot: `${id}-text`, label: 'Freier Text' };
};

const addNode = (kind: PaletteKind, index = editorNodes.value.length) => {
    editorNodes.value.splice(index, 0, createNode(kind));
};

const removeNode = (index: number) => editorNodes.value.splice(index, 1);
const moveNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= editorNodes.value.length) return;
    const [node] = editorNodes.value.splice(index, 1);
    if (node) editorNodes.value.splice(target, 0, node);
};

const startCanvasDrag = (index: number, event: DragEvent) => {
    dragPayload.value = { source: 'canvas', index };
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `canvas:${index}`);
    }
};
const startPaletteDrag = (kind: PaletteKind, event: DragEvent) => {
    dragPayload.value = { source: 'palette', kind };
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', `palette:${kind}`);
    }
};
const dropAt = (index: number) => {
    const payload = dragPayload.value;
    if (!payload) return;
    if (payload.source === 'palette') addNode(payload.kind, index);
    else {
        const [node] = editorNodes.value.splice(payload.index, 1);
        const target = payload.index < index ? index - 1 : index;
        if (node) editorNodes.value.splice(target, 0, node);
    }
    dragPayload.value = undefined;
    activeDropIndex.value = undefined;
};
const endDrag = () => { dragPayload.value = undefined; activeDropIndex.value = undefined; };

const eventValue = (event: Event): string => (event.target as HTMLInputElement | HTMLTextAreaElement).value;
const updateLabel = (node: LiturgyNode, value: string) => { node.label = value; };
const editableText = (node: LiturgyNode): string => {
    if (node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer') return node.text ?? '';
    if (node.type === 'creed') return node.creed ?? '';
    return '';
};
const updateEditableText = (node: LiturgyNode, value: string) => {
    if (node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer') node.text = value;
    if (node.type === 'creed') node.creed = value;
};

watch(selectedLiturgyId, () => { selectedVariantKey.value = ''; resetEditor(); });
watch(selectedVariantKey, resetEditor);
watch([selectedDate, selectedOrganizationId, selectedLiturgyId], () => { void refreshDay(); }, { immediate: true });
watch([editorNodes, effectiveSlots, sermonSeries, liturgicalDay], buildPreview, { deep: true });

resetEditor();
onMounted(() => {
    buildPreview();
    void props.inspectAgenda(props.event).then((drift) => { if (drift) emit('drift', drift); }).catch((cause: unknown) => {
        saveError.value = cause instanceof Error ? cause.message : 'Der native Ablauf konnte nicht geladen werden.';
    });
});

defineExpose({ saveWithForce: () => save(true) });
</script>

<template>
    <div class="liturgy-workbench">
        <header class="editor-header">
            <div class="editor-header__top">
                <button type="button" class="back-button" @click="emit('back')"><Icon icon="fas fa-arrow-left" size="S" /><span>Gottesdienste</span></button>
                <div class="editor-title">
                    <span class="status-dot"></span>
                    <div><h2>{{ event.name }}</h2><p>{{ new Date(event.startDate).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }) }}</p></div>
                </div>
                <div class="editor-actions"><Button v-if="selectedLiturgy?.print" label="PDF" icon="fas fa-file-pdf" :outlined="true" size="S" :disabled="!preview" @click="exportPdf" /><Button label="Vorschau" icon="fas fa-eye" :outlined="true" size="S" @click="buildPreview" /><Button label="In ChurchTools speichern" icon="fas fa-check" size="S" :loading="saving" @click="save" /></div>
            </div>

            <div class="editor-setup">
                <div class="setup-field setup-field--date"><Input v-model="selectedDate" label="Datum" type="date" /></div>
                <div class="setup-field"><SelectDropdown v-model="selectedLiturgyId" label="Vorlage" :options="liturgies.map((item) => ({ id: item.id, name: item.name }))" :emit-id="true" :clear="false" /></div>
                <div class="setup-field"><Input v-model="sermonSeries" label="Predigtreihe" placeholder="z. B. III" /></div>
                <div v-if="liturgicalDay || suggestionLoading" class="church-year-summary">
                    <Icon :icon="suggestionLoading ? 'fas fa-spinner fa-spin' : 'fas fa-calendar-star'" size="S" />
                    <span>{{ suggestionLoading ? 'Kirchenjahr wird geladen …' : liturgicalDay?.name }}</span>
                    <i v-if="liturgicalDay?.color" class="liturgical-swatch" :style="{ backgroundColor: liturgicalColor(liturgicalDay.color) }" :title="`Liturgische Farbe: ${liturgicalDay.color}`"></i>
                </div>
            </div>

            <div v-if="variants.length > 0" class="variant-tabs" aria-label="Gottesdienstform">
                <span>Gottesdienstform</span>
                <button v-for="variant in variants" :key="variant.key" type="button" :class="{ active: selectedVariantKey === variant.key }" @click="selectedVariantKey = variant.key">{{ variant.label }}</button>
            </div>
        </header>

        <div v-if="saveError" class="editor-alert" role="alert"><Icon icon="fas fa-triangle-exclamation" size="S" /><span>{{ saveError }}</span></div>

        <div class="editor-grid">
            <aside class="block-library" aria-label="Liturgiebausteine">
                <div class="panel-heading"><div><h3>Bausteine</h3><p>In den Ablauf ziehen</p></div><Icon icon="fas fa-shapes" size="S" /></div>
                <div class="palette-list">
                    <button v-for="item in palette" :key="item.kind" type="button" class="palette-item" draggable="true" @dragstart="startPaletteDrag(item.kind, $event)" @dragend="endDrag" @click="addNode(item.kind)">
                        <span :class="['type-icon', `type-icon--${item.tone}`]"><Icon :icon="item.icon" size="S" /></span>
                        <span><strong>{{ item.label }}</strong><small>{{ item.hint }}</small></span>
                        <Icon class="palette-item__plus" icon="fas fa-plus" size="S" />
                    </button>
                </div>
                <div class="drag-hint"><Icon icon="fas fa-hand-pointer" size="S" /><span>Bausteine können per Drag-and-drop oder Klick hinzugefügt werden.</span></div>
            </aside>

            <main class="service-canvas" aria-label="Gottesdienstablauf">
                <div class="canvas-heading">
                    <div><p>Ablauf</p><h3>{{ selectedLiturgy?.name ?? 'Neue Liturgie' }}</h3></div>
                    <span>{{ editorNodes.length }} Bausteine</span>
                </div>

                <div v-if="editorNodes.length === 0" class="empty-canvas" @dragover.prevent="activeDropIndex = 0" @drop.prevent="dropAt(0)">
                    <span class="empty-canvas__icon"><Icon icon="fas fa-layer-plus" size="L" /></span>
                    <strong>Der Ablauf ist noch leer</strong>
                    <p>Ziehe einen Baustein aus der linken Spalte hierher.</p>
                </div>

                <div v-else class="canvas-list">
                    <template v-for="(node, index) in editorNodes" :key="node.id">
                        <div :class="['drop-zone', { 'drop-zone--active': activeDropIndex === index }]" @dragenter.prevent="activeDropIndex = index" @dragover.prevent @drop.prevent="dropAt(index)"><span>Hier einfügen</span></div>
                        <article class="liturgy-block">
                            <div class="block-handle" draggable="true" title="Baustein verschieben" @dragstart="startCanvasDrag(index, $event)" @dragend="endDrag"><Icon icon="fas fa-grip-vertical" size="S" /><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
                            <div :class="['type-icon', `type-icon--${nodeTone(node.type)}`]"><Icon :icon="nodeIcon(node.type)" size="S" /></div>
                            <div class="block-content">
                                <div class="block-title-row"><div><small>{{ nodeKindLabel(node.type) }}</small><h4>{{ nodeTitle(node) }}</h4></div><div class="block-buttons"><button type="button" :disabled="index === 0" title="Nach oben" @click="moveNode(index, -1)"><Icon icon="fas fa-arrow-up" size="S" /></button><button type="button" :disabled="index === editorNodes.length - 1" title="Nach unten" @click="moveNode(index, 1)"><Icon icon="fas fa-arrow-down" size="S" /></button><button type="button" title="Entfernen" class="delete-button" @click="removeNode(index)"><Icon icon="fas fa-trash-can" size="S" /></button></div></div>

                                <input v-if="node.type === 'heading'" v-model="node.text" class="editor-input editor-input--title" aria-label="Überschrift" />
                                <SongPicker v-else-if="node.type === 'songSlot'" :label="node.label ?? 'Lied'" :required="node.required" :songs="songs" :search-songs="searchSongs" :model-value="songSlots[node.slot]" @update:model-value="songSlots[node.slot] = $event" />
                                <div v-else-if="node.type === 'readingSlot'" class="reading-fields"><select v-model="node.slot" class="editor-input" aria-label="Lesungstyp"><option value="oldTestament">Altes Testament</option><option value="psalm">Psalm</option><option value="epistle">Epistel</option><option value="gospel">Evangelium</option></select><div class="slot-field"><input v-model="textSlots[node.slot]" class="editor-input" :placeholder="readingHint(node.slot)" /><small>Vorschlag: {{ readingHint(node.slot) }}</small></div></div>
                                <div v-else-if="node.type === 'sermonSlot'" class="sermon-fields"><input v-model="sermonTitles[node.slot ?? 'sermon']" class="editor-input" placeholder="Predigttitel" /><input v-model="sermonTexts[node.slot ?? 'sermon']" class="editor-input" :placeholder="readingHint(node.slot ?? 'sermon')" /></div>
                                <textarea v-else-if="node.type === 'freeTextSlot'" v-model="textSlots[node.slot]" class="editor-textarea" :placeholder="`Text für „${node.label ?? 'Freier Text'}“`"></textarea>
                                <div v-else-if="node.type === 'fixedText' || node.type === 'rubric' || node.type === 'prayer' || node.type === 'creed'" class="fixed-text-preview"><p>{{ editableText(node) || 'Noch kein Text hinterlegt' }}</p><details><summary>Text bearbeiten</summary><div class="details-fields"><input :value="node.label ?? ''" class="editor-input" placeholder="Bezeichnung" @input="updateLabel(node, eventValue($event))" /><textarea :value="editableText(node)" class="editor-textarea" placeholder="Text" @input="updateEditableText(node, eventValue($event))"></textarea></div></details></div>
                            </div>
                        </article>
                    </template>
                    <div :class="['drop-zone', 'drop-zone--last', { 'drop-zone--active': activeDropIndex === editorNodes.length }]" @dragenter.prevent="activeDropIndex = editorNodes.length" @dragover.prevent @drop.prevent="dropAt(editorNodes.length)"><span>Am Ende einfügen</span></div>
                </div>
            </main>

            <aside class="agenda-preview" aria-label="ChurchTools-Vorschau">
                <div class="panel-heading"><div><h3>Vorschau</h3><p>ChurchTools-Ablauf</p></div><span class="preview-status"><i></i> Live</span></div>
                <div v-if="preview" class="preview-list">
                    <div v-for="(item, index) in preview.items" :key="item.nodeId" :class="['preview-item', { 'preview-item--heading': item.type === 'header' }]">
                        <span>{{ index + 1 }}</span><Icon :icon="item.type === 'song' ? 'fas fa-music' : item.type === 'header' ? 'fas fa-heading' : 'fas fa-align-left'" size="S" /><div><strong>{{ item.title }}</strong><small v-if="item.note">{{ item.note }}</small></div>
                    </div>
                </div>
                <div v-else class="preview-empty"><Icon icon="fas fa-wand-magic-sparkles" size="L" /><p>Fülle die Pflichtfelder aus, um den nativen Ablauf zu sehen.</p></div>
                <div class="preview-footer"><span><strong>{{ preview?.items.length ?? 0 }}</strong> Ablaufpunkte</span><Button label="Speichern" icon="fas fa-check" size="S" :loading="saving" @click="save" /></div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.liturgy-workbench { --editor-blue: #2374d8; --editor-border: #dfe5ec; --editor-muted: #647386; margin: -1rem; color: #243142; }
.editor-header { position: relative; z-index: 2; border: 1px solid var(--editor-border); border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgb(31 45 61 / 5%); }
.editor-header__top { display: grid; grid-template-columns: 170px minmax(0, 1fr) auto; align-items: center; gap: 24px; padding: 18px 22px; }
.back-button { display: inline-flex; width: fit-content; align-items: center; gap: 9px; color: #4f6073; font-size: 13px; font-weight: 650; }
.back-button:hover { color: var(--editor-blue); }
.editor-title { display: flex; min-width: 0; align-items: center; gap: 12px; }
.status-dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: #31a36b; box-shadow: 0 0 0 4px #e5f6ed; }
.editor-title h2 { overflow: hidden; margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -.02em; text-overflow: ellipsis; white-space: nowrap; }
.editor-title p { margin: 3px 0 0; color: var(--editor-muted); font-size: 12px; }
.editor-actions { display: flex; gap: 9px; }
.editor-setup { display: grid; grid-template-columns: 180px minmax(260px, 1fr) 150px minmax(220px, .8fr); align-items: end; gap: 14px; padding: 16px 22px 18px; border-top: 1px solid #edf0f4; background: #fafbfd; }
.church-year-summary { display: flex; min-height: 40px; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #dbe4ed; border-radius: 7px; background: #fff; color: #48596c; font-size: 12px; font-weight: 600; }
.liturgical-swatch { width: 10px; height: 10px; margin-left: auto; border: 1px solid #b6c0ca; border-radius: 50%; background: #7c3aed; }
.variant-tabs { display: flex; align-items: center; gap: 5px; padding: 0 22px 15px; background: #fafbfd; color: var(--editor-muted); font-size: 11px; }
.variant-tabs > span { margin-right: 8px; font-weight: 700; }
.variant-tabs button { padding: 6px 11px; border: 1px solid #dce3ea; border-radius: 6px; background: #fff; color: #536477; font-weight: 650; }
.variant-tabs button.active { border-color: #9bc3f1; background: #eaf3fe; color: #1766c0; }
.editor-alert { display: flex; align-items: center; gap: 9px; margin: 12px 0; padding: 11px 14px; border: 1px solid #efc2c2; border-radius: 8px; background: #fff5f5; color: #a23434; font-size: 12px; }
.editor-grid { display: grid; grid-template-columns: 215px minmax(440px, 1fr) 285px; gap: 14px; margin-top: 14px; align-items: start; }
.block-library, .agenda-preview { position: sticky; top: 18px; overflow: hidden; border: 1px solid var(--editor-border); border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgb(31 45 61 / 4%); }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px; border-bottom: 1px solid #edf0f4; }
.panel-heading h3 { margin: 0; font-size: 14px; font-weight: 750; }
.panel-heading p { margin: 3px 0 0; color: var(--editor-muted); font-size: 11px; }
.palette-list { display: grid; gap: 4px; padding: 8px; }
.palette-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 9px; width: 100%; padding: 9px 8px; border: 1px solid transparent; border-radius: 7px; text-align: left; cursor: grab; }
.palette-item:hover { border-color: #d6e5f6; background: #f5f9fe; }
.palette-item:active { cursor: grabbing; }
.palette-item strong, .palette-item small { display: block; }
.palette-item strong { color: #334255; font-size: 12px; font-weight: 700; }
.palette-item small { overflow: hidden; margin-top: 2px; color: #7a8795; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.palette-item__plus { color: #9ba7b4; }
.type-icon { display: inline-grid; width: 34px; height: 34px; flex: none; place-items: center; border-radius: 7px; }
.type-icon--blue { background: #e8f2fe; color: #2374d8; }.type-icon--violet { background: #f1eafe; color: #7652c8; }.type-icon--green { background: #e8f7ef; color: #21825a; }.type-icon--orange { background: #fff1df; color: #bb6b16; }.type-icon--rose { background: #fcecef; color: #bd5369; }.type-icon--slate { background: #eef1f5; color: #647386; }
.drag-hint { display: flex; gap: 8px; padding: 13px 15px; border-top: 1px solid #edf0f4; background: #fafbfd; color: #7a8795; font-size: 10px; line-height: 1.45; }
.service-canvas { min-height: 620px; padding: 18px; border: 1px solid var(--editor-border); border-radius: 10px; background-color: #f3f6f9; background-image: radial-gradient(#d5dce5 0.7px, transparent 0.7px); background-size: 16px 16px; }
.canvas-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; padding: 0 3px; }
.canvas-heading p { margin: 0 0 3px; color: var(--editor-blue); font-size: 10px; font-weight: 750; }
.canvas-heading h3 { margin: 0; font-size: 16px; font-weight: 730; }
.canvas-heading > span { padding: 5px 9px; border-radius: 12px; background: #e6ebf0; color: #647386; font-size: 10px; font-weight: 700; }
.canvas-list { display: grid; gap: 0; }
.drop-zone { display: grid; height: 9px; place-items: center; transition: height .14s ease; }
.drop-zone span { display: none; color: var(--editor-blue); font-size: 10px; font-weight: 700; }
.drop-zone--active { height: 34px; margin: 2px 0; border: 1px dashed #70a9e6; border-radius: 7px; background: #e9f3ff; }
.drop-zone--active span { display: block; }
.drop-zone--last { height: 24px; }
.liturgy-block { display: grid; grid-template-columns: 28px 34px minmax(0, 1fr); gap: 11px; padding: 13px; border: 1px solid #dce3ea; border-radius: 9px; background: #fff; box-shadow: 0 1px 2px rgb(31 45 61 / 4%); }
.liturgy-block:hover { border-color: #b9c9da; box-shadow: 0 3px 9px rgb(45 61 78 / 7%); }
.block-handle { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 5px; color: #a4aeba; cursor: grab; }
.block-handle span { font-size: 9px; font-weight: 750; font-variant-numeric: tabular-nums; }
.block-content { min-width: 0; }
.block-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.block-title-row small { display: block; margin-bottom: 2px; color: #7b8795; font-size: 9px; font-weight: 700; }
.block-title-row h4 { margin: 0; color: #2c3b4e; font-size: 13px; font-weight: 750; }
.block-buttons { display: flex; gap: 2px; opacity: .35; transition: opacity .12s; }
.liturgy-block:hover .block-buttons, .block-buttons:focus-within { opacity: 1; }
.block-buttons button { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 5px; color: #637286; }
.block-buttons button:hover { background: #edf2f7; color: #25364b; }.block-buttons button:disabled { opacity: .25; }.block-buttons .delete-button:hover { background: #fff0f0; color: #c44444; }
.editor-input, .editor-textarea { width: 100%; border: 1px solid #d7dfe7; border-radius: 6px; background: #fff; color: #2e3d50; font-size: 12px; outline: none; }
.editor-input { height: 37px; padding: 0 10px; }.editor-input--title { font-weight: 650; }.editor-textarea { min-height: 72px; padding: 9px 10px; line-height: 1.45; resize: vertical; }
.editor-input:focus, .editor-textarea:focus { border-color: #5b9de3; box-shadow: 0 0 0 3px rgb(35 116 216 / 10%); }
.slot-field small { display: block; margin-top: 5px; color: #778697; font-size: 10px; }.sermon-fields, .reading-fields { display: grid; grid-template-columns: .8fr 1.2fr; gap: 8px; }
.fixed-text-preview > p { display: -webkit-box; overflow: hidden; margin: 0; color: #697789; font-size: 11px; line-height: 1.5; white-space: pre-line; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.fixed-text-preview details { margin-top: 8px; }.fixed-text-preview summary { color: #3477c2; font-size: 10px; font-weight: 700; cursor: pointer; }.details-fields { display: grid; gap: 7px; margin-top: 8px; }
.empty-canvas { display: grid; min-height: 450px; place-items: center; align-content: center; border: 1px dashed #b7c5d4; border-radius: 9px; background: rgb(255 255 255 / 58%); text-align: center; }
.empty-canvas__icon { display: grid; width: 56px; height: 56px; margin-bottom: 12px; place-items: center; border-radius: 14px; background: #e7f1fd; color: var(--editor-blue); }.empty-canvas strong { font-size: 14px; }.empty-canvas p { margin: 6px 0 0; color: #738194; font-size: 11px; }
.preview-status { display: inline-flex; align-items: center; gap: 5px; color: #5c6c7e; font-size: 9px; font-weight: 700; }.preview-status i { width: 6px; height: 6px; border-radius: 50%; background: #35a36d; }
.preview-list { max-height: 620px; overflow: auto; padding: 7px 12px; }
.preview-item { display: grid; grid-template-columns: 18px 18px minmax(0, 1fr); gap: 6px; align-items: start; padding: 9px 3px; border-bottom: 1px solid #edf0f4; color: #8793a1; }
.preview-item > span { padding-top: 1px; font-size: 9px; font-variant-numeric: tabular-nums; }.preview-item strong, .preview-item small { display: block; }.preview-item strong { color: #405064; font-size: 11px; line-height: 1.35; }.preview-item small { overflow: hidden; margin-top: 2px; color: #7b8796; font-size: 9px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }.preview-item--heading { margin-top: 4px; color: var(--editor-blue); }.preview-item--heading strong { color: #2169bb; }
.preview-empty { display: grid; min-height: 260px; place-items: center; align-content: center; padding: 24px; color: #90a0b0; text-align: center; }.preview-empty p { max-width: 180px; margin: 10px 0 0; font-size: 11px; line-height: 1.5; }
.preview-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-top: 1px solid #edf0f4; background: #fafbfd; color: #718092; font-size: 10px; }.preview-footer strong { color: #334255; }
@media (max-width: 1180px) { .editor-grid { grid-template-columns: 190px minmax(430px, 1fr); }.agenda-preview { position: static; grid-column: 1 / -1; }.preview-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: 360px; gap: 0 16px; }.editor-setup { grid-template-columns: 170px minmax(220px, 1fr) 140px; }.church-year-summary { grid-column: 1 / -1; } }
@media (max-width: 800px) { .liturgy-workbench { margin: 0; }.editor-header__top { grid-template-columns: 1fr auto; }.back-button { grid-column: 1 / -1; }.editor-title { min-width: 0; }.editor-actions > :first-child { display: none; }.editor-setup { grid-template-columns: 1fr 1fr; }.setup-field { min-width: 0; }.editor-grid { grid-template-columns: 1fr; }.block-library, .agenda-preview { position: static; }.palette-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.drag-hint { display: none; }.service-canvas { min-height: 480px; }.preview-list { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .editor-header__top { padding: 15px; }.editor-title p { white-space: normal; }.editor-actions { grid-column: 1 / -1; }.editor-actions > * { flex: 1; }.editor-setup { grid-template-columns: 1fr; padding: 14px 15px; }.variant-tabs { overflow-x: auto; padding: 0 15px 13px; }.variant-tabs > span { display: none; }.palette-list { grid-template-columns: 1fr; }.service-canvas { padding: 12px 8px; }.liturgy-block { grid-template-columns: 20px 30px minmax(0, 1fr); gap: 7px; padding: 10px 8px; }.type-icon { width: 30px; height: 30px; }.sermon-fields, .reading-fields { grid-template-columns: 1fr; }.block-buttons { opacity: 1; }.block-buttons button:first-child, .block-buttons button:nth-child(2) { display: none; } }
@media (prefers-reduced-motion: reduce) { .drop-zone, .block-buttons { transition: none; } }
</style>
