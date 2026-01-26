import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { soloist, playback, groove, arranger } from '../../../public/state.js';

// Mock config to avoid loading external files
vi.mock('../../../public/config.js', () => ({
    STYLE_CONFIG: {
        scalar: { 
            restBase: 0.1, restGrowth: 0.05, cells: [0, 2], registerSoar: 10,
            tensionScale: 0.6, timingJitter: 0, maxNotesPerPhrase: 16,
            deviceProb: 0.1, allowedDevices: [], motifProb: 0.3 
        }
    },
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

// Mock state
vi.mock('../../../public/state.js', () => ({
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: false,
        motifBuffer: [],
        motifReplayCount: 0,
        sessionSteps: 0,
        lastFreq: 440,
        lastInterval: 0,
        stagnationCount: 0,
        deviceBuffer: [],
        doubleStops: false,
        pitchHistory: []
    },
    playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5 },
    groove: { genreFeel: 'Rock' },
    arranger: { timeSignature: '4/4', totalSteps: 64 },
    harmony: { enabled: false }
}));

vi.mock('../../../public/utils.js', () => ({
    getFrequency: (m) => 440 * Math.pow(2, (m - 69) / 12),
    getMidi: (f) => Math.round(12 * Math.log2(f / 440) + 69)
}));

vi.mock('../../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11] // C Major scale
}));

describe('Soloist Stagnation Analysis', () => {
    // Pop Standard Progression (C - G - Am - F)
    const chords = [
        { rootMidi: 60, intervals: [0, 4, 7], quality: 'maj', beats: 4 }, // C
        { rootMidi: 55, intervals: [0, 4, 7], quality: 'maj', beats: 4 }, // G
        { rootMidi: 57, intervals: [0, 3, 7], quality: 'min', beats: 4 }, // Am
        { rootMidi: 53, intervals: [0, 4, 7], quality: 'maj', beats: 4 }  // F
    ];

    beforeEach(() => {
        soloist.sessionSteps = 0;
        soloist.stagnationCount = 0;
        soloist.motifBuffer = [];
        soloist.deviceBuffer = [];
        soloist.busySteps = 0;
        playback.bandIntensity = 0.5;
        soloist.pitchHistory = []; // Reset history
    });

    it('should not get stuck in a narrow range (trill/stagnation) for more than 4 measures', () => {
        let history = [];
        let maxRangeStagnation = 0;
        
        // Force Answer state where Root weight is high (+500)
        soloist.qaState = 'Answer';

        // Simulate ~2 minutes (approx 2000 steps at 16 steps/measure)
        for (let step = 0; step < 2000; step++) {
            const chordIdx = Math.floor((step % 64) / 16);
            const chord = chords[chordIdx];
            
            // Advance maturity
            soloist.sessionSteps++;
            
            const note = getSoloistNote(chord, null, step, 440, 60, 'scalar', step % 16, false);
            
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                history.push(primary.midi);
                if (history.length > 16) history.shift(); // Keep last measure

                // Check for range stagnation in the last 8 notes
                if (history.length >= 8) {
                    const recent = history.slice(-8);
                    const min = Math.min(...recent);
                    const max = Math.max(...recent);
                    if ((max - min) <= 2) {
                        maxRangeStagnation++;
                    } else {
                        maxRangeStagnation = 0;
                    }
                }
            } else {
                // Rest breaks stagnation
                maxRangeStagnation = 0;
                history = [];
            }
            
            // Fail if we are stagnant for more than 32 steps (2 measures)
            expect(maxRangeStagnation).toBeLessThan(32);
        }
    });

    it('should abort motif replay if the note is dominating pitch history', () => {
        // 1. Setup a "Magnet Note" situation
        const magnetMidi = 69; // A4
        soloist.pitchHistory = new Array(20).fill(magnetMidi); // 20/32 = 62% dominance
        
        // 2. Setup a Motif that uses this note
        soloist.motifBuffer = [{ midi: magnetMidi, durationSteps: 4 }];
        soloist.isReplayingMotif = true;
        soloist.motifReplayIndex = 0;
        
        // 3. Call generator
        // It should detect the magnet, ABORT replay, and generate a FRESH note
        // The fresh note will ALSO avoid 69 because of the history penalty
        const chord = chords[0];
        const note = getSoloistNote(chord, null, 16, 440, 60, 'scalar', 0, false);
        
        // 4. Verification
        expect(soloist.isReplayingMotif).toBe(false); // Should have aborted
        expect(soloist.motifBuffer.length).toBeGreaterThan(0); // Should contain the NEW note
        
        if (note) {
            const primary = Array.isArray(note) ? note[0] : note;
            expect(primary.midi).not.toBe(magnetMidi); // Should pick something else
        }
    });
});
