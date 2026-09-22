import { hymnals } from './hymnals';
import type { HymnalDefinition } from './hymnals';
import { lectionaries } from './lectionaries';
import type { LectionaryDefinition } from './lectionaries';
import { liturgies } from './liturgies';
import type { LiturgyDefinition } from './liturgies';
import { organizations } from './organizations';
import type { OrganizationDefinition } from './organizations';

export interface ResourceRegistry {
    organizations: OrganizationDefinition[];
    hymnals: HymnalDefinition[];
    liturgies: LiturgyDefinition[];
    lectionaries: LectionaryDefinition[];
}

export const resourceRegistry: ResourceRegistry = { organizations, hymnals, liturgies, lectionaries };
