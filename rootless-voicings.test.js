import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('./public/state.js', () => ({
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: { timeSignature: '4/4', key: 'C', isMinor: false },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true }
}));

vi.mock('./public/ui.js', () => ({ ui: {} }));
vi.mock('./public/worker-client.js', () => ({ syncWorker: vi.fn() }));

import { getIntervals } from './public/chords.js';
import { gb, bb, cb } from './public/state.js';

describe('Rootless Jazz Voicings', () => {
    
    beforeEach(() => {
        gb.genreFeel = 'Jazz';
        bb.enabled = true;
        cb.density = 'standard';
    });

    it('should omit root and 5th for Jazz maj7 (standard density)', () => {
        const intervals = getIntervals('maj7', true, 'standard', 'Jazz', true);
        // Expect 3, 7, 9 -> [4, 11, 14]
        expect(intervals).toEqual([4, 11, 14]);
        expect(intervals).not.toContain(0);
        expect(intervals).not.toContain(7);
    });

    it('should use "So What" voicing for Neo-Soul minor 7', () => {
        gb.genreFeel = 'Neo-Soul';
        const intervals = getIntervals('minor', true, 'standard', 'Neo-Soul', true);
        // [5, 10, 15, 19] 
        expect(intervals).toEqual([5, 10, 15, 19]);
    });

    it('should use altered dominant rootless voicing', () => {
        const intervals = getIntervals('7alt', true, 'standard', 'Jazz', true);
        // [4, 10, 15, 20] -> 3, b7, #9, b13
        expect(intervals).toEqual([4, 10, 15, 20]);
    });

    it('should fall back to standard triads if not Jazz/Neo-Soul/Funk', () => {
        gb.genreFeel = 'Rock';
        bb.enabled = false;
        const intervals = getIntervals('major', false, 'standard', 'Rock', false);
        // Rock spread: [0, 7, 16, 19]
        expect(intervals).toEqual([0, 7, 16, 19]);
    });
});
