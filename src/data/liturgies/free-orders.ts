import type { LiturgyDefinition } from './types';

/** Neutral starting points: no denominational wording is implied. */
export const freeOrders: LiturgyDefinition[] = [
    {
        id: 'selk-free-order', version: 1, organizationId: 'selk', language: 'de',
        name: 'Freier Gottesdienstablauf', tags: ['frei', 'ohne vorgegebene liturgische Texte'],
        serviceType: 'Freier Ablauf',
        nodes: [{ id: 'selk-free-heading', type: 'heading', text: 'Gottesdienst' }],
    },
    {
        id: 'lcms-free-order', version: 1, organizationId: 'lcms', language: 'en',
        name: 'Free service order', tags: ['free form', 'no prescribed liturgical texts'],
        serviceType: 'Free order',
        nodes: [{ id: 'lcms-free-heading', type: 'heading', text: 'Service' }],
    },
];
