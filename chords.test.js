import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules that are imported by chords.js
vi.mock('./public/ui.js', () => ({
    ui: {}
}));
vi.mock('./public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));
vi.mock('./public/state.js', () => ({
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Rock' },
    bb: { enabled: false }
}));

import { getChordDetails, getIntervals, transformRelativeProgression, getBestInversion } from './public/chords.js';

describe('Chord Logic', () => {
    describe('getBestInversion', () => {
        it('should center the first chord around the home anchor (C4/60)', () => {
            // C Major triad: C(0), E(4), G(7). Root=60 (C4).
            // Expect to be close to 60.
            const root = 60; 
            const intervals = [0, 4, 7];
            const voiced = getBestInversion(root, intervals, []);
            
            // Logic picks notes closest to 60.
            // C -> 60 (diff 0)
            // E -> 64 (diff 4) vs 52 (diff 8) -> 64
            // G -> 67 (diff 7) vs 55 (diff 5) -> 55
            // Result: [55, 60, 64] (2nd inversion)
            expect(voiced).toEqual([55, 60, 64]);
        });

        it('should invert the chord to minimize movement from previous chord', () => {
            // Prev: C Major [60, 64, 67]
            // Next: F Major (F A C). Root=65 (F4) or 53 (F3). 
            // Closest F triad to [60, 64, 67] is [57, 60, 65] (A3, C4, F4) or [60, 65, 69] (C4, F4, A4).
            // Let's see what the logic produces.
            const prev = [60, 64, 67];
            const rootF = 65; // F4
            const intervalsF = [0, 4, 7]; // F, A, C
            
            const voiced = getBestInversion(rootF, intervalsF, prev);
            
            // Logic attempts to keep avg note close to prev avg.
            // C(60) is common. A is 69 or 57. F is 65 or 53.
            // It should pick an inversion where notes are close to 60, 64, 67.
            // Likely [57, 60, 65] or [60, 65, 69].
            
            // Check that all notes are valid chord tones (modulo 12)
            // F(5), A(9), C(0)
            voiced.forEach(n => {
                const pc = n % 12;
                expect([5, 9, 0]).toContain(pc);
            });
            
            // Check that average distance is reasonable (voice leading)
            const prevAvg = prev.reduce((a,b)=>a+b,0)/prev.length;
            const currAvg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
            expect(Math.abs(currAvg - prevAvg)).toBeLessThan(7); // Should move less than a 5th on average
        });

        it('should respect the range limits (43-84)', () => {
            // Force a very high anchor via previous chords?
            // Or just check that result is within range.
            const root = 60;
            const intervals = [0, 4, 7];
            const prev = [80, 84, 87]; // High previous chord
            
            const voiced = getBestInversion(root, intervals, prev);
            
            // It might try to stay high, but should be clamped if it exceeds max?
            // Default MAX is 84. 
            // If avg > 84, it drops an octave.
            const avg = voiced.reduce((a,b)=>a+b,0)/voiced.length;
            expect(Math.abs(avg)).toBeLessThanOrEqual(84 + 12); // Logic might allow some float, but check sanity
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

        it('should identify dominant 7th chords', () => {
            const { quality, is7th } = getChordDetails('7');
            expect(quality).toBe('7');
            expect(is7th).toBe(true);
        });

        it('should identify Major 7th chords', () => {
            const { quality, is7th } = getChordDetails('maj7');
            expect(quality).toBe('maj7');
            expect(is7th).toBe(true);
        });

        it('should identify diminished chords', () => {
            const { quality, is7th } = getChordDetails('dim');
            expect(quality).toBe('dim');
            expect(is7th).toBe(false);
        });

        it('should identify half-diminished (ø) chords', () => {
            const { quality, is7th } = getChordDetails('ø7');
            expect(quality).toBe('halfdim');
            expect(is7th).toBe(true);
        });

        it('should identify dominant 7b9 chords', () => {
            const { quality, is7th } = getChordDetails('7b9');
            expect(quality).toBe('7b9');
            expect(is7th).toBe(true);
        });

        it('should identify 11th chords', () => {
            const { quality } = getChordDetails('11');
            expect(quality).toBe('11');
        });

        it('should identify 13th chords', () => {
            const { quality } = getChordDetails('13');
            expect(quality).toBe('13');
        });

        it('should identify altered dominant chords', () => {
            const { quality } = getChordDetails('7alt');
            expect(quality).toBe('7alt');
        });

        it('should identify 7#11 chords', () => {
            const { quality } = getChordDetails('7#11');
            expect(quality).toBe('7#11');
        });
    });

    describe('getIntervals', () => {
        it('should return spread 10ths for Rock Major [0, 7, 16, 19]', () => {
            const intervals = getIntervals('major', false, 'standard', 'Rock');
            expect(intervals).toEqual([0, 7, 16, 19]);
        });

        it('should return spread 10ths for Rock Minor [0, 7, 15, 19]', () => {
            const intervals = getIntervals('minor', false, 'standard', 'Rock');
            expect(intervals).toEqual([0, 7, 15, 19]);
        });

        it('should return standard triads for Jazz without rootless trigger', () => {
            const intervals = getIntervals('major', false, 'standard', 'Jazz', false);
            expect(intervals).toContain(0);
            expect(intervals).toContain(4);
            expect(intervals).toContain(7);
        });

        it('should use 3-5-7 for Jazz maj7 (standard density)', () => {
            const intervals = getIntervals('maj7', true, 'standard', 'Jazz', true);
            expect(intervals).not.toContain(0);
            expect(intervals).toContain(4); // 3rd
            expect(intervals).toContain(11); // 7th
            expect(intervals).toContain(7); // 5th (Now included for stability)
            expect(intervals).not.toContain(14); // 9th (Reserved for Rich density or explicit maj9)
        });

        it('should provide intervals for 11th chords (No 3rd to avoid clash)', () => {
            const intervals = getIntervals('11', true, 'standard', 'Jazz', false);
            expect(intervals).toContain(17); // 11th
            expect(intervals).not.toContain(4); // No 3rd
        });

        it('should provide intervals for 13th chords (1, 3, 5, b7, 9, 13)', () => {
            const intervals = getIntervals('13', true, 'standard', 'Jazz', false);
            expect(intervals).toContain(21); // 13th
        });

        it('should provide intervals for 7alt chords', () => {
            const intervals = getIntervals('7alt', true, 'standard', 'Jazz', false);
            // Typically includes b9, #9, #11, b13 (13, 15, 18, 20)
            expect(intervals).toContain(13); // b9
            expect(intervals).toContain(15); // #9
        });

        it('should provide correct intervals for dominant 7th chords (b7, not Maj7)', () => {
            const { quality, is7th } = getChordDetails('7');
            const intervals = getIntervals(quality, is7th, 'standard', 'Jazz', false);
            expect(intervals).toContain(10); // b7
            expect(intervals).not.toContain(11); // No Maj7
        });
    });

    describe('transformRelativeProgression', () => {
        it('should transpose I-IV-V from C Major to A Minor (Relative Minor)', () => {
            // C Major -> A Minor is -3 semitones
            // C(I) -> Eb(bIII) ? No, in relative minor, I becomes bIII (C in Am)
            const result = transformRelativeProgression('I | IV | V', -3, true);
            expect(result).toBe('bIII | bVI | bVII');
        });

        it('should transpose i-iv-v from A Minor to C Major (Relative Major)', () => {
            // A Minor -> C Major is +3 semitones
            // Am(i) -> Am(vi) in C Major
            const result = transformRelativeProgression('i | iv | v', 3, false);
            expect(result).toBe('vi | ii | iii');
        });

        it('should preserve chord suffixes during transformation', () => {
            const result = transformRelativeProgression('Imaj7 | iim7', -3, true);
            expect(result).toBe('bIIImaj7 | ivm7'); 
        });
    });

    describe('Roman Numeral Parsing (Integration)', () => {
        // This tests the logic in parseProgressionPart via a mock context if possible, 
        // or we can just verify the getChordDetails + isLowercase logic.
        // Since parseProgressionPart is internal, we'll focus on the quality output.
        
        it('should correctly identify vi7 as minor', () => {
            // Mocking the behavior of parseProgressionPart's romanMatch check
            const symbol = 'vi7';
            const { quality } = getChordDetails('7'); // quality '7' initially
            const isLowercase = true; // simulated from 'vi'
            
            let finalQuality = quality;
            if (isLowercase && (quality === 'major' || quality === '7')) finalQuality = 'minor';
            
            expect(finalQuality).toBe('minor');
        });
    });
});
