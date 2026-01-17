/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and other modules
vi.mock('../../../public/state.js', () => ({
    ctx: { bandIntensity: 0.5 },
    cb: { octave: 60, density: 'standard', practiceMode: false },
    arranger: {
        sections: [],
        progression: [],
        key: 'C',
        timeSignature: '4/4',
        isMinor: true,
        notation: 'name'
    },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true }
}));
vi.mock('../../../public/ui.js', () => ({
    ui: {
        chordVisualizer: { innerHTML: '', dataset: {} }
    }
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));

import { validateProgression } from '../../../public/chords.js';
import { arranger } from '../../../public/state.js';

describe('Minor Blues Preset Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate the correct chords for Minor Blues in C Minor', () => {
        // Minor Blues: i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7
        arranger.sections = [
            { id: 's1', label: 'Main', value: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7", repeat: 1 }
        ];
        arranger.key = 'C';
        arranger.isMinor = true;

        validateProgression();

        const expectedChords = [
            'Cm7', 'Cm7', 'Cm7', 'Cm7',
            'Fm7', 'Fm7',
            'Cm7', 'Cm7',
            'Ab7', 'G7',
            'Cm7', 'G7'
        ];

        expect(arranger.progression.length).toBe(12);
        
        arranger.progression.forEach((chord, i) => {
            expect(chord.absName).toBe(expectedChords[i]);
        });
    });

    it('should correctly transpose Minor Blues to A Minor', () => {
        arranger.sections = [
            { id: 's1', label: 'Main', value: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7", repeat: 1 }
        ];
        arranger.key = 'A';
        arranger.isMinor = true;

        validateProgression();

        const expectedChords = [
            'Am7', 'Am7', 'Am7', 'Am7',
            'Dm7', 'Dm7',
            'Am7', 'Am7',
            'F7', 'E7',
            'Am7', 'E7'
        ];

        expect(arranger.progression.length).toBe(12);
        
        arranger.progression.forEach((chord, i) => {
            expect(chord.absName).toBe(expectedChords[i]);
        });
    });
});
