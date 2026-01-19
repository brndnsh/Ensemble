/* eslint-disable */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoist the mock factory
vi.mock('../../public/state.js', () => {
    return {
        sb: { tension: 0, sessionSteps: 1000, currentPhraseSteps: 0 },
        cb: { style: 'smart' },
        ctx: { bandIntensity: 0.5 },
        arranger: { key: 'C', isMinor: false, progression: [], grouping: null, timeSignature: '4/4' },
        gb: { genreFeel: 'Funk', lastDrumPreset: 'Funk' },
        bb: {},
        hb: { enabled: false }
    };
});

// 2. Import the mocked module to manipulate it
import { sb, cb, ctx, arranger, gb } from '../../public/state.js';
import { getScaleForChord } from '../../public/soloist.js';
import { getScaleForBass } from '../../public/bass.js';

describe('Harmonic Compatibility Integration', () => {
    
    const mockChord = (quality, rootMidi = 60, intervals = []) => ({
        quality,
        rootMidi,
        intervals,
        freqs: [], 
        isMinor: ['minor', 'dim', 'halfdim', 'm9', 'm11', 'm13', 'm6'].includes(quality)
    });

    beforeEach(() => {
        // Reset state defaults via the imported objects
        gb.genreFeel = 'Funk';
        sb.tension = 0.5;
        arranger.key = 'C';
        arranger.isMinor = false;
    });

    describe('Soloist Harmonic Integrity', () => {
        
        it('should treat m9 as minor in Funk/Neo-Soul context (avoid Major 3rd)', () => {
            gb.genreFeel = 'Funk';
            const chord = mockChord('m9', 60); // C m9
            const scale = getScaleForChord(chord, null, 'funk');
            
            // Expected: Minor Pentatonic or Dorian/Aeolian.
            // DEFINITELY NOT: Major 3rd (interval 4)
            
            const hasMajorThird = scale.includes(4);
            const hasMinorThird = scale.includes(3);
            
            console.log('Funk m9 Scale:', scale);
            
            expect(hasMinorThird).toBe(true);
            expect(hasMajorThird).toBe(false); 
        });

        it('should treat m11 as minor in Neo-Soul context', () => {
            gb.genreFeel = 'Neo-Soul';
            const chord = mockChord('m11', 60);
            const scale = getScaleForChord(chord, null, 'neo');

            expect(scale).toContain(3);
            expect(scale).toContain(10);
            expect(scale).not.toContain(4); // No Major 3rd
        });
        
        it('should treat IV13 as Dominant (Mixolydian)', () => {
             gb.genreFeel = 'Funk';
             const chord = mockChord('13', 65); // F13 (IV in C)
             const scale = getScaleForChord(chord, null, 'funk');
             
             // Mixolydian: 0, 2, 4, 5, 7, 9, 10
             expect(scale).toContain(4); // Major 3rd
             expect(scale).toContain(10); // Minor 7th
             expect(scale).toContain(9); // 13th (Major 6th)
        });

        it('should correctly handle m6 chords (Dorian/Melodic Minor)', () => {
             gb.genreFeel = 'Jazz';
             const chord = mockChord('m6', 60);
             const scale = getScaleForChord(chord, null, 'bird');
             
             // m6 usually implies Dorian or Melodic Minor. 
             // Should have b3 (3) and 6 (9).
             expect(scale).toContain(3);
             expect(scale).toContain(9);
        });
    });

    describe('Bass Harmonic Integrity', () => {
        it('should provide correct scale for m9 chords', () => {
            gb.genreFeel = 'Funk';
            const chord = mockChord('m9', 60, [0, 3, 7, 10, 14]); 
            const scale = getScaleForBass(chord, null);
            
            // Should match Dorian/Minor: [0, 2, 3, 5, 7, 9, 10] or similar
            expect(scale).toContain(3);
            expect(scale).not.toContain(4);
        });

        it('should provide correct scale for m11 chords', () => {
             const chord = mockChord('m11', 60);
             const scale = getScaleForBass(chord, null);
             expect(scale).toContain(3);
             expect(scale).not.toContain(4);
        });
    });

});