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
        neo: { deviceProb: 1.0, cells: [0], allowedDevices: ['enclosure'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        shred: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        blues: { deviceProb: 1.0, cells: [0], allowedDevices: ['slide'], registerSoar: 5, restBase: 0.1, restGrowth: 0 },
        scalar: { deviceProb: 1.0, cells: [0], allowedDevices: ['run'], registerSoar: 5, restBase: 0.1, restGrowth: 0 }
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
import { sb, gb, ctx, arranger } from '../../../public/state.js';

describe('Soloist Engine Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
    const chordF = { rootMidi: 65, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
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
            for (let i = 0; i < 1000; i++) {
                sb.busySteps = 0;
                sb.isResting = false;
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
            for (let i = 0; i < 50; i++) {
                sb.busySteps = 0;
                sb.lastInterval = 7; 
                const result = getSoloistNote(chordC, null, 16, 440, 69, 'scalar', 0);
                if (result && result.midi < 69 && Math.abs(result.midi - 69) <= 2) downwardStepCount++;
            }
            expect(downwardStepCount).toBeGreaterThan(20);
        });
    });

    describe('Warm-up Logic', () => {
        it('should be more likely to rest at the very start of a session', () => {
            let startNotes = 0, endNotes = 0;
            const iterations = 1000;
            for (let i = 0; i < iterations; i++) {
                sb.sessionSteps = 0; sb.busySteps = 0;
                if (getSoloistNote(chordC, null, 16, 440, 72, 'scalar', 4)) startNotes++;
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
});
