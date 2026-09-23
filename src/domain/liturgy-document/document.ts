import type { AgendaSlotValue, NormalizedAgenda, SermonSlotValue, SongSlotValue } from '../agenda-generation';
import type { LiturgyDefinition, LiturgyNode } from '../../data/liturgies';

export interface PrintableEventService {
    name?: string | null;
    serviceName?: string;
    person?: {
        domainAttributes?: {
            firstName?: string;
            lastName?: string;
        };
    } | null;
}

export interface PrintableLiturgyEvent {
    name: string;
    startDate: string;
    eventServices?: PrintableEventService[];
}

export interface LiturgyDocumentInput {
    event: PrintableLiturgyEvent;
    template: LiturgyDefinition;
    agenda: NormalizedAgenda;
    slots: Readonly<Record<string, AgendaSlotValue | undefined>>;
    optionalSections: Readonly<Record<string, boolean>>;
}

const escapeHtml = (value: unknown): string => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const isSong = (value: AgendaSlotValue | undefined): value is SongSlotValue =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'song';

const isSermon = (value: AgendaSlotValue | undefined): value is SermonSlotValue =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'sermon';

const activeNodes = (
    nodes: LiturgyNode[],
    optionalSections: Readonly<Record<string, boolean>>,
    result: LiturgyNode[] = [],
): LiturgyNode[] => {
    nodes.forEach((node) => {
        if (node.type === 'optionalSection') {
            if (optionalSections[node.sectionKey]) activeNodes(node.nodes, optionalSections, result);
            return;
        }
        result.push(node);
        if (node.type === 'communionSection') activeNodes(node.nodes, optionalSections, result);
    });
    return result;
};

const selectedForm = (input: LiturgyDocumentInput): string => {
    const section = input.template.nodes.find((node) =>
        node.type === 'optionalSection' && input.optionalSections[node.sectionKey]
    );
    return section?.label ?? input.template.serviceType ?? input.event.name;
};

const songText = (song: SongSlotValue): string => {
    const source = [song.sourceName, song.number].filter(Boolean).join(' ');
    const main = [source, song.title].filter(Boolean).join(' ');
    return [main, song.comment].filter(Boolean).join(' · ');
};

const sermonText = (sermon: SermonSlotValue): string => {
    const title = sermon.title?.trim() ? `„${sermon.title.trim()}“` : '';
    const text = sermon.text.trim() ? `(${sermon.text.trim()})` : '';
    return [title, text].filter(Boolean).join(' ');
};

const valueForNode = (node: LiturgyNode, slots: LiturgyDocumentInput['slots']): string => {
    if (node.type === 'songSlot') {
        const value = slots[node.slot];
        return isSong(value) ? songText(value) : '';
    }
    if (node.type === 'sermonSlot') {
        const value = slots[node.slot ?? 'sermon'];
        return isSermon(value) ? sermonText(value) : typeof value === 'string' ? value : '';
    }
    if (node.type === 'readingSlot' || node.type === 'freeTextSlot') {
        const value = slots[node.slot];
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value !== null && 'reference' in value) return String(value.reference);
    }
    return '';
};

const personName = (service: PrintableEventService): string => {
    const firstName = service.person?.domainAttributes?.firstName?.trim();
    const lastName = service.person?.domainAttributes?.lastName?.trim();
    return [firstName, lastName].filter(Boolean).join(' ');
};

const serviceName = (service: PrintableEventService): string => service.serviceName?.trim() || service.name?.trim() || 'Dienst';

const summaryHtml = (nodes: LiturgyNode[], slots: LiturgyDocumentInput['slots']): string => nodes
    .filter((node) => node.print?.summaryLabel)
    .map((node) => `<dt>${escapeHtml(node.print?.summaryLabel)}</dt><dd>${escapeHtml(valueForNode(node, slots))}</dd>`)
    .join('');

const servicesHtml = (services: PrintableEventService[] = []): string => services
    .filter((service) => personName(service))
    .map((service) => `<div class="service"><strong>${escapeHtml(serviceName(service))}:</strong><br>${escapeHtml(personName(service))}</div>`)
    .join('');

const resolvedResponsibleFirstName = (responsible: string | undefined, services: PrintableEventService[] = []): string | undefined => {
    const role = responsible?.match(/^\[(.+)]$/)?.[1];
    if (!role) return undefined;
    const service = services.find((candidate) => serviceName(candidate).toLocaleLowerCase('de-DE') === role.toLocaleLowerCase('de-DE'));
    return service?.person?.domainAttributes?.firstName?.trim() || undefined;
};

const preacherName = (services: PrintableEventService[] = []): string | undefined => {
    const service = services.find((candidate) => serviceName(candidate).toLocaleLowerCase('de-DE') === 'predigt');
    return service ? personName(service) || undefined : undefined;
};

