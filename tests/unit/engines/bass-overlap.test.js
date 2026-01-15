import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
    bb: { 
        enabled: true, 
        busySteps: 0, 
        lastFreq: 440,
        style: 'smart'
    },
    sb: { tension: 0 },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120 },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
    },
    REGGAE_RIDDIMS: {}
}));

import { getBassNote, isBassActive } from '../../../public/bass.js';
import { bb, arranger, gb } from '../../../public/state.js';

describe('Bass Overlap Test', () => {
    const mockChord = {
        rootMidi: 36, // Low C
        intervals: [0, 4, 7], 
        quality: 'major',
        beats: 4
    };

    beforeEach(() => {
        bb.busySteps = 0;
        gb.genreFeel = 'Rock';
    });

    it('should not have overlapping notes in Rock style', () => {
        const activeNotes = [];
        let maxOverlaps = 0;
        gb.genreFeel = 'Rock';

        for (let step = 0; step < 100; step++) {
            for (let i = activeNotes.length - 1; i >= 0; i--) {
                if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
            }

            if (isBassActive('rock', step, step % 16)) {
                const result = getBassNote(mockChord, null, (step % 16) / 4, 440, 38, 'rock', 0, step, step % 16);
                if (result) activeNotes.push({ endStep: step + result.durationSteps });
            }
            maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
        }

        console.log('Max overlapping bass notes found (Rock):', maxOverlaps);
        expect(maxOverlaps).toBeLessThanOrEqual(1);
    });

    it('should not have overlapping notes in Jazz Walking style', () => {
        const activeNotes = [];
        let maxOverlaps = 0;
        gb.genreFeel = 'Jazz';

        for (let step = 0; step < 100; step++) {
            for (let i = activeNotes.length - 1; i >= 0; i--) {
                if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
            }

            if (isBassActive('quarter', step, step % 16)) {
                const result = getBassNote(mockChord, null, (step % 16) / 4, 440, 38, 'quarter', 0, step, step % 16);
                if (result) activeNotes.push({ endStep: step + result.durationSteps });
            }
            maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
        }

        console.log('Max overlapping bass notes found (Jazz):', maxOverlaps);
        expect(maxOverlaps).toBeLessThanOrEqual(1);
    });

    it('should not have overlapping notes in Funk style (allowing for The One interruption)', () => {
        const activeNotes = [];
        let maxOverlaps = 0;
        gb.genreFeel = 'Funk';

        for (let step = 0; step < 100; step++) {
            const stepInChord = step % 16;
            
            // Handle "The One" interruption: if we are at step 0, clear existing notes
            // because the engine explicitly allows interruption here.
            if (stepInChord === 0) {
                activeNotes.length = 0;
            } else {
                // Remove finished notes
                for (let i = activeNotes.length - 1; i >= 0; i--) {
                    if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
                }
            }

            if (isBassActive('funk', step, stepInChord)) {
                const result = getBassNote(mockChord, null, (stepInChord) / 4, 440, 38, 'funk', 0, step, stepInChord);
                if (result) activeNotes.push({ endStep: step + result.durationSteps });
            }
            maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
        }

        console.log('Max overlapping bass notes found (Funk):', maxOverlaps);
        expect(maxOverlaps).toBeLessThanOrEqual(1);
    });
});
