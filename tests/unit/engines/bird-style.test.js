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
        tension: 0,
        deviceBuffer: [],
        motifBuffer: [],
        hookBuffer: [],
        lastFreq: 440,
        hookRetentionProb: 0.5,
        doubleStops: false,
        sessionSteps: 1000
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.7, bpm: 160, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({ rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 }),
        totalSteps: 64,
        stepMap: [{start: 0, end: 64, chord: {sectionId: 'A'}}],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Jazz' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [2, 2] }
    }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { sb } from '../../../public/state.js';

describe('Soloist Style: Bird (Bebop)', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 11], quality: 'maj7', beats: 4 };

    beforeEach(() => {
        sb.sessionSteps = 1000;
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
    });

    it('should maintain longer phrases for Bird style (Parker-style continuity)', () => {
        // Run a simulation of 256 steps (16 bars)
        let noteCount = 0;
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.currentCell = [1, 1, 1, 1]; // Start with dense cell
        
        for (let i = 0; i < 256; i++) {
            // In the real engine, cells are refreshed every beat (4 steps)
            if (i % 4 === 0) {
                sb.currentCell = [1, 1, 1, 1]; // Force dense cells for this specific continuity test
            }
            
            const result = getSoloistNote(chordC, null, i, 440, 72, 'bird', i % 16);
            if (result) {
                if (Array.isArray(result)) noteCount += result.length;
                else noteCount++;
            }
        }
        
        // With forced dense cells, Bird should be extremely active.
        // We'll check for 100+ notes in 256 steps.
        expect(noteCount).toBeGreaterThan(100);
    });

    it('should occasionally trigger the birdFlurry device', () => {
        let flurryFound = false;
        
        // Run many iterations to catch the probabilistic device trigger
        for (let i = 0; i < 2000; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.isResting = false;
            sb.currentPhraseSteps = 1; // Start of a phrase
            sb.notesInPhrase = 5; 
            
            // Try to trigger at step 16 (isGroupStart in 4/4 with [2,2] grouping)
            // Step 16 is usually measureStep 0 for the 2nd measure.
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'bird', 0);
            
            if (sb.deviceBuffer.length === 3 || (result && result.style === 'bird' && sb.deviceBuffer.length === 3)) {
                flurryFound = true;
                break;
            }
        }
        
        expect(flurryFound).toBe(true);
    });

    it('should favor 8th and 16th note rhythms', () => {
        let durations = [];
        for (let i = 0; i < 500; i++) {
            const result = getSoloistNote(chordC, null, i, 440, 72, 'bird', i % 16);
            if (result) {
                if (Array.isArray(result)) {
                    result.forEach(n => durations.push(n.durationSteps));
                } else {
                    durations.push(result.durationSteps);
                }
            }
        }
        
        const shortNotes = durations.filter(d => d <= 2).length;
        const ratio = shortNotes / durations.length;
        
        // Bebop should be > 70% 8ths (2) or 16ths (1)
        // We lowered from 0.8 to 0.7 to account for more diverse phrase endings
        expect(ratio).toBeGreaterThan(0.7);
    });
});
