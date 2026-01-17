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
        tension: 0.5,
        smoothedTension: 0.5,
        lastInterval: 0,
        deviceBuffer: [],
        motifBuffer: [],
        hookBuffer: [],
        lastFreq: 440,
        hookRetentionProb: 0.5,
        doubleStops: false,
        sessionSteps: 1000
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({ rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 }),
        totalSteps: 64,
        stepMap: [{start: 0, end: 64, chord: {sectionId: 'A'}}],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [2, 2] }
    }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { sb } from '../../../public/state.js';

describe('Soloist Melodic Contour: Skip-Step Resolution', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        sb.sessionSteps = 1000;
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.lastInterval = 0;
        sb.deviceBuffer = [];
    });

    it('should resolve a large upward skip with a downward step', () => {
        let downwardStepCount = 0;
        const iterations = 100;
        
        for (let i = 0; i < iterations; i++) {
            sb.busySteps = 0;
            sb.lastInterval = 7; 
            sb.currentCell = [1, 1, 1, 1];
            const result = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0);
            if (result && result.midi < 69 && Math.abs(result.midi - 69) <= 2) {
                downwardStepCount++;
            }
        }
        
        expect(downwardStepCount).toBeGreaterThan(iterations * 0.5);
    });

    it('should resolve a large downward skip with an upward step', () => {
        let upwardStepCount = 0;
        const iterations = 100;
        
        for (let i = 0; i < iterations; i++) {
            sb.busySteps = 0;
            sb.lastInterval = -7; 
            sb.currentCell = [1, 1, 1, 1];
            const result = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0);
            if (result && result.midi > 69 && Math.abs(result.midi - 69) <= 2) {
                upwardStepCount++;
            }
        }
        
        expect(upwardStepCount).toBeGreaterThan(iterations * 0.5);
    });

    it('should heavily penalize consecutive large jumps', () => {
        let largeJumpCount = 0;
        const iterations = 100;
        
        for (let i = 0; i < iterations; i++) {
            sb.busySteps = 0;
            sb.lastInterval = 7; 
            sb.currentCell = [1, 1, 1, 1];
            const result = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0);
            if (result && Math.abs(result.midi - 69) > 4) {
                largeJumpCount++;
            }
        }
        
        expect(largeJumpCount).toBeLessThan(iterations * 0.1);
    });
});