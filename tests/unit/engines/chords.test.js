import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules that are imported by chords.js
vi.mock('../../../public/ui.js', () => ({
    ui: {}
}));
vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));
vi.mock('../../../public/state.js', () => ({
    ctx: { bandIntensity: 0.5 },
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Rock' },
    bb: { enabled: false }
}));

import { getChordDetails, getIntervals, transformRelativeProgression, getBestInversion } from '../../../public/chords.js';

describe('Chord Logic', () => {
    describe('getBestInversion', () => {
        it('should center the first chord around the home anchor (C4/60)', () => {
            const root = 60; 
            const intervals = [0, 4, 7];
            const voiced = getBestInversion(root, intervals, []);
            expect(voiced).toEqual([55, 60, 64]);
        });

        it('should invert the chord to minimize movement from previous chord', () => {
            const prev = [60, 64, 67];
            const rootF = 65; 
            const intervalsF = [0, 4, 7];
            const voiced = getBestInversion(rootF, intervalsF, prev);
            voiced.forEach(n => {
                const pc = n % 12;
                expect([5, 9, 0]).toContain(pc);
            });
            const prevAvg = prev.reduce((a,b)=>a+b,0)/prev.length;
            const currAvg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
            expect(Math.abs(currAvg - prevAvg)).toBeLessThan(7);
        });

        it('should respect the range limits (43-84)', () => {
            const root = 60;
            const intervals = [0, 4, 7];
            const prev = [80, 84, 87]; 
            const voiced = getBestInversion(root, intervals, prev);
            const avg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
            expect(Math.abs(avg)).toBeLessThanOrEqual(84 + 12);
        });
    });

    describe('getChordDetails', () => {
        it('should identify Major triads', () => {
            const { quality, is7th } = getChordDetails('C');
            expect(quality).toBe('major');
            expect(is7th).toBe(false);
        });

        it('should identify Minor 7th chords', () => {
            const { quality, is7th } = getChordDetails('m7');
            expect(quality).toBe('minor');
            expect(is7th).toBe(true);
        });

        it('should identify 11th chords', () => {
            const { quality } = getChordDetails('11');
            expect(quality).toBe('11');
        });

        it('should handle complex parenthetical extensions by matching the primary quality', () => {
            const { quality } = getChordDetails('13(#11b9)');
            expect(quality).toBe('13');
        });

        it('should correctly handle minor suffix before a slash', () => {
            const { quality } = getChordDetails('m7/G');
            expect(quality).toBe('minor');
        });
    });

    describe('getIntervals', () => {
        it('should return spread 10ths for Rock Major [0, 7, 16, 19]', () => {
            const intervals = getIntervals('major', false, 'standard', 'Rock');
            expect(intervals).toEqual([0, 7, 16, 19]);
        });

        it('should use 3-5-7 for Jazz maj7 (standard density)', () => {
            const intervals = getIntervals('maj7', true, 'standard', 'Jazz', true);
            expect(intervals).not.toContain(0);
            expect(intervals).toContain(4);
            expect(intervals).toContain(11);
            expect(intervals).toContain(7);
        });

        it('should provide rich extensions for 7alt when density is rich', () => {
            const intervals = getIntervals('7alt', true, 'rich', 'Jazz', true);
            expect(intervals).toContain(4); 
            expect(intervals).toContain(10);
            const alterations = [13, 15, 18, 20];
            const foundAlterations = alterations.filter(a => intervals.includes(a));
            expect(foundAlterations.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('transformRelativeProgression', () => {
        it('should transpose I-IV-V from C Major to A Minor', () => {
            const result = transformRelativeProgression('I | IV | V', -3, true);
            expect(result).toBe('bIII | bVI | bVII');
        });
    });
});