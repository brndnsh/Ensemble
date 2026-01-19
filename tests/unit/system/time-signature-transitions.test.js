/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conductorState, checkSectionTransition } from '../../../public/conductor.js';
import { ctx, gb, arranger, dispatch } from '../../../public/state.js';

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        hb: { enabled: false, buffer: new Map() },
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_BAND_INTENSITY') ctx.bandIntensity = payload;
        })
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        intensitySlider: { value: 0 },
        densitySelect: { value: 'standard' }
    },
    triggerFlash: vi.fn()
}));

vi.mock('../../../public/persistence.js', () => ({
    debounceSaveState: vi.fn()
}));

vi.mock('../../../public/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({}))
}));

describe('Time Signature Transitions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.autoIntensity = true;
        ctx.isPlaying = true;
        ctx.bandIntensity = 0.5;
        conductorState.target = 0.5;
        conductorState.stepSize = 0;
        conductorState.formIteration = 0;
        conductorState.loopCount = 0;
        gb.enabled = true;
    });

    it('should trigger transition for 3/4 time (12 steps per measure)', () => {
        const stepsPerMeasure = 12;
        // Use 8 bars to exceed the 64-step "short loop" threshold (8 * 12 = 96)
        arranger.totalSteps = 96;
        arranger.stepMap = [];
        for (let i = 0; i < 8; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' }
            });
        }

        // Check at the start of the last measure (step 84)
        checkSectionTransition(84, stepsPerMeasure);
        
        expect(conductorState.formIteration).toBe(1);
        expect(conductorState.target).not.toBe(0.5);
    });

    it('should trigger transition for 5/4 time (20 steps per measure)', () => {
        const stepsPerMeasure = 20;
        // 4 bars of 5/4 = 80 steps (already > 64)
        arranger.totalSteps = 80;
        arranger.stepMap = [];
        for (let i = 0; i < 4; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' }
            });
        }

        // Check at the start of the last measure (step 60)
        checkSectionTransition(60, stepsPerMeasure);
        
        expect(conductorState.formIteration).toBe(1);
        expect(conductorState.target).not.toBe(0.5);
    });

    it('should trigger transition for 6/8 time (12 steps per measure)', () => {
        const stepsPerMeasure = 12;
        // 8 bars of 6/8 = 96 steps
        arranger.totalSteps = 96;
        arranger.stepMap = [];
        for (let i = 0; i < 8; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' }
            });
        }

        // Check at the start of the last measure (step 84)
        checkSectionTransition(84, stepsPerMeasure);
        
        expect(conductorState.formIteration).toBe(1);
        expect(conductorState.target).not.toBe(0.5);
    });
});