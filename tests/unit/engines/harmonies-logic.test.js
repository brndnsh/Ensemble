/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    hb: { 
        enabled: true, volume: 0.4, complexity: 0.5, octave: 60, style: 'smart',
        motifBuffer: []
    },
    cb: { enabled: true, octave: 60, density: 'standard' },
    bb: { enabled: true, octave: 36 },
    sb: { enabled: true, isResting: false, notesInPhrase: 0, sessionSteps: 0, isReplayingMotif: false },
    ctx: { bandIntensity: 0.5, bpm: 120 },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: [],
        totalSteps: 64,
        stepMap: [],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Rock' }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
    }
}));

import { getHarmonyNotes } from '../../../public/harmonies.js';
import { hb, sb, gb, ctx, arranger } from '../../../public/state.js';

describe('Harmony Engine Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4, sectionId: 'A' };

    beforeEach(() => {
        gb.genreFeel = 'Funk';
        hb.style = 'smart';
        ctx.bandIntensity = 0.5;
        hb.complexity = 0.5;
        sb.enabled = true;
        sb.isResting = true;
        sb.notesInPhrase = 0;
    });

    describe('Core Generation', () => {
        it('should generate notes on pattern hits', () => {
            // Funk pattern 0 usually has a hit on step 3 (And of 1)
            let notes = [];
            for (let s = 0; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0) notes.push({ step: s, notes: res });
            }
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].notes[0]).toHaveProperty('midi');
            expect(notes[0].notes[0]).toHaveProperty('velocity');
        });

        it('should scale density with intensity', () => {
            ctx.bandIntensity = 0.1;
            hb.complexity = 0.1;
            const lowNotes = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);
            
            ctx.bandIntensity = 1.0;
            hb.complexity = 1.0;
            const highNotes = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);
            
            expect(highNotes.length).toBeGreaterThanOrEqual(lowNotes.length);
        });
    });

    describe('Soloist Awareness', () => {
        it('should play stabs when soloist is resting', () => {
            sb.isResting = true;
            gb.genreFeel = 'Funk';
            // Find a step that is a hit in Funk but NOT a downbeat (to distinguish from pads)
            let stabFound = false;
            for (let s = 1; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0 && res[0].durationSteps < 4) {
                    stabFound = true;
                    break;
                }
            }
            expect(stabFound).toBe(true);
        });

        it('should switch to pads when soloist is busy', () => {
            sb.isResting = false;
            sb.notesInPhrase = 10;
            
            const res = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);
            expect(res.length).toBeGreaterThan(0);
            expect(res[0].durationSteps).toBeGreaterThanOrEqual(4); // Pad duration
            
            // Should NOT play on offbeats where stabs usually are
            const offbeatRes = getHarmonyNotes(chordC, null, 3, 60, 'smart', 3);
            expect(offbeatRes.length).toBe(0);
        });
    });

    describe('Genre-Specific Rhythms', () => {
        it('should use Jazz rhythms in Jazz genre', () => {
            gb.genreFeel = 'Jazz';
            sb.isResting = true;
            
            let hitFound = false;
            for (let s = 0; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0) {
                    hitFound = true;
                    break;
                }
            }
            expect(hitFound).toBe(true);
        });
    });

    describe('Motif Consistency', () => {
        it('should use the same pattern for the same section', () => {
            const sectionA1 = { ...chordC, sectionId: 'A' };
            const sectionA2 = { ...chordC, sectionId: 'A' };
            
            const hits1 = [];
            for (let s = 0; s < 16; s++) {
                if (getHarmonyNotes(sectionA1, null, s, 60, 'smart', s).length > 0) hits1.push(s);
            }
            
            const hits2 = [];
            for (let s = 0; s < 16; s++) {
                if (getHarmonyNotes(sectionA2, null, s, 60, 'smart', s).length > 0) hits2.push(s);
            }
            
            expect(hits1).toEqual(hits2);
        });
    });

    describe('Soloist Hook Reinforcement', () => {
        it('should reinforce (latch onto) the soloist hook at high intensity', () => {
            sb.enabled = true;
            sb.isReplayingMotif = true;
            sb.sessionSteps = 128; // 8 bars into the jam
            ctx.bandIntensity = 0.8;

            const chord = { rootMidi: 60, symbol: 'Cmaj7', quality: 'major7', beats: 4, sectionId: 'A' };
            const soloistNote = { midi: 72, freq: 523.25 };

            const notes = getHarmonyNotes(chord, null, 0, 60, 'smart', 0, soloistNote);
            
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);
            // Build-up logic: at 128 steps, density should be boosted
            expect(notes.length).toBeGreaterThanOrEqual(2);
            // Should have a velocity boost
            expect(notes[0].velocity).toBeGreaterThan(0.6);
        });
    });
});
