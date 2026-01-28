
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => ({
    soloist: {
        enabled: true, busySteps: 0, currentPhraseSteps: 10, notesInPhrase: 5,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, lastInterval: 0, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000, deviceBuffer: [], deterministic: false,
        pitchHistory: new Array(128).fill(0).map((_, i) => 60 + (i % 12)) // Pre-populate history to force loops
    },
    chords: { enabled: true },
    bass: { enabled: true },
    harmony: { enabled: true, rhythmicMask: 0, complexity: 0.5 },
    playback: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: {
        key: 'C',
        isMinor: false,
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: [{start: 0, end: 64, chord: {sectionId: 'A'}}],
        timeSignature: '4/4'
    },
    groove: { genreFeel: 'Rock' }
}));

vi.mock('../../public/config.js', () => {
    const STYLE_CONFIG = {
        scalar: { deviceProb: 0.1, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.0, restGrowth: 0, doubleStopProb: 0.1, maxNotesPerPhrase: 16 }
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
        }
    };
});

// Mock utils and others
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * Math.pow(2, (midi - 69) / 12),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440))
}));

vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11] // C Major scale
}));

import { getSoloistNote } from '../../public/soloist.js';
import { soloist } from '../../public/state.js';

describe('Soloist Performance Benchmark', () => {
    it('measures getSoloistNote loop performance', () => {
        const iterations = 50000; // High iteration count
        const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

        // Ensure we hit the logic path by resetting busySteps
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.isResting = false;
        soloist.currentPhraseSteps = 10;

        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            // Reset state that might cause early exits or skipping the heavy logic
            soloist.busySteps = 0;
            soloist.deviceBuffer = [];

            getSoloistNote(chordC, null, i, 440, 72, 'scalar', i % 16);
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`getSoloistNote x ${iterations} took ${duration.toFixed(2)}ms`);
        // We just want to ensure it runs without error and gives us a number
        expect(duration).toBeGreaterThan(0);
    });
});
