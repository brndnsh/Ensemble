import { describe, it, expect, vi } from 'vitest';
import { getScaleForBass } from '../../../public/bass.js';
import { getScaleForChord } from '../../../public/soloist.js';
import { gb, arranger } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => ({
    gb: { genreFeel: 'Neo-Soul' },
    arranger: { key: 'C', isMinor: false },
    sb: { tension: 0 }
}));

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
    }
}));

describe('Neo-Soul Harmonic Integrity', () => {
    it('should use Aeolian (Natural Minor) for the vi chord in a major key to avoid clashes', () => {
        // Setup: vi chord in C Major (Am)
        const viChord = {
            rootMidi: 57, // A
            quality: 'minor',
            intervals: [0, 3, 7],
            key: 'C'
        };

        // BASS CHECK
        const bassScale = getScaleForBass(viChord, null);
        // Aeolian should have a b6 (interval 8). Dorian has a natural 6 (interval 9).
        // For A minor in C, we need F (8), not F# (9).
        expect(bassScale).toContain(8);
        expect(bassScale).not.toContain(9);

        // SOLOIST CHECK
        const soloistScale = getScaleForChord(viChord, null, 'smart');
        expect(soloistScale).toContain(8);
        expect(soloistScale).not.toContain(9);
    });

    it('should use Dorian for the ii chord in a major key (Standard Neo-Soul flavor)', () => {
        // Setup: ii chord in C Major (Dm)
        const iiChord = {
            rootMidi: 62, // D
            quality: 'minor',
            intervals: [0, 3, 7],
            key: 'C'
        };

        const bassScale = getScaleForBass(iiChord, null);
        // For D minor in C, Dorian is fine (B natural is the 6th, which is diatonic to C)
        expect(bassScale).toContain(9); 
    });
});
