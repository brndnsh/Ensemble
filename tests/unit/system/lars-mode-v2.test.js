/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conductorState, updateLarsTempo } from '../../../public/conductor.js';
import { ctx, gb, arranger } from '../../../public/state.js';
import { ui } from '../../../public/ui.js';

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
        bpmInput: { classList: { add: vi.fn(), remove: vi.fn() }, style: {} },
        bpmLabel: { classList: { add: vi.fn(), remove: vi.fn() }, textContent: '', style: {} },
        bpmControlGroup: { classList: { add: vi.fn(), remove: vi.fn() } },
        larsIndicator: { style: {} }
    },
    triggerFlash: vi.fn()
}));

describe('Lars Mode Logic V2', () => {
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

    it('should calculate positive drift for high energy sections', () => {
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        expect(conductorState.larsBpmOffset).toBeGreaterThan(0);
    });

    it('should update UI with specific classes and labels', () => {
        conductorState.larsBpmOffset = 2.0; // Fast
        updateLarsTempo(0);
        
        expect(ui.bpmControlGroup.classList.add).toHaveBeenCalledWith('lars-active');
        expect(ui.bpmInput.classList.add).toHaveBeenCalledWith('tempo-push'); // Blue for fast
        expect(ui.bpmLabel.textContent).toContain('↗');
    });

    it('should use tempo-pull for slower drifts', () => {
        conductorState.larsBpmOffset = -2.0; // Slow
        updateLarsTempo(0);
        
        expect(ui.bpmInput.classList.add).toHaveBeenCalledWith('tempo-pull'); // Red for slow
        expect(ui.bpmLabel.textContent).toContain('↘');
    });

    it('should push tempo harder during drum fills (Fill Rush)', () => {
        gb.fillActive = true;
        gb.larsIntensity = 1.0;
        // Chorus (0.9 energy) + Fill (active)
        // Energy offset = 0.4. Max drift 15. Target = 0.4 * 2 * 15 = 12.
        // Fill rush = +5. Total target = 17 BPM.
        
        for(let i=0; i<1000; i++) updateLarsTempo(0);
        
        expect(conductorState.larsBpmOffset).toBeGreaterThan(15);
    });
});
