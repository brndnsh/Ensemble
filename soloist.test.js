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
        hookRetentionProb: 0.5
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120 },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('./public/config.js', () => ({
    KEY_ORDER: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getSoloistNote } from './public/soloist.js';
import { sb, arranger, gb } from './public/state.js';

describe('Soloist Engine', () => {
    const mockChord = {
        rootMidi: 60, // C
        intervals: [0, 4, 7, 10], // C7
        quality: '7',
        is7th: true
    };

    const minorChord = {
        rootMidi: 69, // Am
        intervals: [0, 3, 7],
        quality: 'minor'
    };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
        sb.qaState = 'Question';
        sb.tension = 0;
        sb.busySteps = 0;
        gb.genreFeel = 'Jazz';
    });

    it('should generate a note object when playing', () => {
        // Force shouldPlay by mocking Math.random or trying multiple times
        // In this architecture, it's easier to just call it until we get a note
        let note = null;
        for(let i=0; i<100; i++) {
            note = getSoloistNote(mockChord, null, 0, 440, 72, 'scalar', 0);
            if (note) break;
        }
        expect(note).not.toBeNull();
        if (Array.isArray(note)) {
            expect(note[0]).toHaveProperty('midi');
            expect(note[0]).toHaveProperty('velocity');
        } else {
            expect(note).toHaveProperty('midi');
            expect(note).toHaveProperty('velocity');
        }
    });

    it('should use Mixolydian (b7) for dominant chords in scalar style', () => {
        // We use 'scalar' style and ensure no devices are triggered 
        // to verify standard Mixolydian behavior.
        let generatedMidi = [];
        for(let i=0; i<3000; i++) {
            const note = getSoloistNote(mockChord, null, i, 440, 72, 'scalar', i%4);
            // If the note has a device buffer, it might use chromaticism.
            // We ignore notes that are part of a device sequence for this pure scale test.
            if (note && !Array.isArray(note) && !sb.deviceBuffer?.length) {
                generatedMidi.push(note.midi);
            }
        }
        
        const hasB = generatedMidi.some(m => m % 12 === 11);
        const hasBb = generatedMidi.some(m => m % 12 === 10);
        
        expect(hasBb).toBe(true);
        expect(hasB).toBe(false); 
    });

    it('should use Phrygian Dominant when resolving to minor', () => {
        // V7 (C7) to i (Fm) - check for b2 (Db / 61)
        const fMinor = { rootMidi: 53, quality: 'minor', intervals: [0, 3, 7] };
        
        let generatedMidi = [];
        for(let i=0; i<2000; i++) {
            const note = getSoloistNote(mockChord, fMinor, i, 440, 72, 'bird', i%4);
            if (note) {
                if (Array.isArray(note)) {
                    generatedMidi.push(...note.map(n => n.midi));
                } else {
                    generatedMidi.push(note.midi);
                }
            }
        }
        
        const hasDb = generatedMidi.some(m => m % 12 === 1);
        expect(hasDb).toBe(true); // Phrygian Dominant has b2
    });

    it('should respect the note budget', () => {
        // Mock a style with low budget
        // We can't inject a new style easily, but we can check if it breathes after some notes
        sb.notesInPhrase = 15; // scalar max is 12
        
        let rests = 0;
        for(let i=0; i<100; i++) {
            const note = getSoloistNote(mockChord, null, i, 440, 72, 'scalar', i%4);
            if (!note) rests++;
        }
        // With budget exceeded, restProb is significantly higher
        expect(rests).toBeGreaterThan(0);
    });

    it('should favor the root in Answer state at end of phrase', () => {
        sb.qaState = 'Answer';
        sb.currentPhraseSteps = 28; // Approaching end (max ~32)
        
        let notes = [];
        for(let i=0; i<1000; i++) {
            const note = getSoloistNote(mockChord, null, i, 440, 72, 'scalar', i%4);
            if (note) notes.push(note.midi % 12);
        }
        
        const rootCount = notes.filter(n => n === 0).length;
        const otherCount = notes.filter(n => n === 2).length; // 2nd (D)
        
        // Root should be significantly more frequent than a non-resolved note
        expect(rootCount).toBeGreaterThan(otherCount);
    });
});
