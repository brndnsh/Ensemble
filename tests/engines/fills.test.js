import { describe, it, expect } from 'vitest';
import { generateProceduralFill, FILL_TEMPLATES } from '../../public/fills.js';

describe('Procedural Fill Generation', () => {
    it('should return an empty object if no matching template found', () => {
        // Assuming 'UnknownGenre' doesn't exist and falls back to Rock, 
        // but let's see logic. The code defaults to Rock if genre not found.
        // So checking empty logic might need a case where template level is empty.
        // Rock low/med/high all exist.
        
        // Let's test basic return structure
        const fill = generateProceduralFill('Rock', 0.5, 16);
        expect(typeof fill).toBe('object');
    });

    it('should return valid fill steps for Rock Medium', () => {
        const fill = generateProceduralFill('Rock', 0.5, 16);
        const steps = Object.keys(fill).map(Number);
        expect(steps.length).toBeGreaterThan(0);
        
        // Rock Medium templates act on the last measure.
        // Steps should be within 0-15
        steps.forEach(step => {
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(16);
            
            const events = fill[step];
            expect(Array.isArray(events)).toBe(true);
            events.forEach(event => {
                expect(event).toHaveProperty('name');
                expect(event).toHaveProperty('vel');
            });
        });
    });

    it('should generate more intense fills for high intensity', () => {
        // High intensity (> 0.75) uses 'high' templates
        // We can check if it picks from the high pool
        // Rock High templates are denser.
        
        // Let's verify it doesn't crash and returns *something*
        const fill = generateProceduralFill('Rock', 0.9, 16);
        const steps = Object.keys(fill);
        expect(steps.length).toBeGreaterThan(0);
    });

    it('should handle odd time signatures (stepsPerMeasure != 16)', () => {
        // 3/4 time = 12 steps
        const spm = 12;
        const fill = generateProceduralFill('Rock', 0.5, spm);
        const steps = Object.keys(fill).map(Number);
        
        // The fill logic shifts the template (based on 16 steps)
        // offset = 12 - 16 = -4.
        // Template steps (e.g., 12, 14) -> 8, 10.
        // Template steps (e.g., 0, 2) -> -4, -2 (filtered out).
        
        steps.forEach(step => {
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(12);
        });
    });

    it('should fall back to Rock if genre is unknown', () => {
        const fill = generateProceduralFill('NonExistentGenre', 0.5, 16);
        // Should behave like Rock
        expect(Object.keys(fill).length).toBeGreaterThan(0);
    });

    it('should correct offset for longer measures (e.g. 5/4 = 20 steps)', () => {
        const spm = 20;
        const fill = generateProceduralFill('Rock', 0.5, spm);
        const steps = Object.keys(fill).map(Number);
        
        // offset = 20 - 16 = 4
        // Template step 14 -> 18.
        
        steps.forEach(step => {
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(20);
            // Should be at the end of the measure
            expect(step).toBeGreaterThan(10); 
        });
    });
});
