import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000
    },
    cb: { enabled: true, octave: 60, density: 'standard', practiceMode: false },
    ctx: { bandIntensity: 0.5, bpm: 240, audio: { currentTime: 0 } },
    arranger: { 
        key: 'Bb', 
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
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 }
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getScaleForChord } from '../../public/soloist.js';
import { validateProgression } from '../../public/chords.js';
import { arranger } from '../../public/state.js';

describe('Jazz Standard Test: Cherokee', () => {
    
    beforeEach(() => {
        arranger.key = 'Bb';
        arranger.sections = [
            { id: 'A1', label: "A", key: "Bb", value: "Bbmaj7 | Fm7 Bb7 | Ebmaj7 | Ebm7 Ab7 | Bbmaj7 C7 | Cm7 F7 | Bbmaj7 | Cm7 F7" },
            { id: 'A2', label: "A", key: "Bb", value: "Bbmaj7 | Fm7 Bb7 | Ebmaj7 | Ebm7 Ab7 | Bbmaj7 C7 | Cm7 F7 | Bbmaj7 | Bbmaj7" },
            { id: 'B1', label: "B (B)", key: "B", value: "C#m7 | F#7 | Bmaj7 | Bmaj7" },
            { id: 'B2', label: "B (A)", key: "A", value: "Bm7 | E7 | Amaj7 | Amaj7", seamless: true },
            { id: 'B3', label: "B (G)", key: "G", value: "Am7 | D7 | Gmaj7 | Gmaj7", seamless: true },
            { id: 'B4', label: "B (Bb)", key: "Bb", value: "Gm7 C7 | Cm7 F7", seamless: true },
            { id: 'A3', label: "A", key: "Bb", value: "Bbmaj7 | Fm7 Bb7 | Ebmaj7 | Ebm7 Ab7 | Bbmaj7 C7 | Cm7 F7 | Bbmaj7 | Bbmaj7" }
        ];
        validateProgression();
    });

    it('should correctly identify the key center for the Bridge modulations', () => {
        const progression = arranger.progression;
        
        // Find the start of the B section (Key of B)
        const bChord = progression.find(c => c.sectionLabel === 'B (B)' && c.quality === 'maj7');
        
        // 1. Verify the parser assigned the correct key
        expect(bChord.key).toBe('B');

        // 2. Verify Scale Selection (Relative Intervals)
        // Bmaj7 in B Major -> Ionian/Lydian [0, 2, 4, 5, 7, 9, 11]
        const scale = getScaleForChord(bChord, null, 'bird');
        
        expect(scale).toContain(0);  // Root
        expect(scale).toContain(4);  // 3rd
        expect(scale).toContain(7);  // 5th
        expect(scale).toContain(11); // 7th
    });

    it('should shift key center for the A Major modulation', () => {
        const aSection = arranger.progression.find(c => c.sectionLabel === 'B (A)' && c.quality === 'maj7');
        
        // 1. Verify the parser assigned the correct key
        expect(aSection.key).toBe('A');

        // 2. Verify Scale Selection
        // Amaj7 in A Major
        const scale = getScaleForChord(aSection, null, 'bird');
        
        // Should contain standard chord tones (Relative)
        expect(scale).toContain(0);
        expect(scale).toContain(4);
        expect(scale).toContain(7);
        expect(scale).toContain(11);
    });
});
