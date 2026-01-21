/* eslint-disable */
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
    cb: { enabled: true, octave: 60, density: 'standard', pianoRoots: false },
    ctx: { bandIntensity: 0.5, bpm: 180, audio: { currentTime: 0 } },
    arranger: { 
        key: 'Bb', 
        isMinor: false,
        progression: [],
        totalSteps: 0,
        stepMap: [],
        timeSignature: '4/4'
    },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true },
    hb: { enabled: false }
}));

vi.mock('../../public/config.js', async (importOriginal) => {
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

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote, getScaleForChord } from '../../public/soloist.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { arranger, sb } from '../../public/state.js';

describe('Jazz Standard Test: Rhythm Changes', () => {
    // Rhythm Changes in Bb
    // A: Bbmaj7 G7 | Cm7 F7 | Bbmaj7 G7 | Cm7 F7 | Bb Bb7 | Eb ebm7 | Bb F7 | Bb
    // B: D7 | G7 | C7 | F7
    
    beforeEach(() => {
        arranger.key = 'Bb';
        arranger.isMinor = false;
        arranger.sections = [
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "B", value: "III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7" }
        ];
        validateProgression();
        
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
    });

    it('should correctly parse the A section progression in Bb', () => {
        const progression = arranger.progression;
        // First chord should be Bbmaj7 (Bb = PC 10) - Note: 'I' in Major key usually parses as major triad
        expect(progression[0].rootMidi % 12).toBe(10);
        expect(progression[0].absName).toBe('Bb');
        
        // Second chord should be Gm7 (G = PC 7) - 'vi7' parses as minor 7
        expect(progression[1].rootMidi % 12).toBe(7);
        expect(progression[1].quality).toBe('minor');
        expect(progression[1].is7th).toBe(true);
    });

    it('should select appropriate scales for the I-vi-ii-V turnaround', () => {
        const progression = arranger.progression;
        
        // I (Bb) -> Ionian
        const scaleI = getScaleForChord(progression[0], progression[1], 'bird');
        expect(scaleI).toEqual([0, 2, 4, 5, 7, 9, 11]);

        // vi7 (Gm7) -> Aeolian (Diatonic to Bb Major)
        const scaleVI7 = getScaleForChord(progression[1], progression[2], 'bird');
        expect(scaleVI7).toEqual([0, 2, 3, 5, 7, 8, 10]);

        // ii7 (Cm7) -> Dorian
        const scaleII7 = getScaleForChord(progression[2], progression[3], 'bird');
        expect(scaleII7).toEqual([0, 2, 3, 5, 7, 9, 10]);
    });

    it('should handle the Bridge (B section) secondary dominants', () => {
        // Find the B section start 
        const bSectionStart = arranger.progression.find(c => c.sectionLabel === 'B');
        const d7 = bSectionStart;
        
        // D7 (III7)
        expect(d7.rootMidi % 12).toBe(2); // D is PC 2
        expect(d7.quality).toBe('7');
        
        const scaleD7 = getScaleForChord(d7, null, 'bird');
        expect(scaleD7).toEqual([0, 2, 4, 5, 7, 9, 10]);
    });

    it('should generate a walking bass line that hits roots on beat 1', () => {
        // Test first 4 bars of A section
        for (let bar = 0; bar < 4; bar++) {
            const step = bar * 16;
            const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => (step + 16) >= m.start && (step + 16) < m.end)?.chord;
            
            const result = getBassNote(currentChord, nextChord, 0, 440, 38, 'quarter', 0, step, 0);
            expect(result.midi % 12).toBe(currentChord.rootMidi % 12);
        }
    });

    it('should use rootless voicings for the jazz comping when enabled', () => {
        // We need to ensure pianoRoots is true or bb is enabled to trigger rootless in getIntervals
        const progression = arranger.progression;
        
        // vi7 (Gm7)
        const gm7 = progression[1];
        // Standard rootless for minor (standard density): b3, 5, b7 -> [3, 7, 10]
        expect(gm7.intervals).toEqual([3, 7, 10]);
        expect(gm7.intervals).not.toContain(0);

        // F7 (V7)
        const f7 = progression[3];
        // Standard rootless (standard density): 3, 5, b7 -> [4, 7, 10]
        expect(f7.intervals).toEqual([4, 7, 10]);
        expect(f7.intervals).not.toContain(0);
    });

    it('should maintain voice leading across the fast-moving A section', () => {
        const progression = arranger.progression.filter(c => c.sectionLabel === 'A');
        let lastAvg = null;

        progression.forEach((chord) => {
            const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
            const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

            if (lastAvg !== null) {
                const drift = Math.abs(currentAvg - lastAvg);
                // Even with fast changes, voice leading should keep the clusters close
                expect(drift).toBeLessThan(8);
            }
            lastAvg = currentAvg;
        });
    });
});
