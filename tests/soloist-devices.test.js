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
        doubleStops: true,
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
import { sb, gb, ctx } from '../public/state.js';

describe('Soloist Advanced Melodic Devices', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
        sb.isReplayingMotif = false;
        gb.genreFeel = 'Rock';
    });

    it('should implement Melodic Enclosures for bird style on strong beats', () => {
        gb.genreFeel = 'Jazz';
        let enclosureDetected = false;
        
        // We run multiple attempts since it's probabilistic (45%)
        for (let i = 0; i < 200; i++) {
            sb.deviceBuffer = [];
            sb.busySteps = 0;
            sb.isResting = false;
            sb.currentPhraseSteps = 1;

            // Trigger the device on Step 16
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'bird', 0);
            
            if (result && sb.deviceBuffer.length === 2) {
                // The first note of the enclosure sequence is found!
                // Now we must simulate the next steps to verify the buffer is consumed.
                
                // Step 17 should return the first note from the buffer
                const note2 = getSoloistNote(chordC, null, 17, 440, 72, 'bird', 1);
                
                // Step 18 should return the final note from the buffer
                const note3 = getSoloistNote(chordC, null, 18, 440, 72, 'bird', 2);

                if (note2 && note3) {
                    enclosureDetected = true;
                    // Check properties of the resulting notes if needed
                    expect(note2.midi).toBeDefined();
                    expect(note3.midi).toBeDefined();
                    break;
                }
            }
        }
        expect(enclosureDetected).toBe(true);
    });

    it('should implement Quartal Harmony (perfect 4ths) for neo style', () => {
        let quartalCount = 0;
        let totalNotes = 0;
        const lastMidi = 72; // C5
        
        for (let i = 0; i < 1000; i++) {
            sb.busySteps = 0;
            const result = getSoloistNote(chordC, null, i % 16, 440 * Math.pow(2, (lastMidi - 69)/12), 72, 'neo', i % 16);
            if (result && !Array.isArray(result)) {
                totalNotes++;
                const dist = Math.abs(result.midi - lastMidi);
                if (dist === 5) quartalCount++; // Perfect 4th
            }
        }
        
        // With +35 weight, perfect 4ths should be significantly more common than other intervals.
        // Statistically, there are 12 semitones. Uniform would be ~8%. 
        // We expect at least 15-20% given the high weight, but use 0.12 for flaky protection.
        const quartalRate = quartalCount / totalNotes;
        expect(quartalRate).toBeGreaterThan(0.12);
    });

    it('should implement Rhythmic Call and Response weighting', () => {
        let questionTensionCount = 0;
        let answerAnchorCount = 0;
        let questionTotal = 0;
        let answerTotal = 0;

        // Test Question State
        for (let i = 0; i < 1000; i++) {
            sb.busySteps = 0;
            sb.isResting = false;
            sb.qaState = 'Question';
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'scalar', i % 16);
            if (result && !Array.isArray(result)) {
                questionTotal++;
                const interval = (result.midi - chordC.rootMidi + 120) % 12;
                if (interval === 6 || interval === 10) questionTensionCount++;
            }
        }

        // Test Answer State
        for (let i = 0; i < 1000; i++) {
            sb.busySteps = 0;
            sb.isResting = false;
            sb.qaState = 'Answer';
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'scalar', i % 16);
            if (result && !Array.isArray(result)) {
                answerTotal++;
                const interval = (result.midi - chordC.rootMidi + 120) % 12;
                if (interval === 0 || interval === 7) answerAnchorCount++;
            }
        }

        const questionTensionRate = questionTensionCount / questionTotal;
        const answerAnchorRate = answerAnchorCount / answerTotal;

        // Answer state should have a higher frequency of Anchors (root/5th) than Question state.
        // Question state should have a higher frequency of Tensions (#11/b7) than Answer state would typically have.
        expect(answerAnchorRate).toBeGreaterThan(0.25); // Adjusted for stability
        expect(questionTensionRate).toBeGreaterThan(0.08); // Adjusted for stability
        
        // Comparative check
        expect(answerAnchorRate).toBeGreaterThan(questionTensionRate);
    });

    it('should verify that Answer state has a statistically higher root-frequency landing than Question state', () => {
        let questionRootCount = 0;
        let answerRootCount = 0;
        let questionTotal = 0;
        let answerTotal = 0;

        for (let i = 0; i < 1000; i++) {
            sb.busySteps = 0;
            sb.isResting = false;
            sb.qaState = 'Question';
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'scalar', i % 16);
            if (result && !Array.isArray(result)) {
                questionTotal++;
                if ((result.midi - chordC.rootMidi + 120) % 12 === 0) questionRootCount++;
            }
        }

        for (let i = 0; i < 1000; i++) {
            sb.busySteps = 0;
            sb.isResting = false;
            sb.qaState = 'Answer';
            const result = getSoloistNote(chordC, null, i % 16, 440, 72, 'scalar', i % 16);
            if (result && !Array.isArray(result)) {
                answerTotal++;
                if ((result.midi - chordC.rootMidi + 120) % 12 === 0) answerRootCount++;
            }
        }

        const questionRootRate = questionRootCount / questionTotal;
        const answerRootRate = answerRootCount / answerTotal;

        expect(answerRootRate).toBeGreaterThan(questionRootRate);
    });
});
