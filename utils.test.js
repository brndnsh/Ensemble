import { describe, it, expect } from 'vitest';
import { normalizeKey, getFrequency, midiToNote, getMidi, getStepsPerMeasure } from './public/utils.js';

describe('Utility Functions', () => {
    describe('normalizeKey', () => {
        it('should normalize C# to Db', () => {
            expect(normalizeKey('C#')).toBe('Db');
        });

        it('should return the same key if no normalization is needed', () => {
            expect(normalizeKey('C')).toBe('C');
            expect(normalizeKey('F')).toBe('F');
        });
    });

    describe('getFrequency', () => {
        it('should return 440 for MIDI 69', () => {
            expect(getFrequency(69)).toBe(440);
        });

        it('should return 261.63 for MIDI 60 (Middle C)', () => {
            expect(getFrequency(60)).toBeCloseTo(261.63, 2);
        });
    });

    describe('midiToNote', () => {
        it('should return C4 for MIDI 60', () => {
            expect(midiToNote(60)).toEqual({ name: 'C', octave: 4 });
        });

        it('should return A4 for MIDI 69', () => {
            expect(midiToNote(69)).toEqual({ name: 'A', octave: 4 });
        });
    });

    describe('getMidi', () => {
        it('should return 69 for 440Hz', () => {
            expect(getMidi(440)).toBe(69);
        });

        it('should return 60 for 261.63Hz', () => {
            expect(getMidi(261.63)).toBe(60);
        });
    });

    describe('getStepsPerMeasure', () => {
        it('should return 16 for 4/4', () => {
            expect(getStepsPerMeasure('4/4')).toBe(16);
        });

        it('should return 12 for 3/4', () => {
            expect(getStepsPerMeasure('3/4')).toBe(12);
        });

        it('should return 12 for 6/8', () => {
            expect(getStepsPerMeasure('6/8')).toBe(12);
        });
    });
});
