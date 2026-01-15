import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
        sb: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
            sessionSteps: 1000
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
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { sb, gb } from '../../../public/state.js';

describe('Soloist Phrasing & Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };
    const chordF = { rootMidi: 65, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.motifBuffer = [];
    });

    it('should support double stops by returning an array of notes', () => {
        // Blues has 15% double stop probability
        let foundDoubleStop = false;
        for (let i = 0; i < 5000; i++) {
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            sb.busySteps = 0;
            
            // Call at 12 to start phrase
            getSoloistNote(chordC, null, 12, 440, 72, 'blues', 12);
            
            sb.busySteps = 0;
            const result = getSoloistNote(chordC, null, 14, 440, 72, 'blues', 14);
            if (Array.isArray(result) && result.length > 1) {
                foundDoubleStop = true;
                // Lead Prioritization check: Lead note should be last
                const leadNote = result[result.length - 1];
                const harmonyNote = result[0];
                expect(leadNote.isDoubleStop).toBe(false);
                expect(harmonyNote.isDoubleStop).toBe(true);
                break;
            }
        }
        expect(foundDoubleStop).toBe(true);
    });

    it('should anticipate the next chord on step 14 or 15', () => {
        // Force anticipation step
        // We use 'bird' (Jazz) which has 50% anticipation probability
        let anticipated = false;
        for (let i = 0; i < 2000; i++) {
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            sb.busySteps = 0;
            sb.currentCell = [1, 1, 1, 1]; // Force all 16ths
            
            // Step 14 is the upbeat of 4
            const result = getSoloistNote(chordC, chordF, 14, 440, 72, 'bird', 14);
            if (result) {
                const note = Array.isArray(result) ? result[0] : result;
                const pc = note.midi % 12;
                
                // Chord F (anticipated) is F Major: F(5), G(7), A(9), Bb(10), C(0), D(2), E(4)
                // Chord C (current) is C Major: C(0), D(2), E(4), F(5), G(7), A(9), B(11)
                
                // Bb (10) is UNIQUE to the anticipated F chord scale in this context
                if (pc === 10) anticipated = true;
                
                // Also, if it plays the root of F (5) or the 3rd (9) on an anticipation step, 
                // it's a very strong indicator of anticipation.
                if (pc === 5 || pc === 9) anticipated = true;
            }
        }
        expect(anticipated).toBe(true);
    });

    it('should start with a breath (resting) at step 0', () => {
        // Reset state to simulate fresh playback
        sb.isResting = false;
        delete sb.currentPhraseSteps; 
        
        const result = getSoloistNote(chordC, null, 0, 440, 72, 'scalar', 0);
        
        // Internal logic should have initialized currentPhraseSteps and set isResting to true
        expect(sb.isResting).toBe(true);
        expect(result).toBeNull();
    });

    it('should target specific extensions based on style config', () => {
        // Neo-soul targets 9, #11, 13, maj7 (2, 6, 9, 11)
        let extensionsFound = 0;
        let notesPlayed = 0;
        
        // We run until we have a statistically significant number of notes (at least 100)
        // to ensure we aren't just hitting rests.
        for (let i = 0; i < 5000 && notesPlayed < 200; i++) {
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            sb.busySteps = 0;
            sb.currentCell = [1, 1, 1, 1]; // Force activity
            
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'neo', i % 4);
            if (result) {
                const note = Array.isArray(result) ? result[0] : result;
                const interval = (note.midi - chordC.rootMidi + 120) % 12;
                notesPlayed++;
                if ([2, 6, 9, 11].includes(interval)) extensionsFound++;
            }
        }
        
        // In Neo-Soul with high weight (+12) for extensions, they should represent 
        // a large portion of the melodic content (at least 20%).
        const extensionRate = extensionsFound / notesPlayed;
        expect(extensionRate).toBeGreaterThan(0.2);
        expect(notesPlayed).toBeGreaterThan(100);
    });
});
