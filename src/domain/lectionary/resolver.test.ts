import { describe, expect, it } from 'vitest';

import { organizationsById } from '../../data/organizations/catalog';
import { testBadenLiturgy, testLectionary } from '../../test-fixtures/resources';
import { resolveLiturgicalDay } from './resolver';

const lectionaries = [testLectionary];

describe('lectionary resolver', () => {
    it('selects a liturgy-linked lectionary and returns a suggestion', () => {
        const result = resolveLiturgicalDay({
            date: '2026-09-20',
            organization: organizationsById.ekiba,
            liturgy: testBadenLiturgy,
            lectionaries,
        });

        expect(result?.name).toBe('17. Sonntag nach Trinitatis');
        expect(result?.readings.gospel?.reference).toBe('Lk 14,1–11');
    });

    it('applies manual overrides without mutating static data', () => {
        const result = resolveLiturgicalDay({
            date: new Date(2026, 8, 20),
            organization: organizationsById.selk,
            lectionaryId: testLectionary.id,
            lectionaries,
            overrides: {
                sermonSeries: 'Manuelle Reihe',
                readings: { gospel: { reference: 'Joh 3,16' } },
            },
        });

        expect(result?.sermonSeries).toBe('Manuelle Reihe');
        expect(result?.readings.gospel?.reference).toBe('Joh 3,16');
        expect(lectionaries[0].days[0].readings.gospel?.reference).toBe('Lk 14,1–11');
    });

    it('returns no suggestion when the selected lectionary has no matching date', () => {
        expect(
            resolveLiturgicalDay({
                date: '2026-12-31',
                organization: organizationsById.ekiba,
                lectionaries,
            }),
        ).toBeUndefined();
    });
});
