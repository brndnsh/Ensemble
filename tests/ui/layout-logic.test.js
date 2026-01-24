/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderGrid } from '../../public/ui-sequencer-grid.js';
import { groove, arranger } from '../../public/state.js';

// Mock UI object
const mockUI = {
    sequencerGrid: document.createElement('div')
};

vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        groove: { 
            measures: 1, 
            instruments: [{ name: 'Kick', steps: [], symbol: 'K' }] 
        },
        arranger: { timeSignature: '4/4' }
    };
});

describe('Layout Logic Regression', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockUI.sequencerGrid.innerHTML = '';
        groove.measures = 1;
        arranger.timeSignature = '4/4';
    });

    it('should set grid-template-columns based on total steps', () => {
        renderGrid(mockUI);
        
        const trackSteps = mockUI.sequencerGrid.querySelector('.track .steps');
        expect(trackSteps).not.toBeNull();
        
        // 1 measure * 16 steps/measure = 16
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(16, 1fr)');
    });

    it('should scale columns when measures increase', () => {
        groove.measures = 2;
        renderGrid(mockUI);
        
        const trackSteps = mockUI.sequencerGrid.querySelector('.track .steps');
        // 2 measures * 16 steps = 32
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(32, 1fr)');
    });

    it('should adapt to 3/4 time signature', () => {
        arranger.timeSignature = '3/4'; // 12 steps per measure (16th notes)
        renderGrid(mockUI);
        
        const trackSteps = mockUI.sequencerGrid.querySelector('.track .steps');
        // 1 measure * 12 steps = 12
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(12, 1fr)');
    });
});
