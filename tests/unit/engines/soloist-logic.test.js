/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, lastInterval: 0, hookRetentionProb: 0.5, doubleStops: true,
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
        neo: { deviceProb: 1.0, cells: [0], allowedDevices: ['enclosure'], registerSoar: 5, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.1 },
        shred: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.05 },
        blues: { deviceProb: 1.0, cells: [0], allowedDevices: ['slide'], registerSoar: 5, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.35 },
        scalar: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.1, maxNotesPerPhrase: 16 },
        bird: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 15, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.05, maxNotesPerPhrase: 48 }
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
        }
    };
});

import { getSoloistNote, getScaleForChord } from '../../../public/soloist.js';
import { clearHarmonyMemory } from '../../../public/harmonies.js';
import { getFrequency, getMidi } from '../../../public/utils.js';
import { sb, gb, ctx, arranger } from '../../../public/state.js';

describe('Soloist Engine Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
    const chordF = { rootMidi: 65, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        clearHarmonyMemory();
        sb.isResting = false;
        sb.currentPhraseSteps = 1;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
        sb.lastInterval = 0;
        sb.sessionSteps = 1000;
        sb.tension = 0;
        sb.currentCell = [1, 1, 1, 1];
        sb.deterministic = false;
        gb.genreFeel = 'Rock';
    });

    describe('Core Generation & Phrasing', () => {
        it('should generate a note object when playing', () => {
            let note = null;
            for(let i=0; i<100; i++) {
                note = getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 0);
                if (note) break;
            }
            expect(note).not.toBeNull();
            const primary = Array.isArray(note) ? note[note.length - 1] : note;
            expect(primary).toHaveProperty('midi');
        });

        it('should respect the note budget', () => {
            sb.notesInPhrase = 20; 
            let rests = 0;
            for(let i=0; i<100; i++) {
                if (!getSoloistNote(chordC, null, i+32, 440, 72, 'scalar', i%4)) rests++;
            }
            expect(rests).toBeGreaterThan(0);
        });

        it('should favor the root in Answer state at end of phrase', () => {
            sb.qaState = 'Answer';
            sb.currentPhraseSteps = 28;
            sb.busySteps = 0;
            
            const weights = getSoloistNote(chordC, null, 32, 440, 72, 'scalar', 0, 'audit');
            expect(weights[60]).toBeGreaterThan(weights[62]);
            expect(weights[72]).toBeGreaterThan(weights[74]);
        });

        it('should anticipate the next chord on step 14 or 15', () => {
             // Mock random to force anticipation check
             const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
             const chordCmaj = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };
             
             // In scalar style, anticipationProb is 0.1
             // Step 14 is late enough to trigger anticipation
             const weights = getSoloistNote(chordCmaj, chordF, 14, 440, 72, 'scalar', 14, 'audit');
             
             // F (65) is in next chord (chordF) but not in chordCmaj scale.
             // If anticipated, F should have high weight.
             expect(weights[65]).toBeGreaterThan(100);
             spy.mockRestore();
        });
    });

    describe('Melodic Devices', () => {
        it('should trigger melodic devices (Enclosures, Runs, Slides)', () => {
            const deviceTests = [
                { style: 'neo', label: 'Quartal/Enclosure' },
                { style: 'blues', label: 'Slide' },
                { style: 'shred', label: 'Run' }
            ];

            deviceTests.forEach(t => {
                let triggered = false;
                for (let i = 0; i < 500; i++) {
                    sb.deviceBuffer = [];
                    sb.busySteps = 0;
                    sb.isResting = false;
                    sb.currentPhraseSteps = 1;
                    const res = getSoloistNote(chordC, null, 16, 440, 72, t.style, 0);
                    // Check buffer OR immediate double stop result (Quartal/GuitarDouble)
                    if (sb.deviceBuffer.length > 0 || (Array.isArray(res) && res.some(n => n.isDoubleStop))) { triggered = true; break; }
                }
                expect(triggered, `Failed to trigger ${t.label} for ${t.style}`).toBe(true);
            });
        });
    });

    describe('Style-Specific Logic', () => {
        it('should prioritize Bebop phrasing for Bird style', () => {
            let durations = [];
            for (let i = 0; i < 200; i++) {
                const result = getSoloistNote(chordC, null, i+32, 440, 72, 'bird', i % 16);
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach(n => durations.push(n.durationSteps));
                }
            }
            const shortNotes = durations.filter(d => d <= 2).length;
            expect(shortNotes / durations.length).toBeGreaterThan(0.6);
        });

        it('should generate staccato notes for Funk', () => {
            let shortNotes = 0;
            let played = 0;
            for (let i = 0; i < 100; i++) {
                sb.busySteps = 0;
                const note = getSoloistNote(chordC, chordC, i+32, 261.63, 72, 'smart');
                if (note) {
                    played++;
                    if (note.durationSteps <= 1) shortNotes++;
                }
            }
            if (played > 0) expect(shortNotes / played).toBeGreaterThan(0.5);
        });
    });

    describe('Melodic Contour & Skip Resolution', () => {
        it('should resolve a large upward skip with a downward step', () => {
            sb.lastInterval = 7; 
            const weights = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0, 'audit');
            
            // Should resolve downward step (e.g. 69 -> 67 or 68)
            // Weight for a note 1-2 semitones below should be huge
            expect(weights[67]).toBeGreaterThan(2000);
            // expect(weights[68]).toBeGreaterThan(50000); // 68 is Ab, not in C Major scale.
            // Weight for continuing upward should be penalized
            expect(weights[71]).toBeLessThan(100);
        });
    });

    describe('Integrity & Overlaps', () => {
        it('should respect double stop toggle', () => {
            sb.doubleStops = false;
            let arrayFound = false;
            for (let i = 0; i < 500; i++) {
                sb.busySteps = 0;
                if (Array.isArray(getSoloistNote(chordC, null, i+32, 440, 72, 'blues', i % 16))) {
                    arrayFound = true; break;
                }
            }
            expect(arrayFound).toBe(false);
        });

        it('should limit overlapping notes', () => {
            const activeNotes = [];
            let maxOverlaps = 0;
            for (let step = 0; step < 200; step++) {
                for (let i = activeNotes.length - 1; i >= 0; i--) {
                    if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
                }
                const result = getSoloistNote(chordC, null, step + 16, 440, 72, 'scalar', step % 16);
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach(n => activeNotes.push({ endStep: step + n.durationSteps }));
                }
                maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
            }
            expect(maxOverlaps).toBeLessThanOrEqual(3);
        });
    });

    describe('Scale Selection & Harmonic Integrity', () => {
        it('should select Altered scale when tension is high', () => {
            sb.tension = 0.8;
            expect(getScaleForChord(chordC, null, 'bird')).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });

        it('should select Phrygian Dominant for V7 to minor resolution', () => {
            const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10], quality: '7' };
            const Cm = { rootMidi: 60, intervals: [0, 3, 7], quality: 'minor' };
            expect(getScaleForChord(G7, Cm, 'bird')).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });

        it('should use Aeolian for vi chord in Neo-Soul to avoid clashes', () => {
            const viChord = { rootMidi: 57, quality: 'minor', intervals: [0, 3, 7], key: 'C' };
            const scale = getScaleForChord(viChord, null, 'neo');
            expect(scale).toContain(8);
            expect(scale).not.toContain(9);
        });
    });

    describe('Neo-Soul Phrasing Logic', () => {
        it('should produce sustained notes and soulful scoops', () => {
            let sustained = 0, scoops = 0, total = 0;
            for (let i = 0; i < 500; i++) {
                sb.isResting = false; sb.busySteps = 0; sb.notesInPhrase = 0;
                sb.currentCell = [1, 1, 1, 1];
                const res = getSoloistNote(chordC, null, 16, 440, 72, 'neo', 0);
                if (res) {
                    total++;
                    if (res.durationSteps >= 4) {
                        sustained++;
                        if (res.bendStartInterval > 0) scoops++;
                    }
                }
            }
            expect(sustained / total).toBeGreaterThan(0.7);
            expect(scoops / sustained).toBeGreaterThan(0.1);
        });
    });

    describe('Session Maturity', () => {
        it('should become more active as session maturity increases', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed randomness for phrased rest checks
            
            // Conservative start
            sb.sessionSteps = 0;
            sb.busySteps = 0;
            let noteCountStart = 0;
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) noteCountStart++;
            }

            // Matured start
            sb.sessionSteps = 10000;
            sb.busySteps = 0;
            let noteCountLate = 0;
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) noteCountLate++;
            }

            expect(noteCountLate).toBeGreaterThan(noteCountStart);
            spy.mockRestore();
        });
    });

    describe('Structural Awareness', () => {
        it('should wrap up phrases and favor root/guide tones as section ends', () => {
            const sectionInfo = { sectionStart: 0, sectionEnd: 64 };
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            
            // Section End weights
            const endWeights = Float32Array.from(getSoloistNote(chord, null, 60, 440, 64, 'scalar', 12, 'audit', sectionInfo));
            // Mid section weights
            const midWeights = Float32Array.from(getSoloistNote(chord, null, 16, 440, 64, 'scalar', 0, 'audit', sectionInfo));
            
            // Root (60) should have significantly higher relative weight at section end
            expect(endWeights[60]).toBeGreaterThan(midWeights[60] * 10);
        });

        it('should be more likely to rest approaching the section boundary', () => {
             const sectionInfo = { sectionStart: 0, sectionEnd: 64 };
             const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
             const spy = vi.spyOn(Math, 'random').mockReturnValue(0.6); // Threshold for rest checks

             let midNoteCount = 0;
             for (let i = 0; i < 500; i++) {
                 sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                 if (getSoloistNote(chord, null, 16, 440, 72, 'scalar', 0, false, sectionInfo)) midNoteCount++;
             }

             let endNoteCount = 0;
             for (let i = 0; i < 500; i++) {
                 sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                 if (getSoloistNote(chord, null, 62, 440, 72, 'scalar', 14, false, sectionInfo)) endNoteCount++;
             }

             expect(midNoteCount).toBeGreaterThan(endNoteCount);
             spy.mockRestore();
        });
    });

    describe('Motif & Bend Integrity', () => {
        it('should generate positive bendStartInterval for scoops (starting below target)', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            let scoops = 0;
            for (let i = 0; i < 500; i++) {
                sb.isResting = false; sb.busySteps = 0; sb.notesInPhrase = 0;
                sb.currentCell = [1, 1, 1, 1];
                const res = getSoloistNote(chord, null, 16, 440, 72, 'neo', 0);
                if (res && res.bendStartInterval > 0) scoops++;
            }
            expect(scoops).toBeGreaterThan(0);
        });

        it('should adjust bendStartInterval when nudging motif notes for scale compliance', () => {
            const recordedNote = { midi: 64, bendStartInterval: 1, durationSteps: 4 };
            sb.motifBuffer = [recordedNote];
            sb.motifRoot = 0;
            sb.isReplayingMotif = true;
            sb.motifReplayIndex = 0;

            const chordGm = { rootMidi: 67, quality: 'minor', intervals: [0, 3, 7], beats: 4 };
            const replayed = getSoloistNote(chordGm, null, 16, 440, 72, 'scalar', 0);
            
            // Gm scale: G(67), A(69), Bb(70), C(72), D(74), Eb(75), F(77)
            // Shift 0->67 is +67. 64+67 = 131... too high.
            // Let's use simpler test: Chord Gm root 67. Motif root C 60. Shift is +7.
            // 64+7 = 71 (B). B is NOT in G minor (Dorian). Nudge to 70 (Bb).
            // bendStart 1 nudged to 0.
            // The smart shift logic (shift > 6 -> shift -= 12) converts +7 to -5.
            // 64 - 5 = 59 (B). Nearest in Gm is Bb (58).
            expect(replayed.midi).toBe(58);
            expect(replayed.bendStartInterval).toBe(0); 
        });
    });

    describe('Double Stop Generation', () => {
        it('should return an array of notes when double stops are triggered', () => {
            sb.doubleStops = true;
            let arrayFound = false;
            for (let i = 0; i < 2000; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
                const res = getSoloistNote(chordC, null, 16, 440, 72, 'blues', 0);
                if (Array.isArray(res)) {
                    arrayFound = true;
                    break;
                }
            }
            expect(arrayFound).toBe(true);
        });
    });

    describe('Melodic Variety & Repetition', () => {
        it('should not get stuck on F4 (65) in Standard Pop progression', () => {
            // C | G | Am | F
            const prog = [
                { rootMidi: 60, intervals: [0, 4, 7], quality: 'major' }, // C
                { rootMidi: 67, intervals: [0, 4, 7, 10], quality: '7' }, // G7 (F is 7th)
                { rootMidi: 69, intervals: [0, 3, 7], quality: 'minor' }, // Am
                { rootMidi: 65, intervals: [0, 4, 7], quality: 'major' }  // F (F is Root)
            ];

            let f4Count = 0;
            let totalNotes = 0;
            let lastFreq = 261.63; // C4

            // Simulate 4 bars, 16 steps each
            for (let bar = 0; bar < 4; bar++) {
                const chord = prog[bar];
                const nextChord = prog[(bar + 1) % 4];
                
                for (let step = 0; step < 16; step++) {
                    const res = getSoloistNote(chord, nextChord, step + (bar * 16), lastFreq, 64, 'scalar', step);
                    if (res) {
                        const note = Array.isArray(res) ? res[0] : res;
                        if (note.midi === 65) f4Count++;
                        totalNotes++;
                        lastFreq = getFrequency(note.midi);
                    }
                }
            }
            // If F4 is > 40% of notes, that's too repetitive
            expect(f4Count / totalNotes).toBeLessThan(0.4);
        });

        it('should avoid sequential repetition (stuttering)', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            let lastFreq = 261.63; // C4
            let repeats = 0;
            let total = 0;
            let lastMidi = 60;

            // Force low motif prob to test generation logic only
            sb.motifBuffer = []; 

            for(let i=0; i<50; i++) {
                 // Ensure we don't trigger Rest/Motif logic
                 sb.isResting = false;
                 sb.currentPhraseSteps = 1; // Keep phrase active
                 
                 const res = getSoloistNote(chord, null, i, lastFreq, 64, 'scalar', i);
                 if (res) {
                     const note = Array.isArray(res) ? res[0] : res;
                     if (note.midi === lastMidi) repeats++;
                     lastMidi = note.midi;
                     lastFreq = getFrequency(note.midi);
                     total++;
                 }
            }
            
            // Allow some repeats, but not > 50%
            expect(repeats / total).toBeLessThan(0.5);
        });
    });

    describe('Register Build Logic', () => {
        it('should bias towards a lower register at the start of a session', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            
            // Audit weights at start vs matured
            sb.sessionSteps = 1;
            sb.tension = 0;
            sb.smoothedTension = 0;
            const startWeights = Float32Array.from(getSoloistNote(chord, null, 0, 440, 64, 'bird', 0, 'audit'));
            
            sb.sessionSteps = 10000;
            sb.tension = 1.0;
            sb.smoothedTension = 1.0; // Force immediate tension for test
            const maturedWeights = Float32Array.from(getSoloistNote(chord, null, 0, 440, 64, 'bird', 0, 'audit'));
            
            // High MIDI notes (e.g. 84) should have much higher weight in matured state
            expect(maturedWeights[84]).toBeGreaterThan(startWeights[84]);
        });
    });
});
