
import { describe, it, vi } from 'vitest';
import { getBassNote } from '../../public/bass.js';

const { mockArranger, stepMap, TOTAL_SECTIONS, STEPS_PER_SECTION } = vi.hoisted(() => {
    const stepMap = [];
    const TOTAL_SECTIONS = 1000;
    const STEPS_PER_SECTION = 4;
    for (let i = 0; i < TOTAL_SECTIONS; i++) {
        stepMap.push({
            start: i * STEPS_PER_SECTION,
            end: (i + 1) * STEPS_PER_SECTION,
            chord: {
                sectionId: `section_${i}`,
                rootMidi: 48,
                quality: 'major',
                beats: 1,
                intervals: [0, 4, 7]
            }
        });
    }
    return {
        stepMap,
        TOTAL_SECTIONS,
        STEPS_PER_SECTION,
        mockArranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: TOTAL_SECTIONS * STEPS_PER_SECTION,
            timeSignature: '4/4',
            stepMap: stepMap
        }
    };
});

vi.mock('../../public/state.js', () => ({
    bass: {
        enabled: true,
        busySteps: 0,
        lastFreq: 440,
        volume: 0.5,
        pocketOffset: 0,
        buffer: new Map(),
        style: 'rock'
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
        instruments: []
    },
    playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.3 },
    chords: { pianoRoots: true },
    harmony: { enabled: false, buffer: new Map() },
    arranger: mockArranger
}));

vi.mock('../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    },
    REGGAE_RIDDIMS: {}
}));

describe('Bass Generation Performance', () => {
    const ITERATIONS = 10_000;
    const targetStep = (TOTAL_SECTIONS - 1) * STEPS_PER_SECTION + 1;
    const currentChord = stepMap[stepMap.length - 1].chord;
    const nextChord = stepMap[0].chord;
    const context = {
        sectionStart: stepMap[stepMap.length - 1].start,
        sectionEnd: stepMap[stepMap.length - 1].end
    };

    it('Optimized: Direct Access (With Context)', () => {
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            getBassNote(currentChord, nextChord, 0, 440, 48, 'rock', TOTAL_SECTIONS - 1, targetStep, 1, context);
        }
        const duration = performance.now() - start;
        console.log(`Optimized Access (Run 1): ${duration.toFixed(2)}ms`);
    });

    it('Legacy: Linear Lookup (No Context)', () => {
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            getBassNote(currentChord, nextChord, 0, 440, 48, 'rock', TOTAL_SECTIONS - 1, targetStep, 1);
        }
        const duration = performance.now() - start;
        console.log(`Legacy Lookup (Run 2): ${duration.toFixed(2)}ms`);
    });
});
