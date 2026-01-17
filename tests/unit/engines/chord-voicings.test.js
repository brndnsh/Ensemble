import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules
vi.mock('../../../public/ui.js', () => ({ ui: {} }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/state.js', () => ({
    ctx: { bandIntensity: 0.5 },
    cb: { density: 'standard', octave: 60, practiceMode: false },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Rock' },
    bb: { enabled: false }
}));

import { getBestInversion } from '../../../public/chords.js';

describe('Chord Voicing & Inversion Logic', () => {
    
    it('should maintain spread voicings as a unit (Spread Voicing Unit-Shift)', () => {
        // Rock style spread voicing: [0, 7, 16, 19] (1, 5, 10, 12)
        const root = 48; // C2
        const intervals = [0, 7, 16, 19]; 
        const targetCenter = 60; // C4
        
        // The center of [48, 55, 64, 67] is 58.5
        // If we shift it up an octave: [60, 67, 76, 79] center is 70.5
        // Target 60 is closer to 58.5.
        
        const voiced = getBestInversion(root, intervals, []);
        
        // Verify intervals are preserved exactly
        const resultIntervals = voiced.map(n => n - voiced[0]);
        expect(resultIntervals).toEqual([0, 7, 16, 19]);
        
        // Verify it didn't scramble the inversion
        expect(voiced[0] % 12).toBe(0); // Root should still be C
    });

    it('should minimize movement between chords (Voice Leading)', () => {
        // C Major triad [60, 64, 67]
        const prev = [60, 64, 67];
        const rootF = 53; // F2 (but we want it normalized close to prev)
        const intervalsF = [0, 4, 7]; // F, A, C
        
        const voiced = getBestInversion(rootF, intervalsF, prev);
        
        // Closest F triad to [60, 64, 67] is [60, 65, 69] (C, F, A)
        // C(60)->C(60) diff 0
        // E(64)->F(65) diff 1
        // G(67)->A(69) diff 2
        // Total movement = 3 semitones
        
        expect(voiced).toEqual([60, 65, 69]);
    });

    it('should handle large jumps with a pivot (Pivot Logic)', () => {
        const prev = [48, 52, 55]; // Low C Major
        const rootC = 60; 
        const intervals = [0, 4, 7];
        
        // isPivot = true should allow more drift or reset closer to home anchor
        // Default home anchor is 60.
        const voiced = getBestInversion(rootC, intervals, prev, true);
        
        // Average of prev is 51.6
        // Average of [60, 64, 67] is 63.6
        // If it was NOT a pivot, it might stay lower.
        // As a pivot, it should pull towards the home anchor (60).
        const avg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
        expect(Math.abs(avg - 60)).toBeLessThan(5);
    });

    it('should prevent overlapping with bass in lower register', () => {
        // If a note is too low (< 48), it should ensure a minimum gap of 7 semitones 
        // from the previous note in the chord (standardizing intervals).
        // This is part of the "i > 0 && best < 48" logic in getBestInversion.
        
        const root = 36; // C1
        const intervals = [0, 4, 7]; // C, E, G
        const voiced = getBestInversion(root, intervals, []);
        
        // [36, 40, 43] is too low (avg 39.6 < 43). 
        // Clamping logic should push it up: [48, 52, 55] (avg 51.6)
        
        const avg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
        expect(avg).toBeGreaterThanOrEqual(43);
    });
});
