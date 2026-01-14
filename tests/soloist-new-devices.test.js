import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
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
        deviceBuffer: [],
        lastFreq: 440,
        hookRetentionProb: 0.5,
        currentCell: [1, 1, 1, 1]
    },
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

vi.mock('../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
    }
}));

import { getSoloistNote } from '../public/soloist.js';
import { sb, gb } from '../public/state.js';

describe('Soloist New Melodic Devices', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
        sb.isReplayingMotif = false;
    });

    it('should trigger a Quartal Arpeggio for neo style', () => {
        let deviceTriggered = false;
        sb.doubleStops = true; // Quartal is gated behind this now
        for (let i = 0; i < 500; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 1;
            getSoloistNote(chordC, null, 16, 440, 72, 'neo', 0);
            if (sb.deviceBuffer.length >= 2) {
                deviceTriggered = true;
                break;
            }
        }
        expect(deviceTriggered).toBe(true);
    });

    it('should trigger a Blues Slide for blues style', () => {
        let deviceTriggered = false;
        sb.sessionSteps = 1000; // Bypass warm-up
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 1;
            getSoloistNote(chordC, null, 16, 440, 72, 'blues', 0);
            if (sb.deviceBuffer.length >= 1) {
                deviceTriggered = true;
                break;
            }
        }
        expect(deviceTriggered).toBe(true);
    });

    it('should trigger a Scalar Run for shred style', () => {
        let deviceTriggered = false;
        sb.sessionSteps = 1000; // Bypass warm-up
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 1;
            getSoloistNote(chordC, null, 16, 440, 72, 'shred', 0);
            if (sb.deviceBuffer.length >= 2) {
                deviceTriggered = true;
                break;
            }
        }
        expect(deviceTriggered).toBe(true);
    });
});
