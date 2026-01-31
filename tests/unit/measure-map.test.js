
import { describe, it, expect } from 'vitest';
import { getStepInfo } from '../../public/utils.js';
import { TIME_SIGNATURES } from '../../public/config.js';

describe('getStepInfo with Measure Map (Binary Search)', () => {
    // Construct a measure map with known boundaries
    // Measure 1: 0-16 (4/4)
    // Measure 2: 16-28 (3/4, 12 steps)
    // Measure 3: 28-44 (4/4)
    const measureMap = [
        { start: 0, end: 16, ts: '4/4' },
        { start: 16, end: 28, ts: '3/4' },
        { start: 28, end: 44, ts: '4/4' }
    ];

    const tsConfig = TIME_SIGNATURES['4/4'];

    it('should find the first measure', () => {
        const result = getStepInfo(0, tsConfig, measureMap, TIME_SIGNATURES);
        expect(result.tsName).toBe('4/4');
        expect(result.isMeasureStart).toBe(true);

        const result2 = getStepInfo(15, tsConfig, measureMap, TIME_SIGNATURES);
        expect(result2.tsName).toBe('4/4');
        expect(result2.isMeasureStart).toBe(false);
    });

    it('should find the middle measure (3/4)', () => {
        // Step 16 is the start of the 2nd measure (3/4)
        const result = getStepInfo(16, tsConfig, measureMap, TIME_SIGNATURES);
        expect(result.tsName).toBe('3/4');
        expect(result.isMeasureStart).toBe(true);
        expect(result.mStep).toBe(0);

        // Step 27 is the last step of the 2nd measure
        const resultEnd = getStepInfo(27, tsConfig, measureMap, TIME_SIGNATURES);
        expect(resultEnd.tsName).toBe('3/4');
        expect(resultEnd.isMeasureStart).toBe(false);
        expect(resultEnd.mStep).toBe(11);
    });

    it('should find the last measure', () => {
        const result = getStepInfo(28, tsConfig, measureMap, TIME_SIGNATURES);
        expect(result.tsName).toBe('4/4');
        expect(result.isMeasureStart).toBe(true);

        const resultEnd = getStepInfo(43, tsConfig, measureMap, TIME_SIGNATURES);
        expect(resultEnd.tsName).toBe('4/4');
    });

    it('should fallback correctly if step is out of bounds', () => {
        // Step 44 is beyond the map (end is exclusive)
        // logic says: if (measure) ... else { fallback }
        const result = getStepInfo(44, tsConfig, measureMap, TIME_SIGNATURES);
        // It should use the fallback logic.
        // Note: fallback uses tsName from previous found measure?
        // No, in the code:
        // if (measure) { ... } else {
        //    const spm = getStepsPerMeasure(tsName);
        // }
        // Wait, tsName is initialized to `${tsConfig.beats}/${...}` at the top.
        // So it should fallback to the global tsConfig if not found in map.

        expect(result.tsName).toBe('4/4'); // tsConfig is 4/4
    });

    it('should handle single item map', () => {
        const singleMap = [{ start: 0, end: 16, ts: '4/4' }];
        const result = getStepInfo(5, tsConfig, singleMap, TIME_SIGNATURES);
        expect(result.tsName).toBe('4/4');
    });
});
