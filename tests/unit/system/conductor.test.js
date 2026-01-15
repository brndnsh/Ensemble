/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conductorState, updateAutoConductor, checkSectionTransition, applyConductor } from '../../../public/conductor.js';
import { ctx, gb, arranger, dispatch } from '../../../public/state.js';

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
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

describe('Conductor Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.autoIntensity = true;
        ctx.isPlaying = true;
        ctx.bandIntensity = 0.5;
        conductorState.target = 0.5;
        conductorState.stepSize = 0.01;
        conductorState.formIteration = 0;
        
        arranger.totalSteps = 16;
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'A' } }
        ];
    });

    describe('updateAutoConductor', () => {
        it('should ramp intensity towards target', () => {
            conductorState.target = 0.6;
            updateAutoConductor();
            expect(ctx.bandIntensity).toBeGreaterThan(0.5);
        });

        it('should use asymmetric ramping (faster drops)', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            // Test Build
            ctx.bandIntensity = 0.5;
            conductorState.target = 0.7;
            conductorState.stepSize = 0.01;
            updateAutoConductor();
            const buildDiff = ctx.bandIntensity - 0.5;

            // Test Drop
            ctx.bandIntensity = 0.5;
            conductorState.target = 0.3;
            updateAutoConductor();
            const dropDiff = 0.5 - ctx.bandIntensity;

            // Drop should be faster (multiplier 2.5 in code when intensity > target)
            expect(dropDiff).toBeGreaterThan(buildDiff);
        });
    });

    describe('checkSectionTransition', () => {
        it('should trigger a fill and update target energy at loop end', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            gb.enabled = true;
            checkSectionTransition(0, 16); 
            expect(conductorState.formIteration).toBeGreaterThan(0);
        });

        it('should adhere to the Grand Story macro-arc cycles', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            gb.enabled = true;
            
            // Cycle 0: Warm up (Macro Ceiling 0.45)
            conductorState.formIteration = 0;
            checkSectionTransition(0, 16);
            expect(conductorState.target).toBeLessThanOrEqual(0.45 + 0.15); 

            // Cycle 4: The Peak (Macro Floor 0.6)
            conductorState.formIteration = 4;
            checkSectionTransition(0, 16);
            expect(conductorState.target).toBeGreaterThanOrEqual(0.6 - 0.15);
        });
    });
});
