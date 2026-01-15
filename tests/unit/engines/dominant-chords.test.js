import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules
vi.mock('../../../public/ui.js', () => ({ ui: {} }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/state.js', () => ({
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true } // Trigger rootless
}));

import { getChordDetails, getIntervals } from '../../../public/chords.js';

describe('Dominant Chord Intervals', () => {
    const testCases = [
        { symbol: '7', expected: [4, 7, 10] }, // Rootless (Functional): 3, 5, b7
        { symbol: '9', expected: [4, 10, 14] },
        { symbol: '13', expected: [4, 10, 14, 21] },
        { symbol: '11', expected: [5, 7, 10, 14] }, // 11, 5, b7, 9 (No 3rd)
        { symbol: '7alt', expected: [4, 10, 15, 20] }, // Standard density: 3, b7, #9, b13
        { symbol: '7b9', expected: [4, 10, 13, 16] },
        { symbol: '7#9', expected: [4, 10, 15, 16] },
        { symbol: '7#11', expected: [4, 10, 14, 18] },
        { symbol: '7b13', expected: [4, 10, 14, 20] }, // Rootless: 3, b7, 9, b13
    ];

    testCases.forEach(({ symbol, expected }) => {
        it(`should provide correct intervals for ${symbol}`, () => {
            const { quality, is7th } = getChordDetails(symbol);
            const intervals = getIntervals(quality, is7th, 'standard', 'Jazz', true);
            console.log(`Intervals for ${symbol} (${quality}):`, intervals);
            
            // Check for b7 (10)
            expect(intervals).toContain(10);
            // Rootless check: should NOT contain root (0)
            expect(intervals).not.toContain(0);
            
            // Check for 3rd (4) - except for 11th chords which use 4th (5)
            if (symbol !== '11') {
                expect(intervals).toContain(4);
            } else {
                expect(intervals).toContain(5);
            }

            // Verify the specific interval set matches expected exactly
            expect(intervals.sort((a,b)=>a-b)).toEqual(expected.sort((a,b)=>a-b));
        });
    });
    
    it('should NOT have Maj7 (11) in a dominant 7th chord', () => {
        const { quality, is7th } = getChordDetails('7');
        const intervals = getIntervals(quality, is7th, 'standard', 'Jazz', true);
        expect(intervals).not.toContain(11);
    });
});
