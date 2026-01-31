/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render } from 'preact';
import React from 'preact/compat';
import { SequencerGrid } from '../../public/components/SequencerGrid.jsx';
import { dispatch, getState } from '../../public/state.js';
const { groove, arranger } = getState();

describe('Layout Logic Regression', () => {
    let container;

    beforeEach(() => {
        // Polyfill requestAnimationFrame for Preact hooks in happy-dom
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        global.cancelAnimationFrame = (id) => clearTimeout(id);

        container = document.createElement('div');
        container.id = 'sequencerGrid';
        document.body.appendChild(container);

        // Reset state
        groove.measures = 1;
        arranger.timeSignature = '4/4';
        groove.instruments = [{ name: 'Kick', steps: new Array(128).fill(0), symbol: 'K' }];
    });

    afterEach(() => {
        render(null, container);
        container.remove();
    });

    it('should set grid-template-columns based on total steps', async () => {
        render(<SequencerGrid />, container);
        await new Promise(r => setTimeout(r, 0));
        
        const trackSteps = container.querySelector('.track .steps');
        expect(trackSteps).not.toBeNull();
        
        // 1 measure * 16 steps/measure = 16
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(16, 1fr)');
    });

    it('should scale columns when measures increase', async () => {
        groove.measures = 2;
        dispatch('DUMMY'); // Trigger update

        render(<SequencerGrid />, container);
        await new Promise(r => setTimeout(r, 0));
        
        const trackSteps = container.querySelector('.track .steps');
        // 2 measures * 16 steps = 32
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(32, 1fr)');
    });

    it('should adapt to 3/4 time signature', async () => {
        arranger.timeSignature = '3/4'; // 12 steps per measure (16th notes)
        dispatch('DUMMY'); // Trigger update

        render(<SequencerGrid />, container);
        await new Promise(r => setTimeout(r, 0));
        
        const trackSteps = container.querySelector('.track .steps');
        // 1 measure * 12 steps = 12
        expect(trackSteps.style.gridTemplateColumns).toBe('repeat(12, 1fr)');
    });
});