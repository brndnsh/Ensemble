import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
        sb: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
            sessionSteps: 1000
        },    cb: { enabled: true },
    ctx: { bandIntensity: 1.0, bpm: 120 },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: new Array(16).fill({}),
            totalSteps: 64,
            stepMap: []
        },    gb: { genreFeel: 'Rock' }
}));

// Simple mock for config to avoid hoisting issues
vi.mock('../../../public/config.js', () => {
    const STYLE_CONFIG = {
        neo: { deviceProb: 1.0, cells: [0], allowedDevices: ['enclosure'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        shred: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        blues: { deviceProb: 1.0, cells: [0], allowedDevices: ['slide'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        scalar: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0 }
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
        }
    };
});

import { getSoloistNote } from '../../../public/soloist.js';
import { sb } from '../../../public/state.js';

describe('Soloist New Melodic Devices', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
        sb.isReplayingMotif = false;
        sb.sessionSteps = 1000;
    });

    it('should trigger a Quartal Arpeggio for neo style', () => {
        let deviceTriggered = false;
        sb.doubleStops = true; 
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 5;
            getSoloistNote(chordC, null, 16, 440, 72, 'neo', 0);
            if (sb.deviceBuffer.length >= 1) {
                deviceTriggered = true;
                break;
            }
        }
        expect(deviceTriggered).toBe(true);
    });

    it('should trigger a Blues Slide for blues style', () => {
        let deviceTriggered = false;
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 5;
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
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.currentPhraseSteps = 5;
            getSoloistNote(chordC, null, 16, 440, 72, 'shred', 0);
            if (sb.deviceBuffer.length >= 1) {
                deviceTriggered = true;
                break;
            }
        }
        expect(deviceTriggered).toBe(true);
    });
});