const itemHtml = (
    node: LiturgyNode,
    item: NormalizedAgenda['items'][number],
    slots: LiturgyDocumentInput['slots'],
    services: PrintableEventService[],
): string => {
    const participant = node.print?.audience === 'congregation' ? ' participant' : '';
    const alignment = node.print?.alignment ? ` align-${node.print.alignment}` : '';
    const continuation = node.print?.continuation === true;
    const columnBreak = node.print?.columnBreakBefore === true ? ' column-break-before' : '';
    let title = item.type === 'header' ? item.title : node.label ?? item.title;
    let body = item.note ?? '';

    if (node.type === 'songSlot') {
        body = valueForNode(node, slots);
    } else if (node.type === 'sermonSlot') {
        title = node.label ?? 'Predigt';
        body = valueForNode(node, slots);
    } else if (node.type === 'freeTextSlot') {
        body = valueForNode(node, slots);
    } else if (node.type === 'fixedText' || node.type === 'rubric') {
        title = node.label ?? '';
        body = node.text;
    } else if (node.type === 'creed') {
        title = node.label ?? 'Glaubensbekenntnis';
        body = node.creed ?? '';
    } else if (node.type === 'prayer') {
        title = node.label ?? 'Gebet';
        body = node.text ?? '';
    }

    if (node.id.endsWith('-command')) {
        const firstName = resolvedResponsibleFirstName(node.responsible, services);
        if (firstName) title = `${title} (${firstName})`;
    }

    return `<section class="item${participant}${alignment}${continuation ? ' continuation' : ''}${columnBreak}">
        ${continuation || !title ? '' : `<div class="item-title">${escapeHtml(title)}</div>`}
        ${body ? `<div class="item-body">${escapeHtml(body)}</div>` : ''}
    </section>`;
};

const formatDate = (startDate: string): string => new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
}).format(new Date(startDate));

