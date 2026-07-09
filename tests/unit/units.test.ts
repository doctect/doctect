import { describe, it, expect } from 'vitest';
import { toDisplayUnit, fromDisplayUnit } from '../../constants/editor';

describe('dimension unit conversion (canonical = pt)', () => {
    it('converts canonical pt to the display unit', () => {
        expect(toDisplayUnit(72, 'in')).toBe(1);
        expect(toDisplayUnit(72, 'pt')).toBe(72);
        expect(toDisplayUnit(72, 'px')).toBe(72);
        expect(toDisplayUnit(283.465, 'mm')).toBeCloseTo(100, 1);
    });

    it('converts a display value back to canonical pt', () => {
        expect(fromDisplayUnit(1, 'in')).toBe(72);
        expect(fromDisplayUnit(100, 'mm')).toBeCloseTo(283.465, 1);
        expect(fromDisplayUnit(509, 'pt')).toBe(509);
    });

    it('round-trips without drifting (size stays the same)', () => {
        for (const unit of ['pt', 'px', 'in', 'mm'] as const) {
            expect(fromDisplayUnit(toDisplayUnit(509, unit), unit)).toBeCloseTo(509, 1);
        }
    });

    it('rounds display values to a sane precision', () => {
        expect(toDisplayUnit(509, 'in')).toBeCloseTo(7.069, 3);
        expect(String(toDisplayUnit(509, 'in')).length).toBeLessThanOrEqual(6); // not 7.069444444444445
    });
});
