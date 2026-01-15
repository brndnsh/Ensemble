import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => ({
    bb: { 
        enabled: true, 
        busySteps: 0, 
        lastFreq: 440,
        volume: 0.5,
        pocketOffset: 0
    },
    sb: { 
        enabled: true, 
        busySteps: 0, 
        tension: 0
    },
    gb: { 
        genreFeel: 'Rock',
        measures: 1,
        instruments: [
            { name: 'Kick', steps: new Array(16).fill(0), muted: false }
        ]
    },
    ctx: { bandIntensity: 0.5, bpm: 120 },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        timeSignature: '4/4',
        stepMap: []
    }
}));

vi.mock('../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    },
    REGGAE_RIDDIMS: {}
}));

import { getBassNote } from '../../public/bass.js';
import { bb, sb, gb, ctx } from '../../public/state.js';

describe('Bass Engine Intelligence', () => {
    const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'major', beats: 4 };
    const chordF = { rootMidi: 53, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        bb.busySteps = 0;
        sb.busySteps = 0;
        sb.tension = 0;
        ctx.bandIntensity = 0.5;
        gb.genreFeel = 'Rock';
        gb.instruments[0].steps.fill(0);
    });

    it('should mirror the Kick drum pattern in rock style', () => {
        gb.genreFeel = 'Rock';
        // Set kick on steps 0, 4, 8, 12
        gb.instruments[0].steps[0] = 2;
        gb.instruments[0].steps[4] = 1;
        gb.instruments[0].steps[8] = 2;
        gb.instruments[0].steps[12] = 1;

        // Check step 4 (Kick hit)
        const hitResult = getBassNote(chordC, null, 1, 110, 38, 'rock', 0, 4, 4);
        expect(hitResult).not.toBeNull();
        expect(hitResult.velocity).toBeGreaterThan(1.1);

        // Check step 1 (No kick, low intensity)
        ctx.bandIntensity = 0.2;
        let silentCount = 0;
        for (let i = 0; i < 50; i++) {
            const noHitResult = getBassNote(chordC, null, 0.25, 110, 38, 'rock', 0, 1, 1);
            if (noHitResult === null) silentCount++;
        }
        expect(silentCount).toBeGreaterThan(0);
    });

    it('should implement Harmonic Pull (leading tones) on the final beat of a chord', () => {
        gb.genreFeel = 'Jazz';
        const lastBeatIndex = 3; // Beat 4 of 4/4
        const targetRootF = 41; // F2 (Low F)
        
        let leadingToneCount = 0;
        let dominantAnchorCount = 0;
        
        for (let i = 0; i < 200; i++) {
            // Note: getBassNote for walking style uses intBeat = Math.floor(beatIndex)
            const result = getBassNote(chordC, chordF, 3, 110, 38, 'quarter', 0, 12, 12);
            if (result) {
                const midi = result.midi;
                if (midi % 12 === 4 || midi % 12 === 6) leadingToneCount++; // E (4) or Gb (6)
                if (midi % 12 === 0) dominantAnchorCount++; // C (0) - dominant of F
            }
        }
        
        expect(leadingToneCount + dominantAnchorCount).toBeGreaterThan(100);
    });

    it('should reduce complexity when the soloist is busy', () => {
        gb.genreFeel = 'Funk';
        sb.busySteps = 4; // Soloist is playing
        
        // In Funk, "Grease" (16th notes on steps 1 or 3) should be skipped
        const greaseResult = getBassNote(chordC, null, 0.25, 110, 38, 'funk', 0, 1, 1);
        expect(greaseResult).toBeNull();

        // In Walking, should stick to root-5th mostly
        let rootOrFifthCount = 0;
        let totalNotes = 0;
        for (let i = 0; i < 200; i++) {
            const result = getBassNote(chordC, null, 1, 110, 38, 'quarter', 0, 4, 4);
            if (result) {
                totalNotes++;
                const interval = (result.midi - chordC.rootMidi + 120) % 12;
                if (interval === 0 || interval === 7) rootOrFifthCount++;
            }
        }
        expect(rootOrFifthCount / totalNotes).toBeGreaterThan(0.7);
    });

    it('should boost velocity for "Pop" articulation in funk at high intensity', () => {
        gb.genreFeel = 'Funk';
        ctx.bandIntensity = 0.9;
        const upbeatStep = 2; // Step 2 is an accented upbeat in our logic
        
        // Mock a kick on this step to ensure the note plays (Kick Mirroring)
        gb.instruments[0].steps[2] = 1;
        
        const result = getBassNote(chordC, null, 0.5, 110, 38, 'funk', 0, 2, 2);
        expect(result).not.toBeNull();
        expect(result.velocity).toBeGreaterThanOrEqual(1.2);
    });
});
