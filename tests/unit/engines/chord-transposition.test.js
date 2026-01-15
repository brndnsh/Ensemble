import { describe, it, expect, vi } from 'vitest';

// Mock browser-only modules
vi.mock('../../../public/ui.js', () => ({ ui: {} }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/state.js', () => ({
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: { timeSignature: '4/4' },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: false }
}));

// Mock config with all necessary exports
vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    ENHARMONIC_MAP: { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' },
    ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
    NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
    INTERVAL_TO_ROMAN: { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' },
    INTERVAL_TO_NNS: { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' }
}));

import { transformRelativeProgression } from '../../../public/chords.js';

describe('Chord Transposition Logic', () => {
    
    it('should correctly transpose a complex Jazz progression', () => {
        // Am7 - D7 - Gmaj7 (ii - V - I in G)
        // Shift by -3 semitones (G Major -> E Minor)
        // Interval Am(9) - (-3) = 12 % 12 = 0 -> I
        // wait, ii in G is Am. If key moves to Em (relative minor), G is bIII.
        // The shift is relative to key.
        // Input: ii (9) - V (2) - I (7) in G? No, ROMAN_VALS are absolute from C.
        // Actually transformRelativeProgression logic: newOffset = (originalOffset - semitoneShift + 12) % 12;
        // Am7 (ii): numeral 'ii' -> 2. accidental "". offset = 2.
        // Shift -3: newOffset = (2 - (-3)) % 12 = 5 -> IV.
        // Result: ivm7
        
        const input = 'iim7 | V7 | Imaj7';
        const result = transformRelativeProgression(input, -3, true);
        expect(result).toBe('ivm7 | bVII7 | bIIImaj7');
    });

    it('should handle Nashville Number System (NNS) transposition', () => {
        // 1 | 4 | 5
        // Shift -3:
        // 1 (0) -> (0 - (-3)) = 3 -> b3
        // 4 (5) -> (5 - (-3)) = 8 -> b6
        // 5 (7) -> (7 - (-3)) = 10 -> b7
        const result = transformRelativeProgression('1 | 4 | 5', -3, true);
        expect(result).toBe('b3 | b6 | b7');
    });

    it('should handle absolute note names', () => {
        // C | F | G
        // Shift +1 semitone (C -> Db)
        const result = transformRelativeProgression('C | F | G', 1, false);
        expect(result).toBe('Db | Gb | Ab');
    });

    it('should handle slash chords during transposition', () => {
        // C/E | G/B
        // Shift +2 semitones
        // C -> D
        // E -> Gb (F#)
        // G -> A
        // B -> Db (C#)
        const result = transformRelativeProgression('C/E | G/B', 2, false);
        expect(result).toBe('D/Gb | A/Db');
    });

    it('should preserve casing for Roman Numerals', () => {
        // i - IV - V7
        // Shift +3
        // i (0) -> (0 - 3) = 9 -> vi (lowercase preserved)
        // IV (5) -> (5 - 3) = 2 -> II
        // V7 (7) -> (7 - 3) = 4 -> III7
        const result = transformRelativeProgression('i | IV | V7', 3, false);
        expect(result).toBe('vi | II | III7');
    });
});