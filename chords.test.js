import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules that are imported by chords.js
vi.mock('./public/ui.js', () => ({
    ui: {}
}));
vi.mock('./public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));

import { getChordDetails, getIntervals, transformRelativeProgression } from './public/chords.js';

describe('Chord Logic', () => {
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

        it('should return rootless Jazz Major 7th intervals (no 0)', () => {
            // density='standard', genre='Jazz', bassEnabled=true (to trigger rootless)
            const intervals = getIntervals('maj7', true, 'standard', 'Jazz', true);
            expect(intervals).not.toContain(0);
            expect(intervals).toContain(4); // 3rd
            expect(intervals).toContain(7); // 5th
            expect(intervals).toContain(11); // 7th
            expect(intervals).toContain(14); // 9th
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
});
