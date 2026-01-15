import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    arranger: { 
        timeSignature: '4/4', 
        totalSteps: 128, 
        stepMap: [
            { start: 0, end: 128, chord: { sectionId: 's1', rootMidi: 48, quality: '7', beats: 4 } }
        ] 
    },
    gb: { genreFeel: 'Jazz', lastDrumPreset: 'Standard' },
    ctx: { bandIntensity: 0.5 },
    cb: { practiceMode: false },
    bb: { buffer: new Map() },
    sb: { tension: 0, buffer: new Map() }
}));

import { getBassNote } from '../../public/bass.js';
import { ctx, sb } from '../../public/state.js';

describe('Jazz Walking Bass Logic', () => {
    const chordC = {
        rootMidi: 48, // C3
        intervals: [0, 4, 7, 10],
        quality: '7',
        beats: 4,
        sectionId: 's1',
        bassMidi: null
    };

    const chordF = {
        rootMidi: 41, // F2
        intervals: [0, 4, 7, 10],
        quality: '7',
        beats: 4,
        sectionId: 's1',
        bassMidi: null
    };

    beforeEach(() => {
        ctx.bandIntensity = 0.5;
        sb.tension = 0;
    });

    it('should land on the root on beat 1 (step 0)', () => {
        const result = getBassNote(chordC, chordF, 0, null, 38, 'quarter', 0, 0, 0);
        expect(result.midi % 12).toBe(chordC.rootMidi % 12);
    });

    it('should landing on the 5th on beat 3 (step 8) frequently', () => {
        let fifthCount = 0;
        const total = 100;
        for (let i = 0; i < total; i++) {
            const result = getBassNote(chordC, chordF, 2, 38, 38, 'quarter', 0, 8, 8);
            if (result.midi % 12 === 7) fifthCount++; 
        }
        expect(fifthCount).toBeGreaterThan(5);
    });

    it('should use a chromatic approach on beat 4 leading to the next chord', () => {
        let chromaticCount = 0;
        const total = 100;
        for (let i = 0; i < total; i++) {
            // Force high tension to guarantee chromatic approach
            sb.tension = 0.8;
            const result = getBassNote(chordC, chordF, 3, 38, 38, 'quarter', 0, 12, 12);
            const pc = result.midi % 12;
            if (pc === 4 || pc === 6) chromaticCount++;
        }
        expect(chromaticCount).toBeGreaterThan(50);
    });

    it('should prefer stepwise movement on intermediate beats', () => {
        const prevMidi = 38; 
        const result = getBassNote(chordC, chordF, 1, 440 * Math.pow(2, (prevMidi - 69) / 12), 38, 'quarter', 0, 4, 4);
        const diff = Math.abs(result.midi - prevMidi);
        expect(diff).toBeLessThanOrEqual(2);
        expect(diff).toBeGreaterThan(0);
    });

    it('should respect slash chord bass notes', () => {
        const slashChord = { ...chordC, bassMidi: 40 }; // C/E (E2)
        const result = getBassNote(slashChord, chordF, 0, null, 38, 'quarter', 0, 0, 0);
        expect(result.midi % 12).toBe(4); // E
    });

    it('should vary intensity-based register in quarter style', () => {
        let highCount = 0;
        const total = 100;
        ctx.bandIntensity = 1.0; 
        for (let i = 0; i < total; i++) {
            // step 127 in 128 total steps = 0.99 sectionProgress
            // intensity = 1.0 * 0.7 + 0.99 * 0.3 = 0.997
            // safeCenterMidi = 38 + 7 = 45
            // baseRoot (C) should normalize to 48
            const result = getBassNote(chordC, chordF, 0, null, 38, 'quarter', 0, 127, 127);
            if (result.midi >= 48) highCount++;
        }
        expect(highCount).toBeGreaterThan(50);
    });
});
