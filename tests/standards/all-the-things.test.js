import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000
    },
    cb: { enabled: true, octave: 60, density: 'standard', practiceMode: false },
    ctx: { bandIntensity: 0.5, bpm: 135, audio: { currentTime: 0 } },
    arranger: { 
        key: 'Ab', 
        isMinor: false,
        progression: [],
        totalSteps: 0,
        stepMap: [],
        timeSignature: '4/4',
        sections: []
    },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true }
}));

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11]
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote, getScaleForChord } from '../../public/soloist.js';
import { validateProgression } from '../../public/chords.js';
import { arranger, sb } from '../../public/state.js';

describe('Jazz Standard Test: All The Things You Are', () => {
    
    beforeEach(() => {
        arranger.key = 'Ab';
        arranger.isMinor = false;
        
        // Using the new multi-section format with seamless transitions for key changes
        arranger.sections = [
            { id: 'A1', label: "A (Ab)", key: "Ab", value: "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7" },
            { id: 'A2', label: "A (C)", key: "C", value: "Dm7 | G7 | Cmaj7", seamless: true },
            { id: 'A3', label: "A2 (Eb)", key: "Eb", value: "Cm7 | Fm7 | Bb7 | Ebmaj7 | Abmaj7" },
            { id: 'A4', label: "A2 (G)", key: "G", value: "Am7 | D7 | Gmaj7", seamless: true },
            { id: 'B1', label: "B (G)", key: "G", value: "Am7 | D7 | Gmaj7 | Gmaj7" },
            { id: 'B2', label: "B (E)", key: "E", value: "F#m7b5 | B7 | Emaj7 | C7alt", seamless: true },
            { id: 'A5', label: "A3 (Ab)", key: "Ab", value: "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dbm7 | Cm7 | Bdim7 | Bbm7 | Eb7 | Abmaj7 | Abmaj7" }
        ];
        validateProgression();
        
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
    });

    it('should navigate the Cycle of Fifths in the first 5 bars', () => {
        const progression = arranger.progression;
        
        // 1. Fm7 (vi7) -> Aeolian/Dorian (Relative to Ab)
        const scaleFm = getScaleForChord(progression[0], progression[1], 'bird');
        // Fm7 to Bbm7 is i-iv movement basically. Dorian works best.
        // F, G, Ab, Bb, C, D, Eb (Dorian has natural 6th D)
        // Or Aeolian: F, G, Ab, Bb, C, Db, Eb
        // In Jazz (Bird style), Dorian is default for minor 7s
        expect(scaleFm).toContain(2); // G (9)
        expect(scaleFm).toContain(3); // Ab (b3)
        expect(scaleFm).toContain(10); // Eb (b7)

        // 2. Eb7 (V7) -> Mixolydian (Resolving to Abmaj7)
        const scaleEb = getScaleForChord(progression[2], progression[3], 'bird');
        // Eb, F, G, Ab, Bb, C, Db
        expect(scaleEb).toEqual([0, 2, 4, 5, 7, 9, 10]); 

        // 3. Abmaj7 (Imaj7) -> Ionian
        const scaleAb = getScaleForChord(progression[3], progression[4], 'bird');
        expect(scaleAb).toEqual([0, 2, 4, 5, 7, 9, 11]);
    });

    it('should switch to C Major scale during the modulation (Dm7-G7-Cmaj7)', () => {
        // This modulation occurs at bar 6
        // Dm7 G7 | Cmaj7
        // Chord indices: 0-4 are first 5 bars. Bar 6 is index 5 (Dm7) and 6 (G7) if split?
        // Let's check the progression array length to see how split bars are handled.
        // "Dm7 G7" in one bar means two chord entries in the step map/progression list usually?
        // validateProgression splits bars by spaces if they contain multiple chords?
        // Actually public/chords.js logic splits by space.
        
        // Let's find the Dm7 chord
        const dm7 = arranger.progression.find(c => c.absName === 'Dm7');
        const g7 = arranger.progression.find(c => c.absName === 'G7');
        const cmaj7 = arranger.progression.find(c => c.absName === 'Cmaj7');
        
        expect(dm7).toBeDefined();
        expect(g7).toBeDefined();
        expect(cmaj7).toBeDefined();

        // Dm7 (ii of C) -> Dorian (D, E, F, G, A, B, C)
        const scaleDm = getScaleForChord(dm7, g7, 'bird');
        // D=0. D, E(2), F(3), G(5), A(7), B(9), C(10)
        expect(scaleDm).toEqual([0, 2, 3, 5, 7, 9, 10]);

        // Cmaj7 (I of C) -> Ionian
        const scaleC = getScaleForChord(cmaj7, null, 'bird');
        // C=0. C, D(2), E(4), F(5), G(7), A(9), B(11)
        expect(scaleC).toEqual([0, 2, 4, 5, 7, 9, 11]);
    });

    it('should handle the Bridge modulation to E Major (F#m7-B7-Emaj7)', () => {
        const fsharpM7 = arranger.progression.find(c => c.absName === 'F#m7');
        const b7 = arranger.progression.find(c => c.absName === 'B7');
        const emaj7 = arranger.progression.find(c => c.absName === 'Emaj7');

        // B7 is V7 of E. E is Major 3rd away from key center (Ab is G#).
        // It's a distant modulation.
        
        // B7 -> Mixolydian (B, C#, D#, E, F#, G#, A)
        // B=0. 0, 2, 4, 5, 7, 9, 10
        const scaleB = getScaleForChord(b7, emaj7, 'bird');
        expect(scaleB).toEqual([0, 2, 4, 5, 7, 9, 10]);

        // Emaj7 -> Ionian/Lydian
        const scaleE = getScaleForChord(emaj7, null, 'bird');
        // E=0. 0, 2, 4, 5(or 6), 7, 9, 11
        expect(scaleE).toContain(4); // G#
        expect(scaleE).toContain(11); // D#
    });

    it('should select Altered scale for the C7alt turnaround to Fm7', () => {
        // End of Bridge: C7alt resolving to Fm7 (Start of A3, though we didn't mock A3 in 'sections' array in the test setup, 
        // but getScaleForChord might look at next chord if available or just use C7alt quality).
        
        // In the test setup, C7alt is the last chord of 'sections'. So nextChord is null or loops.
        // But 'quality' is '7alt', so it should pick Altered regardless of next chord.
        
        const c7alt = arranger.progression.find(c => c.absName === 'C7alt');
        const scale = getScaleForChord(c7alt, null, 'bird');
        
        // Altered: 0, 1, 3, 4, 6, 8, 10
        expect(scale).toEqual([0, 1, 3, 4, 6, 8, 10]);
    });
});
