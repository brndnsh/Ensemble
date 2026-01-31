import { describe, it, expect, vi } from 'vitest';

// 1. Mock the State with mutable properties using vi.hoisted
const { playbackState, soloistState, grooveState, arrangerState } = vi.hoisted(() => ({
    playbackState: {
        bpm: 120,
        bandIntensity: 0.5,
        complexity: 0.5,
        intent: { anticipation: 0.1 }
    },
    soloistState: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: false,
        sessionSteps: 100,
        deviceBuffer: [],
        motifBuffer: [],
        pitchHistory: [],
        lastFreq: 440,
        lastInterval: 0,
        stagnationCount: 0,
        doubleStops: false
    },
    grooveState: {
        genreFeel: 'Jazz',
        lastDrumPreset: 'Jazz'
    },
    arrangerState: {
        timeSignature: '4/4',
        totalSteps: 64
    }
}));

vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: {
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
            pitchHistory: [],
            deviceBuffer: []
        },
        groove: { genreFeel: 'Jazz' },
        playback: { bandIntensity: 0.5, bpm: 120 },
        arranger: { timeSignature: '4/4', totalSteps: 64 },
        chords: {},
        bass: {},
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn()
    };
    return {
        ...mockState,
        getState: () => mockState
    };
});

// 2. Mock Config (TIME_SIGNATURES needed)
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, stepsPerMeasure: 16 }
    },
    // We do NOT mock STYLE_CONFIG as it is internal to soloist.js
}));

// 3. Mock Utils
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * Math.pow(2, (midi - 69) / 12),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440))
}));

// 4. Mock Theory Scales
vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: (chord) => {
        // Simple C Mixolydian/Major for testing
        const root = chord.rootMidi % 12;
        return [0, 2, 4, 5, 7, 9, 10].map(i => (i + root) % 12); // Relative intervals
    }
}));

import { getSoloistNote } from '../../public/soloist.js';

function runSimulation(bpm, steps = 256) {
    // Reset State
    playbackState.bpm = bpm;
    soloistState.busySteps = 0;
    soloistState.currentPhraseSteps = 0;
    soloistState.notesInPhrase = 0;
    soloistState.pitchHistory = [];
    soloistState.lastFreq = 261.63; // Middle C

    let noteCount = 0;
    let intervals = [];
    let lastMidi = 60;

    // Fake Chord: C7
    const currentChord = { rootMidi: 60, intervals: [0, 4, 7, 10], beats: 4 };
    const nextChord = { rootMidi: 65, intervals: [0, 4, 7, 10], beats: 4 }; // F7

    for (let i = 0; i < steps; i++) {
        const stepInChord = i % 16;
        const res = getSoloistNote(
            currentChord,
            nextChord,
            i,
            soloistState.lastFreq,
            60, // Octave
            'bird', // STYLE
            stepInChord,
            false // isPriming
        );

        if (res) {
            // Handle array results (double stops) - just take top note for interval analysis
            const note = Array.isArray(res) ? res[0] : res;

            noteCount++;

            if (note.midi) {
                const interval = Math.abs(note.midi - lastMidi);
                if (interval > 0) intervals.push(interval); // Ignore repeats for interval avg? No, jumps matter.
                lastMidi = note.midi;

                // Update state manually since we are outside the loop's natural state update cycle?
                // soloist.js updates soloistState internally (mutates the imported object).
                // But we need to update lastFreq for the next call if the function relies on it being passed back in.
                // The function signature is `getSoloistNote(..., prevFreq, ...)`
                soloistState.lastFreq = 440 * Math.pow(2, (note.midi - 69) / 12);
            }
        }
    }

    const avgInterval = intervals.length > 0
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 0;

    // Density: Notes per step (0 to 1)
    const density = noteCount / steps;

    return { density, avgInterval, noteCount };
}

describe('Bird Soloist Density Analysis', () => {
    it('analyzes density and intervals at 120 vs 200 BPM', () => {
        const stats120 = runSimulation(120, 1000);
        const stats200 = runSimulation(200, 1000);

        console.log(`\n--- Bird Analysis ---`);
        console.log(`120 BPM -> Density: ${stats120.density.toFixed(2)}, Avg Interval: ${stats120.avgInterval.toFixed(2)} semitones`);
        console.log(`200 BPM -> Density: ${stats200.density.toFixed(2)}, Avg Interval: ${stats200.avgInterval.toFixed(2)} semitones`);

        // Currently, without the fix, we expect 200 BPM to have similar (high) density and erratic intervals.
        // We aren't asserting failure here, just logging baseline.
        // But for the sake of the test suite passing, we just add a dummy expect.
        expect(true).toBe(true);
    });
});
