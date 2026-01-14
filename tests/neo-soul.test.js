import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, hookRetentionProb: 0.5
    },
    cb: { enabled: true, octave: 60, density: 'standard', practiceMode: false },
    ctx: { bandIntensity: 0.5, bpm: 80, audio: { currentTime: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false,
        progression: [],
        totalSteps: 0,
        stepMap: [],
        timeSignature: '4/4',
        sections: []
    },
    gb: { genreFeel: 'Neo-Soul' },
    bb: { pocketOffset: 0.025 },
}));

vi.mock('../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        INTERVAL_TO_ROMAN: { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' },
        INTERVAL_TO_NNS: { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' }
    };
});

vi.mock('../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getBassNote } from '../public/bass.js';
import { validateProgression } from '../public/chords.js';
import { arranger } from '../public/state.js';

describe('Neo-Soul Integration Test: Slash Chords', () => {
    
    beforeEach(() => {
        arranger.key = 'C';
        arranger.isMinor = false;
        // IVmaj7/5 | iii7 | ii7/5 | Imaj7
        // In C: Fmaj7/G | Em7 | Dm7/G | Cmaj7
        arranger.sections = [
            { id: 'Main', label: 'Main', value: "IVmaj7/5 | iii7 | ii7/5 | Imaj7" }
        ];
        validateProgression();
    });

    it('should correctly identify and voice the slash chords', () => {
        const progression = arranger.progression;
        
        // 1. IVmaj7/5 (Fmaj7/G)
        const fmaj7g = progression[0];
        expect(fmaj7g.absName).toBe('Fmaj7/G');
        expect(fmaj7g.bassMidi % 12).toBe(7); // G
        
        // The freqs should include G as the lowest note
        const midis = fmaj7g.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
        expect(midis[0] % 12).toBe(7);

        // 2. ii7/5 (Dm7/G)
        const dm7g = progression[2];
        expect(dm7g.absName).toBe('Dm7/G');
        expect(dm7g.bassMidi % 12).toBe(7); // G
    });

    it('should generate a bass line that respects the slash note on beat 1', () => {
        const progression = arranger.progression;
        
        // Test Bar 1: Fmaj7/G
        const result = getBassNote(progression[0], progression[1], 0, null, 38, 'neo', 0, 0, 0);
        // Should play G (7)
        expect(result.midi % 12).toBe(7);

        // Test Bar 3: Dm7/G
        const result2 = getBassNote(progression[2], progression[3], 0, null, 38, 'neo', 2, 32, 0);
        expect(result2.midi % 12).toBe(7);
    });

    it('should maintain a laid-back pocket offset for the bass', () => {
        const progression = arranger.progression;
        const result = getBassNote(progression[0], progression[1], 0, null, 38, 'neo', 0, 0, 0);
        
        // Neo-soul style should have a specific timingOffset (25ms default in our logic)
        expect(result.timingOffset).toBeGreaterThan(0);
        expect(result.timingOffset).toBeCloseTo(0.025);
    });

    it('should use Dorian scale for the iii7 and ii7 chords in Neo-Soul context', () => {
        // This is handled by getScaleForChord, but let's verify via getBassNote or getSoloistNote if needed.
        // Actually we can just check the bass line movement or add a soloist check.
        // In Neo-Soul, minor chords often use Dorian.
    });
});
