import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('../../public/ui.js', () => ({ ui: {} }));
vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/state.js', () => ({
    cb: { octave: 60, density: 'standard', practiceMode: true },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true }
}));

import { getIntervals, getChordDetails } from '../../public/chords.js';

describe('Functional Extension Scaling (Rootless Voicings)', () => {
    
    // Helper to simulate getIntervals call with specific density/genre
    const getVoicing = (symbol, density = 'standard') => {
        const { quality, is7th } = getChordDetails(symbol);
        // Force Jazz + BassEnabled to trigger getRootlessVoicing
        return getIntervals(quality, is7th, density, 'Jazz', true);
    };

    describe('Major 7th Chords', () => {
        it('should return cleaner 3-5-7 voicing for standard density "maj7"', () => {
            const intervals = getVoicing('maj7', 'standard');
            // Expect 3(4), 5(7), 7(11)
            expect(intervals).toEqual([4, 7, 11]);
            expect(intervals).not.toContain(14); // No 9th
        });

        it('should return richer 3-7-9 voicing for rich density "maj7"', () => {
            const intervals = getVoicing('maj7', 'rich');
            // Expect 3(4), 7(11), 9(14)
            expect(intervals).toEqual([4, 11, 14]);
        });

        it('should ALWAYS return 9th if explicitly requested ("maj9")', () => {
            const intervals = getVoicing('maj9', 'standard');
            expect(intervals).toContain(14); // 9th
            expect(intervals).toContain(4);  // 3rd
            expect(intervals).toContain(11); // 7th
        });
    });

    describe('Minor 7th Chords', () => {
        it('should return cleaner b3-5-b7 voicing for standard density "m7"', () => {
            const intervals = getVoicing('m7', 'standard');
            // Expect b3(3), 5(7), b7(10)
            expect(intervals).toEqual([3, 7, 10]);
            expect(intervals).not.toContain(14); // No 9th
        });

        it('should return richer b3-b7-9 voicing for rich density "m7"', () => {
            const intervals = getVoicing('m7', 'rich');
            // Expect b3(3), b7(10), 9(14)
            expect(intervals).toEqual([3, 10, 14]);
        });

        it('should ALWAYS return 9th if explicitly requested ("m9")', () => {
            const intervals = getVoicing('m9', 'standard');
            expect(intervals).toContain(14);
        });
    });

    describe('Dominant 7th Chords', () => {
        it('should return cleaner 3-5-b7 voicing for standard density "7"', () => {
            const intervals = getVoicing('7', 'standard');
            // Expect 3(4), 5(7), b7(10)
            expect(intervals).toEqual([4, 7, 10]);
            expect(intervals).not.toContain(14); // No 9th
        });

        it('should return richer 3-b7-9-13 voicing for rich density "7"', () => {
            const intervals = getVoicing('7', 'rich');
            // Expect 3(4), b7(10), 9(14), 13(21)
            expect(intervals).toEqual([4, 10, 14, 21]);
        });

        it('should ALWAYS return 9th if explicitly requested ("9")', () => {
            const intervals = getVoicing('9', 'standard');
            expect(intervals).toContain(14);
        });

        it('should ALWAYS return 13th if explicitly requested ("13")', () => {
            const intervals = getVoicing('13', 'standard');
            expect(intervals).toContain(21);
        });
    });

    describe('Altered Dominants', () => {
        it('should always maintain color tones for "7alt"', () => {
            const intervals = getVoicing('7alt', 'standard');
            // Should contain at least some alt tensions
            expect(intervals.some(i => [13, 15, 20].includes(i))).toBe(true);
        });
    });
});
