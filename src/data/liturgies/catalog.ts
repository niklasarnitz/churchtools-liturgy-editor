import type { LiturgyDefinition } from './types';
import { badenDurmersheimLiturgy } from './baden-durmersheim';
import { freeOrders } from './free-orders';
import { lcmsLiturgies } from './lcms';
import { selkLiturgies } from './selk';

export const liturgies: LiturgyDefinition[] = [badenDurmersheimLiturgy, ...selkLiturgies, ...lcmsLiturgies, ...freeOrders];
export const liturgiesById = Object.fromEntries(liturgies.map((liturgy) => [liturgy.id, liturgy]));
