/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conductorState, updateLarsTempo } from '../../../public/conductor.js';
import { ctx, gb, arranger } from '../../../public/state.js';
import { ui } from '../../../public/ui.js';
import { getSectionEnergy } from '../../../public/form-analysis.js';

vi.mock('../../../public/form-analysis.js', () => ({
    getSectionEnergy: vi.fn((label) => {
        if (label === 'Chorus') return 0.9;
        if (label === 'Intro') return 0.4;
        return 0.5;
    })
}));

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        dispatch: vi.fn()
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        bpmInput: { style: {} },
        bpmLabel: { textContent: '', style: {} }
    },
    triggerFlash: vi.fn()
}));

describe('Lars Mode Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.isPlaying = true;
        gb.larsMode = true;
        gb.larsIntensity = 0.5;
        ctx.bpm = 100;
        conductorState.larsBpmOffset = 0;
        
        arranger.totalSteps = 16;
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Chorus' } }
        ];
    });

    it('should calculate positive drift for high energy sections (Chorus)', () => {
        // Chorus energy is 0.9. (0.9 - 0.5) * 2 = 0.8.
        // Max drift at 0.5 intensity is 4 * 0.5 = 2.
        // Target offset = 0.8 * 2 = 1.6.
        
        // We need to call it multiple times because of the LERP factor (0.005)
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        
        expect(conductorState.larsBpmOffset).toBeGreaterThan(0);
    });

    it('should calculate negative drift for low energy sections (Intro/Outro)', () => {
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Intro' } }
        ];
        // Intro energy is 0.4. (0.4 - 0.5) * 2 = -0.2.
        
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        
        expect(conductorState.larsBpmOffset).toBeLessThan(0);
    });

    it('should scale drift with Lars Intensity', () => {
        gb.larsIntensity = 1.0;
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        const highIntensityOffset = conductorState.larsBpmOffset;

        conductorState.larsBpmOffset = 0;
        gb.larsIntensity = 0.1;
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        const lowIntensityOffset = conductorState.larsBpmOffset;

        expect(Math.abs(highIntensityOffset)).toBeGreaterThan(Math.abs(lowIntensityOffset));
    });

    it('should reset offset when Lars Mode is disabled', () => {
        conductorState.larsBpmOffset = 1.5;
        gb.larsMode = false;
        updateLarsTempo(0);
        expect(conductorState.larsBpmOffset).toBe(0);
    });

    it('should update UI indicators when drift is significant', () => {
        // Force a large offset
        conductorState.larsBpmOffset = 2.0;
        updateLarsTempo(0); // This calls updateBpmUI internally
        
        expect(ui.bpmLabel.textContent).toContain('↗');
        expect(ui.bpmInput.style.color).toBe('var(--orange)');
    });
});
