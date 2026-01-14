import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
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
        lastFreq: 440,
        hookRetentionProb: 0.5,
        doubleStops: false // Default to OFF for this test
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: []
    },
    gb: { genreFeel: 'Neo-Soul' }
}));

vi.mock('./public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getSoloistNote } from './public/soloist.js';
import { sb, gb } from './public/state.js';

describe('Soloist Double Stop Toggle Integrity', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        sb.doubleStops = false;
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
    });

    it('should NEVER return an array of notes when doubleStops is false', () => {
        let arrayFound = false;
        
        // Run many iterations across different styles to catch any leaked double stops
        const styles = ['blues', 'neo', 'scalar', 'bird', 'bossa'];
        
        for (const style of styles) {
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
                // Move steps to bypass any physical duration gates if they existed
                const result = getSoloistNote(chordC, null, (i % 16) + 16, 440, 72, style, i % 16);
                
                if (Array.isArray(result)) {
                    arrayFound = true;
                    break;
                }
            }
            if (arrayFound) break;
        }
        
        expect(arrayFound).toBe(false);
    });

    it('should return an array of notes when doubleStops is true (Verification)', () => {
        sb.doubleStops = true;
        let arrayFound = false;
        
        // Blues has high double stop probability
        for (let i = 0; i < 2000; i++) {
            sb.busySteps = 0;
            sb.isResting = false;
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'blues', i % 16);
            
            if (Array.isArray(result)) {
                arrayFound = true;
                break;
            }
        }
        
        expect(arrayFound).toBe(true);
    });
});
