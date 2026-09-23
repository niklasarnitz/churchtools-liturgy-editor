import { describe, expect, it } from 'vitest';

import { generateNormalizedAgenda } from '../../domain/agenda-generation';
import { lcmsLiturgies } from './lcms';

describe('LCMS Divine Service outlines', () => {
    it('provides five distinct, text-free LSB settings with stable node IDs', () => {
        expect(lcmsLiturgies.map((liturgy) => liturgy.id)).toEqual([
            'lcms-divine-service-1', 'lcms-divine-service-2', 'lcms-divine-service-3',
            'lcms-divine-service-4', 'lcms-divine-service-5',
        ]);
        for (const liturgy of lcmsLiturgies) {
            expect(liturgy.organizationId).toBe('lcms');
            expect(new Set(liturgy.nodes.map((node) => node.id)).size).toBe(liturgy.nodes.length);
            expect(liturgy.nodes.every((node) => node.type !== 'fixedText')).toBe(true);
            const rendered = generateNormalizedAgenda({
                template: liturgy,
                slots: { gospel: 'John 1:1–14', sermon: 'John 1:1–14' },
            });
            expect(rendered.items.find((item) => item.nodeId.endsWith('-gospel'))?.note).toBe('John 1:1–14');
            expect(rendered.items.find((item) => item.nodeId.endsWith('-benediction'))?.title).toBe('Benediction');
        }
    });

    it('marks the documented setting-specific canticles', () => {
        const part = (setting: number, key: string) => lcmsLiturgies[setting - 1].nodes.find((node) => node.id === `lcms-ds${setting}-${key}`);
        expect(part(1, 'gloria')).toMatchObject({ text: 'Gloria in Excelsis or This Is the Feast' });
        expect(part(3, 'gloria')).toMatchObject({ text: 'Gloria in Excelsis' });
        expect(part(5, 'kyrie')).toMatchObject({ text: 'Kyrie (chorale)' });
    });
});
