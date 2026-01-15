import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../public/state.js', () => ({
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
        sessionSteps: 0
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: [],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getSoloistNote } from '../public/soloist.js';
import { sb } from '../public/state.js';

describe('Soloist Warm-up Logic (Guns-Blazing Prevention)', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        sb.sessionSteps = 0;
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
    });

    it('should be more likely to rest at the very start of a session', () => {
        let startNotes = 0;
        let endNotes = 0;
        const iterations = 5000;

        // 1. Check at start (sessionSteps reset every iteration)
        for (let i = 0; i < iterations; i++) {
            sb.sessionSteps = 0;
            sb.isResting = false;
            sb.notesInPhrase = 0; // Reset to avoid budget penalty
            sb.currentPhraseSteps = 5; // Long enough to trigger rest check (>4)
            // Use Step 16 to bypass initial 8-step forced rest bias
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 4);
            if (result) startNotes++;
        }

        // 2. Check after warm-up (sessionSteps kept high)
        for (let i = 0; i < iterations; i++) {
            sb.sessionSteps = 1000;
            sb.isResting = false;
            sb.notesInPhrase = 0; // Reset to avoid budget penalty
            sb.currentPhraseSteps = 5;
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 4);
            if (result) endNotes++;
        }

        // At the start, restProb is boosted significantly.
        expect(endNotes).toBeGreaterThan(startNotes);
    });

    it('should never trigger melodic devices at the very first steps', () => {
        let deviceFound = false;
        
        // Scalar has deviceProb 0.15. With warmupFactor 0, it should be 0.
        for (let i = 0; i < 500; i++) {
            // Set to -1 because getSoloistNote increments it to 0 before check
            sb.sessionSteps = -1; 
            sb.deviceBuffer = [];
            sb.isResting = false;
            // Use Step 16 to bypass initial forced rest bias
            getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 0);
            if (sb.deviceBuffer.length > 0) deviceFound = true;
        }
        
        expect(deviceFound).toBe(false);
    });
});
