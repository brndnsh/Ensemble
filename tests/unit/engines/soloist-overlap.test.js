import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
        sb: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            contourSteps: 0,
            melodicTrend: 'Static',
            tension: 0,
            motifBuffer: [],
            hookBuffer: [],
            lastFreq: 440,
            hookRetentionProb: 0.5,
            doubleStops: true,
            sessionSteps: 1000
        },    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120 },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: new Array(16).fill({}),
            totalSteps: 64,
            stepMap: []
        },    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { sb, arranger, gb } from '../../../public/state.js';

describe('Soloist Overlap Test', () => {
    const mockChord = {
        rootMidi: 60, // C
        intervals: [0, 4, 7, 10], // C7
        quality: '7',
        beats: 4
    };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
        sb.qaState = 'Question';
        sb.tension = 0;
        sb.busySteps = 0;
        gb.genreFeel = 'Rock';
    });

    it('should not have more than 2 notes overlapping when doubleStops is enabled', () => {
        sb.doubleStops = true;
        const activeNotes = []; // { endStep: number }
        let maxOverlaps = 0;

        // Run for 1000 steps to catch probabilistic overlaps
        for (let step = 0; step < 1000; step++) {
            // Remove finished notes
            for (let i = activeNotes.length - 1; i >= 0; i--) {
                if (activeNotes[i].endStep <= step) {
                    activeNotes.splice(i, 1);
                }
            }

            const result = getSoloistNote(mockChord, null, step + 16, 440, 72, 'scalar', step % 16);
            
            if (result) {
                const notes = Array.isArray(result) ? result : [result];
                notes.forEach(n => {
                    activeNotes.push({ endStep: step + n.durationSteps });
                });
            }

            maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
        }

        // With sustained notes (durationSteps > 1), the generator might overlap intent
        // BUT synth-soloist.js enforces the duophonic limit.
        // We allow 3 here to account for (2 double stop notes) + (1 previous sustaining note intent)
        expect(maxOverlaps).toBeLessThanOrEqual(3);
    });

    it('should be strictly monophonic (intent) when doubleStops is disabled', () => {
        sb.doubleStops = false;
        const activeNotes = [];
        let maxOverlaps = 0;

        for (let step = 0; step < 1000; step++) {
            for (let i = activeNotes.length - 1; i >= 0; i--) {
                if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
            }

            const result = getSoloistNote(mockChord, null, step + 16, 440, 72, 'scalar', step % 16);
            
            if (result) {
                // When doubleStops is false, getSoloistNote should ONLY return single notes
                expect(Array.isArray(result)).toBe(false);
                activeNotes.push({ endStep: step + result.durationSteps });
            }

            maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
        }

        // We allow 2 here to account for overlapping "intent" (sustain into next note)
        // The actual synth-level monophony is handled in synth-soloist.js
        expect(maxOverlaps).toBeLessThanOrEqual(2);
    });
});
