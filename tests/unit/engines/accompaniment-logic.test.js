import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => ({
    arranger: { 
        timeSignature: '4/4', 
        progression: []
    },
    gb: { genreFeel: 'Rock' },
    ctx: { 
        bandIntensity: 0.5, 
        complexity: 0.5,
        intent: { anticipation: 0, syncopation: 0, layBack: 0 }
    },
    cb: { enabled: true, style: 'smart' },
    bb: { enabled: false },
    sb: { enabled: false, busySteps: 0 }
}));

vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] },
        '3/4': { beats: 3, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getAccompanimentNotes, compingState, generateCompingPattern } from '../../../public/accompaniment.js';
import { cb, gb, arranger, bb, ctx } from '../../../public/state.js';

describe('Accompaniment Engine Logic', () => {
    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.00, 493.88], // Cmaj7
        quality: 'maj7',
        is7th: true,
        beats: 4
    };

    beforeEach(() => {
        vi.clearAllMocks();
        arranger.progression = [mockChord];
        arranger.timeSignature = '4/4';
        compingState.lockedUntil = 0; 
        compingState.lastChordIndex = -1;
        cb.enabled = true;
        cb.style = 'smart';
        gb.genreFeel = 'Rock';
        bb.enabled = false;
        ctx.bandIntensity = 0.5;
        ctx.complexity = 0.5;
    });

    describe('Generation & Styles', () => {
        it('should generate notes on the downbeat (step 0) by default', () => {
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true, isGroupStart: true });
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].midi).toBe(60); 
        });

        it('should only play on the start of the chord in "pad" style', () => {
            cb.style = 'pad';
            expect(getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true }).filter(n => n.midi > 0).length).toBeGreaterThan(0);
            expect(getAccompanimentNotes(mockChord, 4, 4, 4, { isBeatStart: true }).filter(n => n.midi > 0).length).toBe(0);
        });

        it('should generate CC 64 (Sustain) events on new chords', () => {
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const sustainEvents = notes[0].ccEvents.filter(e => e.controller === 64);
            expect(sustainEvents.some(e => e.value === 0)).toBe(true);
            expect(sustainEvents.some(e => e.value === 127)).toBe(true);
        });
    });

    describe('Genre-specific Logic', () => {
        it('should use short durations for Funk and disable sustain for Reggae', () => {
            gb.genreFeel = 'Funk';
            const funkNotes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true }).filter(n => n.midi > 0);
            if (funkNotes.length > 0) expect([0.4, 0.2, 0.1]).toContain(funkNotes[0].durationSteps);

            gb.genreFeel = 'Reggae';
            const reggaeNotes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            expect(reggaeNotes[0].ccEvents.filter(e => e.controller === 64).every(e => e.value === 0)).toBe(true);
        });

        it('should perform rootless reduction when bass is enabled', () => {
            const notesNormal = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true, isGroupStart: true });
            bb.enabled = true;
            const notesRootless = getAccompanimentNotes(mockChord, 16, 0, 0, { isBeatStart: true, isGroupStart: true });
            expect(notesRootless.length).toBeLessThan(notesNormal.length);
        });
    });

    describe('Procedural Pattern Generation', () => {
        it('should generate a 16-step pattern and increase density with intensity', () => {
            const pattern = generateCompingPattern('Rock', 'balanced', 16);
            expect(pattern).toHaveLength(16);

            const sparse = generateCompingPattern('Rock', 'sparse', 16).filter(n => n === 1).length;
            const active = generateCompingPattern('Rock', 'active', 16).filter(n => n === 1).length;
            expect(active).toBeGreaterThanOrEqual(sparse);
        });

        it('should generate Jazz Charleston rhythm', () => {
            let foundCharleston = false;
            for(let i=0; i<100; i++) {
                const p = generateCompingPattern('Jazz', 'balanced', 16);
                if (p[0] === 1 && p[7] === 1) { foundCharleston = true; break; }
            }
            expect(foundCharleston).toBe(true);
        });
    });
});
