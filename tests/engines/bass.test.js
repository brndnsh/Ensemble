import { describe, it, expect, vi } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    arranger: { 
        timeSignature: '4/4', 
        totalSteps: 16, 
        stepMap: [{ start: 0, end: 16, chord: { sectionId: 's1' } }] 
    },
    gb: { genreFeel: 'Rock', lastDrumPreset: 'Standard' },
    ctx: { bandIntensity: 0.5 },
    cb: { practiceMode: false },
    bb: { buffer: new Map() },
    sb: { buffer: new Map() }
}));

import { getBassNote, isBassActive } from '../../public/bass.js';
import { gb } from '../../public/state.js';

describe('Bass Engine', () => {
    const mockChord = {
        rootMidi: 60, // C
        intervals: [0, 4, 7],
        quality: 'major',
        beats: 4,
        sectionId: 's1'
    };

    describe('Smart Style Mapping', () => {
        it('should map Rock genre to "rock" style internally', () => {
            gb.genreFeel = 'Rock';
            // isBassActive returns true for all 8ths in Rock
            expect(isBassActive('smart', 0, 0)).toBe(true);
            expect(isBassActive('smart', 2, 2)).toBe(true);
            expect(isBassActive('smart', 1, 1)).toBe(false); 
        });

        it('should map Jazz genre to "quarter" (walking) style internally', () => {
            gb.genreFeel = 'Jazz';
            expect(isBassActive('smart', 0, 0)).toBe(true); // Downbeat
            expect(isBassActive('smart', 4, 4)).toBe(true); // Beat 2
        });
    });

    describe('Note Generation', () => {
        it('should return a Root note frequency on the downbeat (step 0)', () => {
            for(let i=0; i<100; i++) {
                const result = getBassNote(mockChord, null, 0, null, 38, 'rock', 0, 0, 0);
                expect(result).not.toBeNull();
                expect(result.midi % 12).toBe(0); // Should be C
            }
        });

        it('should stay within a reasonable range of the center MIDI', () => {
            const center = 38;
            for(let i=0; i<100; i++) {
                const result = getBassNote(mockChord, null, 0, null, center, 'rock', 0, 0, 0);
                expect(result.midi).toBeGreaterThanOrEqual(center - 15);
                expect(result.midi).toBeLessThanOrEqual(center + 15);
            }
        });
    });
});
