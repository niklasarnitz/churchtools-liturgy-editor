import type { LiturgicalDay, ScriptureReference } from '../../data/lectionaries/types';
import type { CommunionSectionNode, CreedNode, FixedTextNode, FreeTextSlotNode, HeadingNode, LiturgyNode, OptionalSectionNode, PrayerNode, ReadingSlotNode, RubricNode, SermonSlotNode, SongSlotNode } from '../../data/liturgies/types';
import type {
    AgendaGenerationInput,
    AgendaSlotValue,
    NormalizedAgenda,
    NormalizedAgendaItem,
    SermonSlotValue,
    SongSlotValue,
} from './types';

export class AgendaGenerationError extends Error {
    public readonly missingSlots: string[];

    constructor(missingSlots: string[]) {
        super(`Required liturgy slots are missing: ${missingSlots.join(', ')}`);
        this.name = 'AgendaGenerationError';
        this.missingSlots = missingSlots;
    }
}

const isSongValue = (value: AgendaSlotValue | undefined): value is SongSlotValue =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'song';

const isSermonValue = (value: AgendaSlotValue | undefined): value is SermonSlotValue =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'sermon';

const isScriptureReference = (value: AgendaSlotValue | undefined): value is ScriptureReference =>
    typeof value === 'object' && value !== null && 'reference' in value && typeof value.reference === 'string';

const scriptureForSlot = (slot: string, day?: LiturgicalDay): string | undefined => {
    if (!day) return undefined;
    if (slot === 'psalm') return day.weeklyPsalm;
    if (slot !== 'oldTestament' && slot !== 'epistle' && slot !== 'gospel' && slot !== 'sermon') return undefined;
    const reference = day.readings[slot];
    return reference?.reference;
};

const titleFor = (label: string | undefined, fallback: string): string => label?.trim() || fallback;

export const generateNormalizedAgenda = (input: AgendaGenerationInput): NormalizedAgenda => {
    const slots = input.slots ?? {};
    const missingSlots: string[] = [];
    const items: NormalizedAgendaItem[] = [];
    const activeBlocks = new Set(input.template.nodes.filter((node) => node.type === 'serviceBlock').map((node) => node.blockKey));

    const addText = (nodeId: string, title: string, note?: string, responsible?: string) => {
        items.push({
            nodeId,
            position: items.length,
            type: 'text',
            title,
            ...(note?.trim() ? { note: note.trim() } : {}),
            ...(responsible?.trim() ? { responsible: responsible.trim() } : {}),
        });
    };

    const renderSong = (node: SongSlotNode) => {
        const value = slots[node.slot];
        if (!isSongValue(value)) {
            if (node.required) missingSlots.push(node.slot);
            return;
        }
        const songNotes = [
            value.comment?.trim(),
            value.arrangementName?.trim() ? `Arrangement: ${value.arrangementName.trim()}` : undefined,
            value.stanzas?.length && !/^Strophen\s/i.test(value.arrangementName?.trim() ?? '')
                ? `Strophen ${value.stanzas.join(', ')}`
                : undefined,
        ].filter((part): part is string => Boolean(part));
        items.push({
            nodeId: node.id,
            position: items.length,
            type: 'song',
            title: titleFor(node.label, value.title ?? 'Lied'),
            ...(songNotes.length ? { note: [...new Set(songNotes)].join(' · ') } : {}),
            ...(node.responsible?.trim() ? { responsible: node.responsible.trim() } : {}),
            songId: value.songId,
            arrangementId: value.arrangementId,
        });
    };

    const renderReading = (node: ReadingSlotNode) => {
        const value = slots[node.slot];
        const reference = isScriptureReference(value) ? value.reference : typeof value === 'string' ? value : undefined;
        const resolved = reference ?? scriptureForSlot(node.lectionarySlot ?? node.slot, input.liturgicalDay);
        if (!resolved) {
            if (node.required) missingSlots.push(node.slot);
            return;
        }
        addText(node.id, titleFor(node.label, node.slot === 'psalm' ? 'Psalm' : 'Lesung'), resolved, node.responsible);
    };

    const renderSermon = (node: SermonSlotNode) => {
        const value = slots[node.slot ?? 'sermon'];
        const reference = isSermonValue(value)
            ? value.text.trim() || undefined
            : isScriptureReference(value)
              ? value.reference
              : typeof value === 'string'
                ? value
                : undefined;
        const resolved = reference ?? input.liturgicalDay?.readings.sermon?.reference;
        if (!resolved) {
            if (node.required) missingSlots.push(node.slot ?? 'sermon');
            return;
        }
        addText(node.id, isSermonValue(value) && value.title?.trim() ? value.title.trim() : titleFor(node.label, 'Predigt'), resolved, node.responsible);
    };

    const renderFreeText = (node: FreeTextSlotNode) => {
        const value = slots[node.slot];
        if (typeof value !== 'string' || !value.trim()) {
            if (node.required) missingSlots.push(node.slot);
            return;
        }
        addText(node.id, titleFor(node.label, node.slot), value.trim(), node.responsible);
    };

    const renderNode = (node: LiturgyNode): void => {
        if (node.showWhen && activeBlocks.has(node.showWhen.blockKey) !== node.showWhen.present) return;
        switch (node.type) {
            case 'heading':
                addHeading(node);
                return;
            case 'fixedText':
                addFixedText(node);
                return;
            case 'rubric':
                addRubric(node);
                return;
            case 'songSlot':
                renderSong(node);
                return;
            case 'readingSlot':
                renderReading(node);
                return;
            case 'sermonSlot':
                renderSermon(node);
                return;
            case 'creed':
                addCreed(node);
                return;
            case 'prayer':
                addPrayer(node);
                return;
            case 'optionalSection':
                renderOptionalSection(node);
                return;
            case 'freeTextSlot':
                renderFreeText(node);
                return;
            case 'communionSection':
                renderCommunionSection(node);
                return;
            case 'serviceBlock':
                node.nodes.forEach(renderNode);
                return;
        }
    };

    const addHeading = (node: HeadingNode) => items.push({ nodeId: node.id, position: items.length, type: 'header', title: node.text });
    const addFixedText = (node: FixedTextNode) => addText(node.id, titleFor(node.label, node.text), node.label ? node.text : undefined, node.responsible);
    const addRubric = (node: RubricNode) => addText(node.id, titleFor(node.label, node.text), node.label ? node.text : undefined, node.responsible);
    const addCreed = (node: CreedNode) => addText(node.id, titleFor(node.label, node.creed ?? 'Glaubensbekenntnis'), node.label ? node.creed : undefined, node.responsible);
    const addPrayer = (node: PrayerNode) => addText(node.id, titleFor(node.label, node.text ?? 'Gebet'), node.label ? node.text : undefined, node.responsible);
    const renderOptionalSection = (node: OptionalSectionNode) => {
        if (input.optionalSections?.[node.sectionKey] !== true) return;
        node.nodes.forEach(renderNode);
    };
    const renderCommunionSection = (node: CommunionSectionNode) => node.nodes.forEach(renderNode);

    input.template.nodes.forEach(renderNode);
    if (missingSlots.length > 0) throw new AgendaGenerationError([...new Set(missingSlots)]);

    return {
        eventStartPosition: input.eventStartPosition ?? 0,
        ...(input.series ? { series: input.series } : {}),
        items,
    };
};
