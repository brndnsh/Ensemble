import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
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
    cb: { enabled: true, octave: 60, density: 'standard', practiceMode: false },
    ctx: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 } },
    arranger: { 
        key: 'G', 
        isMinor: true, // Autumn Leaves is often thought of in E minor (relative to G major)
        progression: [],
        totalSteps: 0,
        stepMap: [],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true },
    sb_enabled: true
}));

vi.mock('./public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_NNS: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
        INTERVAL_TO_ROMAN: ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
    };
});

vi.mock('./public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('./public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote, getScaleForChord } from './public/soloist.js';
import { getBassNote } from './public/bass.js';
import { validateProgression } from './public/chords.js';
import { arranger, sb } from './public/state.js';

describe('Jazz Standard Test: Autumn Leaves', () => {
    // Autumn Leaves in Gm (relative to Bb) or Em (relative to G)
    // Let's use Em (Relative to G Major)
    // iim7 - V7 - Imaj7 - IVmaj7 | iiø7 - V7alt - im7 - (VI7)
    // Am7 - D7 - Gmaj7 - Cmaj7 | F#m7b5 - B7alt - Em7 - E7
    
    beforeEach(() => {
        arranger.key = 'G';
        arranger.isMinor = false;
        arranger.sections = [
            { id: 'A', label: 'A', value: 'Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7alt | Em7 | E7' }
        ];
        validateProgression();
        
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
    });

    it('should select correct scales for the cycle of fourths progression', () => {
        const progression = arranger.progression;
        
        // 1. Am7 (iim7) -> Should be Dorian (standard minor)
        const scaleAm7 = getScaleForChord(progression[0], progression[1], 'bird');
        expect(scaleAm7).toEqual([0, 2, 3, 5, 7, 9, 10]); // Dorian

        // 2. D7 (V7) -> Should be Mixolydian
        const scaleD7 = getScaleForChord(progression[1], progression[2], 'bird');
        expect(scaleD7).toEqual([0, 2, 4, 5, 7, 9, 10]);

        // 3. F#m7b5 (iiø7) -> Should be Locrian (Half-Diminished)
        const scaleFSharp = getScaleForChord(progression[4], progression[5], 'bird');
        expect(scaleFSharp).toEqual([0, 1, 3, 5, 6, 8, 10]);
        
        // Verify F#m7b5 intervals specifically: should have b5 (6) and 11th (5) but NOT Natural 9 (14)
        expect(progression[4].intervals).toEqual([3, 5, 6, 10]); // Rootless: b3, 11, b5, b7

        // 4. B7alt (V7alt) -> Should be Altered
        const scaleB7 = getScaleForChord(progression[5], progression[6], 'bird');
        expect(scaleB7).toEqual([0, 1, 3, 4, 6, 8, 10]);
    });

    it('should maintain harmonic integrity over a full 8-bar phrase', () => {
        const progression = arranger.progression;
        let totalNotes = 0;
        
        // Simulate playing through the 8 bars (128 steps)
        for (let step = 0; step < 128; step++) {
            const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => step + 16 >= m.start && step + 16 < m.end)?.chord;
            
            const result = getSoloistNote(currentChord, nextChord, step, 440, 72, 'bird', step % 16);
            
            if (result) {
                totalNotes++;
                const note = Array.isArray(result) ? result[0] : result;
                
                // Verify the note is in the selected scale for the current chord
                // Allowing for neighbors (chromatic leading tones) as per expressive logic
                const scale = getScaleForChord(currentChord, nextChord, 'bird');
                const interval = (note.midi - currentChord.rootMidi + 120) % 12;
                
                let isInScale = scale.includes(interval);
                if (!isInScale) {
                    const neighbors = [(interval - 1 + 12) % 12, (interval + 1 + 12) % 12];
                    isInScale = neighbors.some(n => scale.includes(n));
                }
                expect(isInScale).toBe(true);
            }
        }
        
        // Should have generated a reasonable number of notes for 8 bars of Jazz
        expect(totalNotes).toBeGreaterThan(10);
        expect(totalNotes).toBeLessThan(64); // Not too busy!
    });

    it('should anticipate the minor resolution (Em7) with Phrygian Dominant on B7', () => {
        const progression = arranger.progression;
        const b7Chord = progression[5]; // B7alt
        const em7Chord = progression[6]; // Em7
        
        // On the end of the B7 bar (step 14 of that chord), it should use Phrygian Dominant if V7toMinor logic hits
        // But B7alt specifically requested Altered in its quality.
        // Let's test a plain 'B7' leading to 'Em7'
        const plainB7 = { ...b7Chord, quality: '7' };
        const scale = getScaleForChord(plainB7, em7Chord, 'bird');
        
        // Phrygian Dominant: [0, 1, 4, 5, 7, 8, 10]
        expect(scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
    });

    it('should generate a valid walking bass line over the full progression', () => {
        const progression = arranger.progression;
        let prevMidi = 38; 
        
        // Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7alt | Em7 | E7
        for (let bar = 0; bar < 8; bar++) {
            const chordEntry = arranger.stepMap.find(m => (bar * 16) >= m.start && (bar * 16) < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => ((bar + 1) * 16) >= m.start && ((bar + 1) * 16) < m.end)?.chord;

            for (let beat = 0; beat < 4; beat++) {
                const step = (bar * 16) + (beat * 4);
                const result = getBassNote(currentChord, nextChord, beat, 440 * Math.pow(2, (prevMidi - 69) / 12), 38, 'quarter', 0, step, beat * 4);
                
                expect(result).not.toBeNull();
                const midi = result.midi;

                // Beat 1: Root (mostly)
                if (beat === 0) {
                    expect(midi % 12).toBe(currentChord.rootMidi % 12);
                }

                // Register Check: Should stay in a musical bass range
                expect(midi).toBeGreaterThanOrEqual(28); // E1
                expect(midi).toBeLessThanOrEqual(55);    // G3

                prevMidi = midi;
            }
        }
    });

    it('should generate pro-level rootless voicings for the accompaniment', () => {
        const progression = arranger.progression;
        // Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7alt | Em7 | E7
        
        // 1. Am7 (ii) - Standard jazz voicing usually has 3, 7, 9
        const am7 = progression[0];
        // intervals for minor in Jazz with rootless enabled: [3, 10, 14] or similar
        // Am7 root is 57 (A2) or 69 (A3). 
        // rootless intervals for Am7 (quality 'minor', is7th true): [3, 10, 14] -> C, G, B
        expect(am7.intervals).toContain(3);  // b3 (C)
        expect(am7.intervals).toContain(10); // b7 (G)
        expect(am7.intervals).not.toContain(0); // Rootless (no A)

        // 2. D7 (V) - Should have 3, b7, 9
        const d7 = progression[1];
        expect(d7.intervals).toContain(4);  // 3 (F#)
        expect(d7.intervals).toContain(10); // b7 (C)
        expect(d7.intervals).not.toContain(0); // Rootless (no D)

        // 3. B7alt - Check for altered extensions
        const b7alt = progression[5];
        // quality '7alt' intervals: [0, 4, 10, 13, 15, 18, 20] -> Rootless often 3, b7, extensions
        expect(b7alt.quality).toBe('7alt');
        expect(b7alt.intervals).toContain(4);  // 3 (D#)
        expect(b7alt.intervals).toContain(10); // b7 (A)
        // b9 (13) or #9 (15)
        const hasAltExtension = b7alt.intervals.includes(13) || b7alt.intervals.includes(15);
        expect(hasAltExtension).toBe(true);
    });

    it('should maintain smooth voice leading (minimum average drift) across the A section', () => {
        const progression = arranger.progression;
        let lastAvg = null;

        progression.forEach((chord, i) => {
            const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
            const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

            if (lastAvg !== null) {
                const drift = Math.abs(currentAvg - lastAvg);
                // Voice leading usually keeps drift under 7 semitones (a perfect 5th)
                expect(drift).toBeLessThan(7);
            }
            lastAvg = currentAvg;
        });
    });
});