export const buildLiturgyDocumentHtml = (input: LiturgyDocumentInput): string => {
    if (!input.template.print) throw new Error(`Liturgie "${input.template.name}" besitzt keine Druckkonfiguration.`);
    const nodes = activeNodes(input.template.nodes, input.optionalSections);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const sermon = input.slots.sermon;
    const sermonHeading = isSermon(sermon) ? sermonText(sermon) : typeof sermon === 'string' ? sermon : '';
    const body = input.agenda.items
        .map((item) => {
            const node = nodesById.get(item.nodeId);
            return node ? itemHtml(node, item, input.slots, input.event.eventServices ?? []) : '';
        })
        .join('');
    const form = selectedForm(input);
    const author = form === 'Taufen' ? preacherName(input.event.eventServices) : undefined;
    const title = `Liturgie_${formatDate(input.event.startDate).split('.').reverse().join('.')}_${form}_Ablauf`;
    const participantColor = input.template.print.participantColor ?? '#0066cc';

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html { background: #ececec; }
    body { margin: 0; color: #000; background: #fff; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.34; }
    .source { display: none; }
    .page { position: relative; width: 297mm; height: 210mm; padding: 15mm 20mm 14mm; overflow: hidden; background: #fff; break-after: page; }
    .page:last-child { break-after: auto; }
    .page-content { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13mm; height: 181mm; }
    .column { min-width: 0; height: 181mm; overflow: hidden; }
    .cover { height: 181mm; }
    .service-author { margin: 0 0 8mm; font-size: 9.5pt; }
    .service-author:empty { display: none; }
    .cover h1, .cover h2, .cover h3 { margin: 0; text-align: center; }
    .cover h1 { font-size: 15pt; font-style: italic; font-weight: 700; }
    .cover h2 { margin-top: 2mm; font-size: 15pt; font-style: italic; }
    .cover h3 { margin-top: 2mm; font-size: 15pt; }
    .summary { display: grid; grid-template-columns: 47mm 1fr; margin: 3mm 0 0; padding: 1mm 0 4mm; border-top: .4pt solid #333; border-bottom: .4pt solid #333; }
    .summary dt, .summary dd { margin: 0; padding: .7mm 0; }
    .services { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3mm 5mm; margin-top: 11mm; color: ${participantColor}; font-size: 8.5pt; line-height: 1.2; }
    .participant-notice { margin-top: 12mm; color: ${participantColor}; font-size: 9pt; font-weight: 700; }
    .item { margin: 0 0 8mm; break-inside: auto; }
    .item.split-continuation { margin-top: 0; }
    .item-title { margin-bottom: 2mm; font-variant: small-caps; text-transform: uppercase; break-after: avoid; }
    .item-body { white-space: pre-line; }
    .item-body.paginated { white-space: normal; }
    .print-line { display: block; min-height: 1.34em; }
    .item.continuation { margin-top: -5mm; }
    .item.participant { color: ${participantColor}; }
    .item.participant .item-title { font-weight: 700; }
    .align-center { text-align: center; font-style: italic; }
    .align-indent .item-body { margin-left: 13mm; font-style: italic; }
    .page-number { position: absolute; bottom: 6mm; left: 20mm; font-size: 8pt; }
    @media screen {
        body { padding: 12mm 0; background: #ececec; }
        .page { margin: 0 auto 12mm; box-shadow: 0 3mm 12mm rgba(0,0,0,.18); }
    }
    @media print {
        html { background: #fff; }
        body { background: #fff; }
    }
</style>
</head>
<body>
<div class="source">
    <section class="cover">
        <p class="service-author">${author ? `${escapeHtml(author)}, Pfarrer` : ''}</p>
        <h1>Gottesdienst ${escapeHtml(formatDate(input.event.startDate))}</h1>
        <h2>${escapeHtml(input.template.print.congregationName)}</h2>
        <h2>${escapeHtml(form)}</h2>
        <h3>${escapeHtml(sermonHeading)}</h3>
        <dl class="summary">${summaryHtml(nodes, input.slots)}</dl>
        <div class="services">${servicesHtml(input.event.eventServices)}</div>
        <p class="participant-notice">${escapeHtml(input.template.print.participantNotice ?? '')}</p>
    </section>
    ${body}
</div>
<main class="pages"></main>
<script>
(() => {
    const source = document.querySelector('.source');
    const pages = document.querySelector('.pages');
    const cover = source.querySelector('.cover');
    const items = [...source.querySelectorAll('.item')];
    let pageNumber = 0;
    let currentPage;
    let currentContent;
    let currentColumn;

    const addPage = () => {
        currentPage = document.createElement('section');
        currentPage.className = 'page';
        currentContent = document.createElement('div');
        currentContent.className = 'page-content';
        currentPage.append(currentContent);
        const number = document.createElement('span');
        number.className = 'page-number';
        number.textContent = String(++pageNumber);
        currentPage.append(number);
        pages.append(currentPage);
    };

    const addColumn = () => {
        if (!currentContent || currentContent.children.length === 2) addPage();
        currentColumn = document.createElement('div');
        currentColumn.className = 'column';
        currentContent.append(currentColumn);
        return currentColumn;
    };

    const fits = () => currentColumn.scrollHeight <= currentColumn.clientHeight + 1;
    const appendWhole = (item) => {
        currentColumn.append(item);
        if (fits()) return;
        item.remove();
        addColumn().append(item);
    };

    addPage();
    addColumn().append(cover);
    addColumn();

    items.forEach((original) => {
        if (original.classList.contains('column-break-before') && currentColumn.children.length > 0) addColumn();
        const body = original.querySelector('.item-body');
        if (!body) {
            appendWhole(original);
            return;
        }

        const lines = body.textContent
            .replaceAll(String.fromCharCode(13), '')
            .split(String.fromCharCode(10));
        const makeFragment = (continuation) => {
            const fragment = original.cloneNode(true);
            const fragmentBody = fragment.querySelector('.item-body');
            fragmentBody.textContent = '';
            fragmentBody.classList.add('paginated');
            if (continuation) {
                fragment.classList.add('split-continuation');
                fragment.querySelector('.item-title')?.remove();
            }
            currentColumn.append(fragment);
            return { fragment, fragmentBody };
        };

        let fragment = makeFragment(false);
        if (!fits()) {
            fragment.fragment.remove();
            addColumn();
            fragment = makeFragment(false);
        }

        lines.forEach((line) => {
            const lineElement = document.createElement('span');
            lineElement.className = 'print-line';
            lineElement.textContent = line || '\u00a0';
            fragment.fragmentBody.append(lineElement);
            if (fits()) return;
            lineElement.remove();
            if (fragment.fragmentBody.children.length === 0) fragment.fragment.remove();
            addColumn();
            fragment = makeFragment(true);
            fragment.fragmentBody.append(lineElement);
        });
    });

    source.remove();
    document.documentElement.dataset.ready = 'true';
})();
</script>
</body>
</html>`;
};

export const openLiturgyPrintDialog = (input: LiturgyDocumentInput, owner: Window = window): void => {
    const popup = owner.open('', '_blank');
    if (!popup) throw new Error('Das Druckfenster wurde vom Browser blockiert. Bitte Pop-ups für ChurchTools erlauben.');
    popup.document.open();
    popup.document.write(buildLiturgyDocumentHtml(input));
    popup.document.close();
    const printWhenReady = () => {
        if (popup.closed) return;
        if (popup.document.documentElement.dataset.ready === 'true') popup.print();
        else popup.setTimeout(printWhenReady, 50);
    };
    popup.setTimeout(printWhenReady, 50);
};
