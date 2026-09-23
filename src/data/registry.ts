import { hymnals } from './hymnals/catalog';
import type { HymnalDefinition } from './hymnals/types';
import { lectionaries } from './lectionaries/catalog';
import type { LectionaryDefinition } from './lectionaries/types';
import { liturgies } from './liturgies/catalog';
import type { LiturgyDefinition } from './liturgies/types';
import { organizations } from './organizations/catalog';
import type { OrganizationDefinition } from './organizations/types';

export interface ResourceRegistry {
    organizations: OrganizationDefinition[];
    hymnals: HymnalDefinition[];
    liturgies: LiturgyDefinition[];
    lectionaries: LectionaryDefinition[];
}

export const resourceRegistry: ResourceRegistry = { organizations, hymnals, liturgies, lectionaries };
