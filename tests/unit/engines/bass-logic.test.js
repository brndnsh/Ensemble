/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    bb: { 
        enabled: true, 
        busySteps: 0, 
        lastFreq: 440,
        volume: 0.5,
        pocketOffset: 0,
        buffer: new Map(),
        style: 'smart'
    },
    sb: { 
        enabled: true, 
        busySteps: 0, 
        tension: 0,
        buffer: new Map()
    },
    gb: { 
        genreFeel: 'Rock',
        measures: 1,
        lastDrumPreset: 'Standard',
        instruments: [
            { name: 'Kick', steps: new Array(16).fill(0), muted: false }
        ]
    },
    ctx: { bandIntensity: 0.5, bpm: 120 },
    cb: { practiceMode: false },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        timeSignature: '4/4',
        stepMap: [{ start: 0, end: 64, chord: { sectionId: 's1', rootMidi: 48, quality: '7', beats: 4 } }]
    }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    },
    REGGAE_RIDDIMS: {}
}));

import { getBassNote, isBassActive, getScaleForBass } from '../../../public/bass.js';
import { bb, sb, gb, ctx, arranger } from '../../../public/state.js';

describe('Bass Engine Logic', () => {
    const chordC = { rootMidi: 48, intervals: [0, 4, 7, 10], quality: '7', beats: 4, sectionId: 's1', bassMidi: null };
    const chordF = { rootMidi: 53, intervals: [0, 4, 7, 10], quality: '7', beats: 4, sectionId: 's1', bassMidi: null };

    beforeEach(() => {
        bb.busySteps = 0;
        sb.busySteps = 0;
        sb.tension = 0;
        ctx.bandIntensity = 0.5;
        gb.genreFeel = 'Rock';
        gb.instruments[0].steps.fill(0);
    });

    describe('Style Mapping & Activation', () => {
        it('should map genres to internal styles correctly', () => {
            gb.genreFeel = 'Rock';
            expect(isBassActive('smart', 0, 0)).toBe(true);
            expect(isBassActive('smart', 2, 2)).toBe(true);
            expect(isBassActive('smart', 1, 1)).toBe(false); 

            gb.genreFeel = 'Jazz';
            expect(isBassActive('smart', 0, 0)).toBe(true);
            expect(isBassActive('smart', 4, 4)).toBe(true);
        });

        it('should return a Root note frequency on the downbeat (step 0)', () => {
            const result = getBassNote(chordC, null, 0, null, 38, 'rock', 0, 0, 0);
            expect(result).not.toBeNull();
            expect(result.midi % 12).toBe(0); // C
        });

        it('should stay within a reasonable range of the center MIDI', () => {
            const center = 38;
            for(let i=0; i<50; i++) {
                const result = getBassNote(chordC, null, 0, null, center, 'rock', 0, 0, 0);
                expect(result.midi).toBeGreaterThanOrEqual(center - 15);
                expect(result.midi).toBeLessThanOrEqual(center + 15);
            }
        });
    });

    describe('Intelligence & Contextual Awareness', () => {
        it('should mirror the Kick drum pattern in rock style', () => {
            gb.instruments[0].steps[0] = 2;
            gb.instruments[0].steps[4] = 1;
            
            const hitResult = getBassNote(chordC, null, 1, 110, 38, 'rock', 0, 4, 4);
            expect(hitResult).not.toBeNull();
            expect(hitResult.velocity).toBeGreaterThan(1.1);

            ctx.bandIntensity = 0.1;
            let silentCount = 0;
            for (let i = 0; i < 20; i++) {
                if (getBassNote(chordC, null, 0.25, 110, 38, 'rock', 0, 1, 1) === null) silentCount++;
            }
            expect(silentCount).toBeGreaterThan(0);
        });

        it('should reduce complexity when the soloist is busy', () => {
            gb.genreFeel = 'Funk';
            sb.busySteps = 4;
            expect(getBassNote(chordC, null, 0.25, 110, 38, 'funk', 0, 1, 1)).toBeNull();

            let rootOrFifthCount = 0;
            let totalNotes = 0;
            for (let i = 0; i < 100; i++) {
                const result = getBassNote(chordC, null, 1, 110, 38, 'quarter', 0, 4, 4);
                if (result) {
                    totalNotes++;
                    const interval = (result.midi - chordC.rootMidi + 120) % 12;
                    if (interval === 0 || interval === 7) rootOrFifthCount++;
                }
            }
            expect(rootOrFifthCount / totalNotes).toBeGreaterThan(0.7);
        });

        it('should boost velocity for "Pop" articulation in funk at high intensity', () => {
            ctx.bandIntensity = 0.9;
            gb.instruments[0].steps[2] = 1;
            const result = getBassNote(chordC, null, 0.5, 110, 38, 'funk', 0, 2, 2);
            expect(result).not.toBeNull();
            expect(result.velocity).toBeGreaterThanOrEqual(1.2);
        });
    });

    describe('Jazz Walking Logic', () => {
        it('should landing on the 5th on beat 3 frequently', () => {
            let fifthCount = 0;
            for (let i = 0; i < 50; i++) {
                const result = getBassNote(chordC, chordF, 2, 38, 38, 'quarter', 0, 8, 8);
                if (result.midi % 12 === 7) fifthCount++; 
            }
            expect(fifthCount).toBeGreaterThan(2);
        });

        it('should use a chromatic approach on beat 4 leading to the next chord', () => {
            gb.genreFeel = 'Jazz';
            let chromaticCount = 0;
            for (let i = 0; i < 500; i++) {
                const result = getBassNote(chordC, chordF, 3, null, 38, 'quarter', 0, 12, 12);
                const pc = result.midi % 12;
                if (pc === 4 || pc === 6) chromaticCount++;
            }
            expect(chromaticCount).toBeGreaterThan(40);
        });

        it('should respect slash chord bass notes', () => {
            const slashChord = { ...chordC, bassMidi: 40 }; // C/E
            const result = getBassNote(slashChord, chordF, 0, null, 38, 'quarter', 0, 0, 0);
            expect(result.midi % 12).toBe(4);
        });

        it('should prefer stepwise movement on intermediate beats', () => {
            let stepwiseCount = 0;
            const prevMidi = 38; 
            for (let i = 0; i < 100; i++) {
                const result = getBassNote(chordC, chordF, 1, 440 * Math.pow(2, (prevMidi - 69) / 12), 38, 'quarter', 0, 4, 4);
                const diff = Math.abs(result.midi - prevMidi);
                if (diff <= 2) stepwiseCount++;
            }
            expect(stepwiseCount).toBeGreaterThan(60);
        });

        it('should vary intensity-based register in quarter style', () => {
            let highCount = 0;
            ctx.bandIntensity = 1.0; 
            for (let i = 0; i < 100; i++) {
                // Step 63 in 64 total steps
                const result = getBassNote(chordC, chordF, 0, null, 38, 'quarter', 0, 63, 63);
                if (result.midi >= 48) highCount++;
            }
            expect(highCount).toBeGreaterThan(50);
        });
    });

    describe('Harmonic Integrity', () => {
        it('should use Aeolian for vi chord in Neo-Soul to avoid clashes', () => {
            const viChord = { rootMidi: 57, quality: 'minor', intervals: [0, 3, 7], key: 'C' };
            const scale = getScaleForBass(viChord, null);
            expect(scale).toContain(8);
            expect(scale).not.toContain(9);
        });
    });

    describe('Overlap Prevention', () => {
        const checkOverlaps = (style) => {
            const activeNotes = [];
            let maxOverlaps = 0;
            for (let step = 0; step < 64; step++) {
                if (step % 16 === 0) activeNotes.length = 0;
                for (let i = activeNotes.length - 1; i >= 0; i--) {
                    if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
                }
                if (isBassActive(style, step, step % 16)) {
                    const result = getBassNote(chordC, null, (step % 16) / 4, 440, 38, style, 0, step, step % 16);
                    if (result) activeNotes.push({ endStep: step + result.durationSteps });
                }
                maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
            }
            return maxOverlaps;
        };

        it('should not have overlapping notes in Rock style', () => {
            expect(checkOverlaps('rock')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Jazz Walking style', () => {
            expect(checkOverlaps('quarter')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Funk style', () => {
            expect(checkOverlaps('funk')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Disco style', () => {
            expect(checkOverlaps('disco')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Neo-Soul style', () => {
            expect(checkOverlaps('neo')).toBeLessThanOrEqual(1);
        });
    });
});
