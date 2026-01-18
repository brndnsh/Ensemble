/* eslint-disable */
import { describe, it, expect } from 'vitest';
import { generateProceduralFill } from '../../../public/fills.js';

describe('Drums Engine Logic (Fills)', () => {
    it('should generate valid fill steps for various intensities', () => {
        const intensities = [0.2, 0.5, 0.9];
        intensities.forEach(intensity => {
            const fill = generateProceduralFill('Rock', intensity, 16);
            expect(typeof fill).toBe('object');
            const steps = Object.keys(fill).map(Number);
            if (intensity > 0.3) {
                expect(steps.length).toBeGreaterThan(0);
            }
            steps.forEach(step => {
                expect(step).toBeGreaterThanOrEqual(0);
                expect(step).toBeLessThan(16);
                expect(Array.isArray(fill[step])).toBe(true);
            });
        });
    });

    it('should handle odd time signatures correctly', () => {
        const spm = 12; // 3/4 time
        const fill = generateProceduralFill('Jazz', 0.6, spm);
        const steps = Object.keys(fill).map(Number);
        steps.forEach(step => {
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(spm);
        });
    });

    it('should fall back to Rock if genre is unknown', () => {
        const fill = generateProceduralFill('NonExistentGenre', 0.5, 16);
        expect(Object.keys(fill).length).toBeGreaterThan(0);
    });
});
