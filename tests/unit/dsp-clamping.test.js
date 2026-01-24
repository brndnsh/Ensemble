import { describe, it, expect } from 'vitest';
import { clampFreq } from '../../public/utils.js';

describe('DSP Clamping', () => {
    it('should clamp frequencies above 24000Hz to 24000Hz', () => {
        expect(clampFreq(25000)).toBe(24000);
        expect(clampFreq(24001)).toBe(24000);
        expect(clampFreq(24000)).toBe(24000);
        expect(clampFreq(25087.7)).toBe(24000);
    });

    it('should clamp negative frequencies to 0Hz', () => {
        expect(clampFreq(-100)).toBe(0);
        expect(clampFreq(-1)).toBe(0);
        expect(clampFreq(0)).toBe(0);
    });

    it('should allow frequencies within the valid range', () => {
        expect(clampFreq(100)).toBe(100);
        expect(clampFreq(10000)).toBe(10000);
        expect(clampFreq(23999)).toBe(23999);
    });

    it('should respect custom max', () => {
        expect(clampFreq(25000, 22050)).toBe(22050);
        expect(clampFreq(20000, 22050)).toBe(20000);
    });
});
