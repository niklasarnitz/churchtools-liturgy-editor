<script setup lang="ts">
import { computed } from 'vue';
import { Button, Card, Icon, SelectDropdown } from './styleguide';
import RadioGroup from '@churchtools/styleguide-components/form/radioGroup/RadioGroup.vue';
import { SUPPORTED_ORGANIZATIONS } from './supported-organizations';
import type { OrganizationDefinition } from '../data/organizations';

const props = defineProps<{ selectedOrganizationId?: string; organizations: OrganizationDefinition[]; busy?: boolean; canManageSettings?: boolean }>();
const emit = defineEmits<{ (event: 'selectOrganization', organizationId: string): void }>();
const selectedOrganization = computed(() => props.organizations.find((org) => org.id === props.selectedOrganizationId));
const organizationDropdownOptions = computed(() => [
    { id: '', name: '– Kein Kirchenkörper ausgewählt –' },
    ...SUPPORTED_ORGANIZATIONS.map((org) => ({ id: org.id, name: org.displayName })),
]);
const organizationRadioOptions = computed(() => SUPPORTED_ORGANIZATIONS.map((org) => ({ id: org.id, nameTranslated: org.displayName })));
const organizationDetails = (id: string) => SUPPORTED_ORGANIZATIONS.find((org) => org.id === id);
const chooseOrganization = (orgId: string) => {
    if (!props.busy) emit('selectOrganization', orgId);
};
const onDropdownChange = (value: string | number) => chooseOrganization(String(value || ''));
</script>

<template>
        <!-- 1. Kirchenkörper Selection Section -->
        <Card class="!p-6">
            <template #titleFull>
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-widest text-accent-primary">Schritt 1: Kirchenkörper</div>
                        <h3 class="mt-1 text-lg font-semibold">Kirchenkörper auswählen</h3>
                        <p class="mt-1 text-sm text-slate-500">
                            Die Auswahl bestimmt, welche Gesangbücher, Liturgievorlagen und Lektionare in ChurchTools bereitgestellt werden.
                        </p>
                    </div>
                    <div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon icon="fas fa-church" size="L" />
                    </div>
                </div>
            </template>

            <RadioGroup
                v-if="props.canManageSettings"
                :class="props.busy ? 'pointer-events-none opacity-60' : ''"
                :value="props.selectedOrganizationId"
                :options="organizationRadioOptions"
                @update:value="onDropdownChange"
            >
                <template #full="{ option, checked }">
                    <div class="flex w-full items-start gap-4 p-5">
                        <Icon :icon="checked ? 'fas fa-check-circle' : 'far fa-circle'" size="L" :class="checked ? 'text-accent-bright' : 'text-basic-tertiary'" />
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-2">
                                <strong>{{ organizationDetails(option.id)?.shortName }}</strong>
                                <span class="text-xs text-basic-secondary">{{ organizationDetails(option.id)?.language }}</span>
                            </div>
                            <h4 class="mt-2 font-semibold">{{ organizationDetails(option.id)?.subtitle }}</h4>
                            <p class="mt-1 text-sm text-basic-secondary">{{ organizationDetails(option.id)?.description }}</p>
                            <p v-if="organizations.find((item) => item.id === option.id)?.liturgyIds.length === 0" class="mt-2 text-xs text-basic-secondary">
                                Gesangbuch verfügbar · keine Liturgievorlagen, kein Editor
                            </p>
                            <p class="mt-3 text-xs text-basic-secondary">
                                <Icon icon="fas fa-book-open" size="S" /> {{ organizationDetails(option.id)?.hymnalName }} · {{ organizationDetails(option.id)?.songCount }} Lieder
                            </p>
                        </div>
                    </div>
                </template>
            </RadioGroup>

            <div v-else class="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                <span class="font-medium">Aktiver Kirchenkörper:</span> {{ selectedOrganization?.name ?? 'Nicht konfiguriert' }}
            </div>

            <!-- Dropdown alternative -->
            <div v-if="props.canManageSettings" class="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div class="max-w-md flex-1">
                    <SelectDropdown
                        id="organization-quick-select"
                        :model-value="props.selectedOrganizationId ?? ''"
                        label="Kirchenkörper (Schnellauswahl / Zurücksetzen)"
                        :options="organizationDropdownOptions"
                        :emit-id="true"
                        :clear="false"
                        @update:model-value="onDropdownChange"
                    />
                </div>
                <div v-if="props.selectedOrganizationId" class="text-xs text-slate-500">
                    <Button
                        label="Auswahl aufheben"
                        size="S"
                        :outlined="true"
                        :disabled="props.busy"
                        @click="chooseOrganization('')"
                    />
                </div>
            </div>

            <!-- In-preparation note -->
            <p class="mt-3 text-xs text-slate-400">
                Hinweis: Weitere Kirchenkörper (wie z. B. ELKB, ELK-WUE) befinden sich derzeit in Vorbereitung.
            </p>
        </Card>

</template>
