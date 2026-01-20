/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, lastInterval: 0, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000, deviceBuffer: []
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
        scalar: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0, doubleStopProb: 0.1 }
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
            expect(primary).toHaveProperty('velocity');
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
            let notes = [];
            for(let i=0; i<500; i++) {
                sb.busySteps = 0;
                const note = getSoloistNote(chordC, null, i+32, 440, 72, 'scalar', i%4);
                if (note && !Array.isArray(note)) notes.push(note.midi % 12);
            }
            const rootCount = notes.filter(n => n === 0).length;
            const otherCount = notes.filter(n => n === 2).length;
            expect(rootCount).toBeGreaterThan(otherCount);
        });

        it('should anticipate the next chord on step 14 or 15', () => {
            const chordCmaj = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };
            let anticipated = false;
            for (let i = 0; i < 2000; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
                sb.tension = 0;
                const result = getSoloistNote(chordCmaj, chordF, 14, 440, 72, 'bird', 14);
                if (result) {
                    const note = Array.isArray(result) ? result[0] : result;
                    const pc = note.midi % 12;
                    // pc 10 (Bb) is in F major but NOT in C major
                    if (pc === 10) { anticipated = true; break; }
                }
            }
            expect(anticipated).toBe(true);
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
                    getSoloistNote(chordC, null, 16, 440, 72, t.style, 0);
                    if (sb.deviceBuffer.length > 0) { triggered = true; break; }
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
            let downwardStepCount = 0;
            for (let i = 0; i < 200; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
                sb.tension = 0;
                sb.lastInterval = 7; 
                const result = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0);
                if (result && result.midi < 69 && Math.abs(result.midi - 69) <= 2) downwardStepCount++;
            }
            expect(downwardStepCount).toBeGreaterThan(80);
        });
    });

    describe('Warm-up Logic', () => {
        it('should be more likely to rest at the very start of a session', () => {
            let startNotes = 0, endNotes = 0;
            const iterations = 1000;
            for (let i = 0; i < iterations; i++) {
                clearHarmonyMemory();
                sb.sessionSteps = 0; sb.busySteps = 0;
                if (getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 4)) startNotes++;
                
                clearHarmonyMemory();
                sb.sessionSteps = 1000; sb.busySteps = 0;
                if (getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 4)) endNotes++;
            }
            expect(endNotes).toBeGreaterThan(startNotes);
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
            // Aeolian (Natural Minor) has b6 (8), Dorian has 6 (9)
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
            
            // Start of session: should be conservative
            sb.sessionSteps = 1;
            sb.busySteps = 0;
            sb.motifBuffer = [];
            sb.isReplayingMotif = false;
            let noteCountStart = 0;
            for (let i = 0; i < 200; i++) {
                clearHarmonyMemory();
                sb.busySteps = 0;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) noteCountStart++;
            }

            // Deep into session (simulated maturity)
            sb.sessionSteps = 2048; 
            sb.busySteps = 0;
            sb.motifBuffer = [];
            sb.isReplayingMotif = false;
            let noteCountLate = 0;
            for (let i = 0; i < 200; i++) {
                clearHarmonyMemory();
                sb.busySteps = 0;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) noteCountLate++;
            }

            // maturityFactor should reduce rest probability and increase activity
            expect(noteCountLate).toBeGreaterThan(noteCountStart);
        });
    });

    describe('Structural Awareness', () => {
        it('should wrap up phrases and favor root/guide tones as section ends', () => {
            const sectionInfo = { sectionStart: 0, sectionEnd: 64 };
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            
            // At the end of a section (step 60-63 in a 64-step section)
            let noteCount = 0;
            let rootCount = 0;
            sb.sessionSteps = 10000;
            sb.busySteps = 0;
            sb.lastFreq = null;
            // Prime at step 60
            for(let p=0; p<100; p++) {
                sb.busySteps = 0;
                getSoloistNote(chord, null, 60, sb.lastFreq, 64, 'scalar', 12, false, sectionInfo);
            }

            for (let i = 0; i < 1000; i++) {
                sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                sb.currentCell = [1, 1, 1, 1];
                const note = getSoloistNote(chord, null, 60, sb.lastFreq, 64, 'scalar', 12, false, sectionInfo);
                if (note) {
                    noteCount++;
                    const primary = Array.isArray(note) ? note[0] : note;
                    if (primary.midi % 12 === 0) rootCount++;
                }
            }
            
            // Compare to mid-section
            let midNoteCount = 0;
            let midRootCount = 0;
            sb.sessionSteps = 10000;
            sb.busySteps = 0;
            sb.lastFreq = null;
            // Prime at step 16
            for(let p=0; p<100; p++) {
                sb.busySteps = 0;
                getSoloistNote(chord, null, 16, sb.lastFreq, 64, 'scalar', 0, false, { sectionStart: 0, sectionEnd: 64 });
            }

            for (let i = 0; i < 1000; i++) {
                sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                sb.currentCell = [1, 1, 1, 1];
                const note = getSoloistNote(chord, null, 16, sb.lastFreq, 64, 'scalar', 0, false, { sectionStart: 0, sectionEnd: 64 });
                if (note) {
                    midNoteCount++;
                    const primary = Array.isArray(note) ? note[0] : note;
                    if (primary.midi % 12 === 0) midRootCount++;
                }
            }
            
            // At section end, it should be MORE likely to favor the root if it plays
            const rootRatioEnd = rootCount / noteCount;
            const rootRatioMid = midRootCount / midNoteCount;
            expect(rootRatioEnd).toBeGreaterThan(rootRatioMid);
        });

        it('should be more likely to rest approaching the section boundary', () => {
             const sectionInfo = { sectionStart: 0, sectionEnd: 64 };
             const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };

             let midNoteCount = 0;
             for (let i = 0; i < 1000; i++) {
                 sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                 if (getSoloistNote(chord, null, 16, 440, 72, 'scalar', 0, false, sectionInfo)) midNoteCount++;
             }

             let endNoteCount = 0;
             for (let i = 0; i < 1000; i++) {
                 sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 16;
                 // Step 62 is very close to end (64)
                 if (getSoloistNote(chord, null, 62, 440, 72, 'scalar', 14, false, sectionInfo)) endNoteCount++;
             }

             expect(midNoteCount).toBeGreaterThan(endNoteCount);
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
            // 1. Record a motif over C Major (Root 60)
            const chordC = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            // Simulate a note at MIDI 64 (E) with a 1-semitone scoop (starts at 63/Eb)
            const recordedNote = { midi: 64, bendStartInterval: 1, durationSteps: 4 };
            sb.motifBuffer = [recordedNote];
            sb.motifRoot = 0;
            sb.isReplayingMotif = true;
            sb.motifReplayIndex = 0;

            // replay over G Minor (Root 67)
            // Transposition shift is -5. Target would be 64 - 5 = 59 (B natural).
            // But G Minor scale [0, 2, 3, 5, 7, 8, 10] doesn't have B natural.
            // Nearest is 58 (Bb). Nudge = -1.
            const chordGm = { rootMidi: 67, quality: 'minor', intervals: [0, 3, 7], beats: 4 };
            
            // Force scalar style for predictable scale
            const replayed = getSoloistNote(chordGm, null, 16, 440, 72, 'scalar', 0);
            
            expect(replayed.midi).toBe(58); // Nudged from 59 to 58
            // Original interval was 1. Nudge was -1. 1 + (-1) = 0.
            expect(replayed.bendStartInterval).toBe(0); 
        });
    });

    describe('Double Stop Generation', () => {
        it('should return an array of notes when double stops are triggered', () => {
            sb.doubleStops = true;
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            
            let arrayFound = false;
            // STYLE_CONFIG for scalar has doubleStopProb: 0.1
            // Let's use bird style which has high anticipationProb but low doubleStopProb (0.05)
            // Wait, STYLE_CONFIG blues has 0.35 doubleStopProb.
            
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
                const res = getSoloistNote(chord, null, 16, 440, 72, 'blues', 0);
                if (Array.isArray(res)) {
                    arrayFound = true;
                    expect(res.length).toBeGreaterThan(1);
                    break;
                }
            }
            expect(arrayFound).toBe(true);
        });
    });

    describe('Register Build Logic', () => {
        it('should bias towards a lower register at the start of a session', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            
            // Start of session
            sb.sessionSteps = 1;
            sb.busySteps = 0;
            sb.tension = 0; // Prevent soaring bias
            sb.lastFreq = null; // Prevent bias from mock
            let startMidis = [];
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                const note = getSoloistNote(chord, null, i * 4, sb.lastFreq, 64, 'bird', 0);
                if (note && !Array.isArray(note)) {
                    startMidis.push(note.midi);
                    sb.lastFreq = 440 * Math.pow(2, (note.midi - 69) / 12);
                }
            }
            const avgStart = startMidis.reduce((a, b) => a + b, 0) / startMidis.length;

            // Matured session
            sb.sessionSteps = 10000;
            sb.busySteps = 0;
            sb.tension = 0; 
            sb.lastFreq = null; // Reset for matured run too
            
            // Prime to stabilize register at matured level
            for(let p=0; p<100; p++) {
                sb.busySteps = 0;
                getSoloistNote(chord, null, p*4, sb.lastFreq, 64, 'bird', 0);
            }

            let maturedMidis = [];
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                const note = getSoloistNote(chord, null, i * 4, sb.lastFreq, 64, 'bird', 0);
                if (note && !Array.isArray(note)) {
                    maturedMidis.push(note.midi);
                    sb.lastFreq = 440 * Math.pow(2, (note.midi - 69) / 12);
                }
            }
            const avgMatured = maturedMidis.reduce((a, b) => a + b, 0) / maturedMidis.length;

            expect(avgMatured).toBeGreaterThan(avgStart);
        });
    });
});
