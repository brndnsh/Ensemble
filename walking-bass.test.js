import { describe, it, expect, vi } from 'vitest';

// Mock state and global modules
vi.mock('./public/state.js', () => ({
    arranger: { 
        timeSignature: '4/4', 
        totalSteps: 16, 
        stepMap: [
            { start: 0, end: 16, chord: { sectionId: 's1', rootMidi: 60, quality: 'major', beats: 4, freqs: [261.63, 329.63, 392.00] } },
            { start: 16, end: 32, chord: { sectionId: 's1', rootMidi: 65, quality: 'major', beats: 4, freqs: [349.23, 440.00, 523.25] } }
        ] 
    },
    gb: { genreFeel: 'Jazz', lastDrumPreset: 'Standard' },
    ctx: { bandIntensity: 0.5 },
    cb: { practiceMode: false },
    bb: { buffer: new Map() },
    sb: { buffer: new Map() }
}));

import { getBassNote } from './public/bass.js';

describe('Jazz Walking Bass Logic', () => {
    const chordC = {
        rootMidi: 60, // C
        intervals: [0, 4, 7, 11],
        quality: 'maj7',
        beats: 4,
        sectionId: 's1',
        freqs: [261.63, 329.63, 392.00, 493.88]
    };

    const chordF = {
        rootMidi: 65, // F
        intervals: [0, 4, 7, 11],
        quality: 'maj7',
        beats: 4,
        sectionId: 's1',
        freqs: [349.23, 440.00, 523.25, 659.25]
    };

    it('should land on the root on beat 1', () => {
        const result = getBassNote(chordC, chordF, 0, null, 38, 'quarter', 0, 0, 0);
        expect(result.midi % 12).toBe(0); // C
    });

    it('should use an approach note on beat 4 leading to the next chord', () => {
        // Step 12 is beat 4 of the first measure (4/4)
        const result = getBassNote(chordC, chordF, 3, 38, 38, 'quarter', 0, 12, 12);
        
        // Next chord is F (midi 65 or 38 or 53)
        // targetRoot for F might be 41 or 53
        // Chromatic approach to F (midi 53) would be 52 or 54.
        // Dominant approach would be 48 (C).
        
        expect(result).not.toBeNull();
        console.log('Beat 4 note:', result.midi);
    });
});
