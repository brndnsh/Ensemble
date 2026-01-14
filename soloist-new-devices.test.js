import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('./public/state.js', () => ({
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

vi.mock('./public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
    }
}));

import { getSoloistNote } from './public/soloist.js';
import { sb, gb } from './public/state.js';

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
        gb.genreFeel = 'Neo-Soul';
        let deviceTriggered = false;
        
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            const result = getSoloistNote(chordC, null, 0, 440, 72, 'neo', 0);
            
            if (result && sb.deviceBuffer && sb.deviceBuffer.length >= 2) {
                // Check if it's a quartal stack (intervals of 5)
                const firstNoteMidi = result.midi;
                const secondNoteMidi = sb.deviceBuffer[0].midi;
                const thirdNoteMidi = sb.deviceBuffer[1].midi;
                
                if (Math.abs(secondNoteMidi - firstNoteMidi) === 5 && Math.abs(thirdNoteMidi - secondNoteMidi) === 5) {
                    deviceTriggered = true;
                    break;
                }
            }
        }
        expect(deviceTriggered).toBe(true);
    });

    it('should trigger a Blues Slide for blues style', () => {
        gb.genreFeel = 'Blues';
        let deviceTriggered = false;
        
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            const result = getSoloistNote(chordC, null, 0, 440, 72, 'blues', 0);
            
            if (result && sb.deviceBuffer && sb.deviceBuffer.length >= 1) {
                // Check if it's a chromatic slide (e.g., b3 to 3 or root-1 to root)
                const firstNoteMidi = result.midi;
                const secondNoteMidi = sb.deviceBuffer[0].midi;
                
                if (Math.abs(secondNoteMidi - firstNoteMidi) === 1) {
                    deviceTriggered = true;
                    break;
                }
            }
        }
        expect(deviceTriggered).toBe(true);
    });

    it('should trigger a Scalar Run for shred style', () => {
        gb.genreFeel = 'Rock';
        let deviceTriggered = false;
        
        for (let i = 0; i < 1000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            const result = getSoloistNote(chordC, null, 0, 440, 72, 'shred', 0);
            
            if (result && sb.deviceBuffer && sb.deviceBuffer.length >= 3) {
                // Check if it's a scalar sequence (steps of 1 or 2)
                const firstNoteMidi = result.midi;
                const secondNoteMidi = sb.deviceBuffer[0].midi;
                const thirdNoteMidi = sb.deviceBuffer[1].midi;
                const fourthNoteMidi = sb.deviceBuffer[2].midi;
                
                const d1 = Math.abs(secondNoteMidi - firstNoteMidi);
                const d2 = Math.abs(thirdNoteMidi - secondNoteMidi);
                const d3 = Math.abs(fourthNoteMidi - thirdNoteMidi);
                
                if (d1 <= 2 && d2 <= 2 && d3 <= 2) {
                    deviceTriggered = true;
                    break;
                }
            }
        }
        expect(deviceTriggered).toBe(true);
    });
});
