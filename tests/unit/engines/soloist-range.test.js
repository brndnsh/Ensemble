import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { sb, gb, ctx, arranger } from '../../../public/state.js';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, lastInterval: 0, hookRetentionProb: 0.5, doubleStops: false,
        sessionSteps: 1000, deviceBuffer: [], deterministic: false
    },
    cb: { enabled: true },
    bb: { enabled: true },
    hb: { enabled: true, rhythmicMask: 0, complexity: 0.5 },
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: [{start: 0, end: 64, chord: {sectionId: 'A'}}],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => {
    const STYLE_CONFIG = {
        scalar: { deviceProb: 0, cells: [0], allowedDevices: [], registerSoar: 5, restBase: 0, restGrowth: 0, doubleStopProb: 0, maxNotesPerPhrase: 100 }
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
        }
    };
});

describe('Soloist Range Constraints', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
        sb.lastInterval = 0;
        sb.sessionSteps = 1000;
        sb.tension = 0;
        sb.currentCell = [1, 1, 1, 1]; // Always play 16ths
    });

    it('should not generate notes below E3 (MIDI 52)', () => {
        let lowestMidi = 127;
        // Start very low (MIDI 40)
        let lastFreq = 440 * Math.pow(2, (40 - 69) / 12); 

        // Generate a bunch of notes starting from a low frequency
        for(let i=0; i<500; i++) {
            const note = getSoloistNote(chordC, null, 16, lastFreq, 64, 'scalar', 0);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                if (primary.midi < lowestMidi) lowestMidi = primary.midi;
                
                // If the engine picks a note, use that as the next "prevFreq"
                lastFreq = 440 * Math.pow(2, (primary.midi - 69) / 12);
            }
        }
        
        console.log('Lowest MIDI observed:', lowestMidi);
        expect(lowestMidi).toBeGreaterThanOrEqual(52); 
    });
});
