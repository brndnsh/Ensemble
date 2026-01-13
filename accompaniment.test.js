import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('./public/state.js', () => ({
    arranger: { 
        timeSignature: '4/4', 
        progression: []
    },
    gb: { genreFeel: 'Rock' },
    ctx: { 
        bandIntensity: 0.5, 
        complexity: 0.3,
        intent: { anticipation: 0, syncopation: 0, layBack: 0 }
    },
    cb: { enabled: true, style: 'smart' },
    bb: { enabled: false },
    sb: { enabled: false, busySteps: 0 }
}));

vi.mock('./public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    }
}));

import { getAccompanimentNotes, compingState } from './public/accompaniment.js';
import { cb, gb, arranger, bb } from './public/state.js';

describe('Accompaniment Engine', () => {
    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.00, 493.88], // Cmaj7
        quality: 'maj7',
        is7th: true,
        beats: 4
    };

    beforeEach(() => {
        arranger.progression = [mockChord];
        arranger.timeSignature = '4/4';
        compingState.lockedUntil = 0; // Reset lock for every test
        compingState.lastChordIndex = -1;
        cb.enabled = true;
        cb.style = 'smart';
        gb.genreFeel = 'Rock';
        bb.enabled = false;
    });

    describe('Style Logic', () => {
        it('should generate notes on the downbeat (step 0) by default', () => {
            for(let i=0; i<100; i++) {
                const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true, isGroupStart: true });
                expect(notes.length).toBeGreaterThan(0);
                expect(notes[0].midi).toBe(60); // Root
            }
        });

        it('should only play on the start of the chord in "pad" style', () => {
            cb.style = 'pad';
            // Step 0: start of chord
            const notes0 = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            expect(notes0.length).toBeGreaterThan(0);

            // Step 4: beat 2 of chord, should be silent in pad mode
            const notes4 = getAccompanimentNotes(mockChord, 4, 4, 4, { isBeatStart: true });
            // Might still return a dummy note for CC (sustain), but midi should be 0 or empty
            const playedNotes = notes4.filter(n => n.midi > 0);
            expect(playedNotes.length).toBe(0);
        });
    });

    describe('Genre-specific Scaling', () => {
        it('should use short durations for Funk/Reggae/Disco', () => {
            gb.genreFeel = 'Funk';
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const playedNotes = notes.filter(n => n.midi > 0);
            expect(playedNotes[0].durationSteps).toBe(1); // 4 * 0.25 = 1 step
            expect(playedNotes[0].dry).toBe(true);
        });

        it('should use longer durations for Acoustic', () => {
            gb.genreFeel = 'Acoustic';
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const playedNotes = notes.filter(n => n.midi > 0);
            expect(playedNotes[0].durationSteps).toBe(10); // 4 * 2.5 = 10 steps
        });
    });

    describe('Sustain Logic', () => {
        it('should generate CC 64 (Sustain) events on new chords', () => {
            // New chord trigger
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const sustainEvents = notes[0].ccEvents.filter(e => e.controller === 64);
            expect(sustainEvents.length).toBeGreaterThan(0);
            
            // Check for the "Off then On" sequence standard for chord changes
            expect(sustainEvents.some(e => e.value === 0)).toBe(true);
            expect(sustainEvents.some(e => e.value === 127)).toBe(true);
        });

        it('should disable sustain for staccato genres like Reggae', () => {
            gb.genreFeel = 'Reggae';
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const sustainEvents = notes[0].ccEvents.filter(e => e.controller === 64);
            // Reggae logic explicitly pushes a single "Off" event
            expect(sustainEvents.every(e => e.value === 0)).toBe(true);
        });
    });

    describe('Voicing Adjustments', () => {
        it('should perform rootless/fifthless reduction when bass is enabled in smart mode', () => {
            // Need a chord with 4 notes
            const richChord = { ...mockChord, freqs: [261.63, 329.63, 392.00, 493.88] }; 
            
            // Baseline: 4 notes (must be structural to avoid random reduction)
            const notesNormal = getAccompanimentNotes(richChord, 0, 0, 0, { isBeatStart: true, isGroupStart: true });
            expect(notesNormal.length).toBe(4);

            // With Bass: should reduce count (remove root and potentially 5th)
            bb.enabled = true;
            const notesRootless = getAccompanimentNotes(richChord, 16, 0, 0, { isBeatStart: true, isGroupStart: true });
            expect(notesRootless.length).toBeLessThan(4);
        });
    });
});
