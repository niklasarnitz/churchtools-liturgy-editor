<script setup lang="ts">
import Card from '@churchtools/styleguide-components/layout/card/Card.vue';
import Icon from '@churchtools/styleguide-components/content/icon/Icon.vue';
import type { OrganizationDefinition } from '../data/organizations/types';

const props = defineProps<{
    selectedOrganization?: OrganizationDefinition;
    availableHymnalsCount: number;
    availableLiturgiesCount?: number;
    availableLectionariesCount?: number;
    isOnline?: boolean;
    apiConfigured?: boolean;
    connectionChecking?: boolean;
}>();
</script>

<template>
        <!-- 3. System & Diagnostics Section -->
        <div class="grid gap-5 xl:grid-cols-2">
            <Card>
                <template #titleFull>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Verbindung</div>
                            <h3 class="mt-1 text-lg font-semibold">ChurchTools</h3>
                        </div>
                        <Icon icon="fas fa-plug" size="L" class="text-slate-500" />
                    </div>
                </template>
                <div class="divide-y divide-slate-100">
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Status</span>
                        <strong>{{ props.isOnline ? 'Verbunden' : props.connectionChecking ? 'Verbindung wird geprüft' : props.apiConfigured ? 'Verbindung fehlgeschlagen' : 'Nicht konfiguriert' }}</strong>
                    </div>
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Native APIs</span>
                        <span>Events · Songs · Agenda · Berechtigungen</span>
                    </div>
                    <div class="flex justify-between gap-4 py-3 text-sm">
                        <span class="text-slate-500">Speicher</span>
                        <span>ChurchTools Custom Module State</span>
                    </div>
                </div>
            </Card>

            <Card>
                <template #titleFull>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Ressourcen</div>
                            <h3 class="mt-1 text-lg font-semibold">Gefilterte Grundlagen</h3>
                        </div>
                        <Icon icon="fas fa-database" size="L" class="text-slate-500" />
                    </div>
                </template>
                <div class="divide-y divide-slate-100">
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Organisation</span>
                        <strong>{{ selectedOrganization?.name ?? 'Keine konfiguriert' }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Liturgievorlagen</span>
                        <strong>{{ props.availableLiturgiesCount ?? 0 }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Verfügbare Gesangbücher</span>
                        <strong>{{ availableHymnalsCount }}</strong>
                    </div>
                    <div class="flex justify-between py-3 text-sm">
                        <span class="text-slate-500">Lektionare</span>
                        <strong>{{ props.availableLectionariesCount ?? 0 }}</strong>
                    </div>
                </div>
            </Card>
        </div>
</template>
