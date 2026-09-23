<script setup lang="ts">
import Button from '@churchtools/styleguide-components/form/button/Button.vue';
import Card from '@churchtools/styleguide-components/layout/card/Card.vue';
import EmptyState from '@churchtools/styleguide-components/basic/emptyState/EmptyState.vue';
import Icon from '@churchtools/styleguide-components/content/icon/Icon.vue';
import Input from '@churchtools/styleguide-components/form/input/Input.vue';
import LoadingMessage from '@churchtools/styleguide-components/basic/loading/LoadingMessage.vue';
import { serviceStatusLabels, type WorkspaceEvent, type WorkspaceStatus } from './types';

defineProps<{
    events: WorkspaceEvent[];
    eventFrom: string;
    eventStatus: WorkspaceStatus;
    eventPage: number;
    eventHasNextPage: boolean;
    canWriteAgenda: boolean;
    canUseEditor: boolean;
}>();
const emit = defineEmits<{
    (event: 'setEventFrom', value: string): void;
    (event: 'refresh'): void;
    (event: 'previous'): void;
    (event: 'next'): void;
    (event: 'open', value: WorkspaceEvent): void;
}>();
const formatDate = (date: string) => new Date(date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
</script>

<template>
                    <section  class="space-y-6">
                        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Sonntage und Feiertage</div><h2 class="mt-2 text-2xl font-bold tracking-tight">Gottesdienste</h2><p class="mt-2 text-sm text-slate-500">{{ canWriteAgenda ? 'Wähle einen Gottesdienst aus, um den Ablauf zu bearbeiten.' : 'Lesemodus: Du kannst Abläufe ansehen. Zum Bearbeiten ist ChurchTools-Berechtigung „churchservice / edit agenda“ erforderlich.' }}</p></div><div class="flex flex-wrap items-end gap-3"><Input type="date" :model-value="eventFrom" label="Gottesdienste ab" @update:model-value="emit('setEventFrom', $event)" /><Button label="Aktualisieren" icon="fas fa-rotate-right" :outlined="true" :loading="eventStatus === 'loading'" @click="emit('refresh')" /></div></div>
                        <div v-if="eventStatus === 'loading'"><LoadingMessage message="Gottesdienste werden geladen …" /></div>
                        <div v-else-if="eventStatus === 'error'"><EmptyState title="Gottesdienste konnten nicht geladen werden" icon="fas fa-circle-exclamation"><Button label="Erneut versuchen" icon="fas fa-rotate-right" :outlined="true" @click="emit('refresh')" /></EmptyState></div>
                        <div v-else-if="events.length === 0"><EmptyState title="Keine Gottesdienste ab diesem Datum gefunden" icon="fas fa-calendar-days"><Button label="Gottesdienstliste aktualisieren" icon="fas fa-rotate-right" :outlined="true" @click="emit('refresh')" /></EmptyState></div>
                        <div v-else class="grid gap-4">
                            <Card v-for="event in events" :key="event.id">
                                <template #full>
                                    <div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"><div class="flex shrink-0 flex-col border-b border-slate-200 pb-4 sm:w-24 sm:border-b-0 sm:border-r sm:pb-0"><strong class="text-lg font-bold">{{ formatDate(event.startDate).split(' ')[0] }}</strong><span class="text-sm text-slate-500">{{ formatDate(event.startDate).replace(`${formatDate(event.startDate).split(' ')[0]} `, '') }}</span></div>
                                    <div class="min-w-0 flex-1"><div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">{{ event.calendar?.title ?? 'Gottesdienst' }}</div><h3 class="mt-1 text-lg font-semibold">{{ event.name }}</h3><p class="mt-1 text-sm text-slate-500">{{ new Date(event.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }} Uhr · {{ event.isCanceled ? 'Abgesagt' : 'Geplant' }}</p></div>
                                    <div class="flex flex-col items-stretch gap-3 sm:items-end"><span class="flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><Icon v-if="event.status === 'loading'" icon="fas fa-spinner fa-spin" size="S" />{{ serviceStatusLabels[event.status] }}</span><Button :label="canUseEditor && event.canEditAgenda ? (event.status === 'no-agenda' ? 'Liturgie erstellen' : event.status === 'managed' ? 'Ablauf prüfen' : 'Liturgie bearbeiten') : 'Ablauf ansehen'" icon="fas fa-arrow-right" size="S" :outlined="!canUseEditor || !event.canEditAgenda" @click="emit('open', event)" /></div></div>
                                </template>
                            </Card>
                            <nav class="flex items-center justify-center gap-3 pt-2" aria-label="Seitennavigation für Gottesdienste">
                                <Button label="Zurück" icon="fas fa-arrow-left" size="S" :outlined="true" :disabled="eventPage === 1 || eventStatus === 'loading'" @click="emit('previous')" />
                                <span class="min-w-20 text-center text-sm font-medium text-slate-600">Seite {{ eventPage }}</span>
                                <Button label="Weiter" icon-after="fas fa-arrow-right" size="S" :outlined="true" :disabled="!eventHasNextPage || eventStatus === 'loading'" @click="emit('next')" />
                            </nav>
                        </div>
                    </section>

</template>
