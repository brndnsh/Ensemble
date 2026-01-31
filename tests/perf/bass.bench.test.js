
import { describe, it, expect, vi } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        bass: {
            enabled: true,
            busySteps: 0,
            lastFreq: 440,
            volume: 0.5,
            pocketOffset: 0,
            buffer: new Map(),
            style: 'smart'
        },
        soloist: {
            enabled: true,
            busySteps: 0,
            tension: 0,
            buffer: new Map()
        },
        groove: {
            genreFeel: 'Rock',
            measures: 1,
            lastDrumPreset: 'Standard',
            instruments: [
                { name: 'Kick', steps: new Array(16).fill(0), muted: false }
            ]
        },
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.3 },
        chords: { pianoRoots: true },
        harmony: { enabled: false, buffer: new Map() },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: new Array(16).fill({}),
            totalSteps: 64,
            timeSignature: '4/4',
            stepMap: [{ start: 0, end: 64, chord: { sectionId: 's1', rootMidi: 48, quality: '7', beats: 4 } }]
        },
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

vi.mock('../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    },
    REGGAE_RIDDIMS: {}
}));

import { isBassActive } from '../../public/bass.js';

describe('Bass Logic Performance', () => {
    it('measures isBassActive performance for Bossa style', () => {
        const ITERATIONS = 10_000_000;
        const style = 'bossa';

        const start = performance.now();

        let activeCount = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            // Cycle through steps 0-15 (one measure of 16th notes)
            const step = i % 16;
            // stepInChord is effectively same as step for this micro-benchmark
            if (isBassActive(style, step, step)) {
                activeCount++;
            }
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`isBassActive ('bossa', ${ITERATIONS} iterations) took ${duration.toFixed(2)}ms`);

        // Sanity check: bossa pattern is [0, 6, 8, 14] (4 hits per 16 steps)
        // 10,000,000 iterations / 16 steps = 625,000 measures
        // 625,000 * 4 hits = 2,500,000 hits
        expect(activeCount).toBe(2_500_000);
    });
});
