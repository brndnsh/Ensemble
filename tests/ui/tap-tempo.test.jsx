/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render } from 'preact';
import React from 'preact/compat';
import { Transport } from '../../public/components/Transport.jsx';
import { playback, dispatch } from '../../public/state.js';
import { setBpm } from '../../public/app-controller.js';

// Mock state
vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        playback: {
            ...actual.playback,
            bpm: 120,
            isPlaying: false,
            viz: {}
        },
        dispatch: vi.fn()
    };
});

// Mock app-controller
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn((val) => {
        playback.bpm = parseInt(val);
    })
}));

describe('Tap Tempo UI', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.clearAllMocks();
        // Reset tapTimes if possible (it's local to module, but we can't easily reach it)
    });

    it('should call handleTap and setBpm on multiple clicks', async () => {
        render(<Transport />, container);
        const tapBtn = container.querySelector('#tapBtn');
        
        // Use fake timers to control performance.now() if needed, 
        // but simple sequential clicks with small delays should work if performance.now() advances.
        
        const now = performance.now();
        vi.spyOn(performance, 'now').mockReturnValue(now);
        
        tapBtn.click(); // First tap
        
        vi.spyOn(performance, 'now').mockReturnValue(now + 500); // 500ms later (120 BPM)
        tapBtn.click(); // Second tap
        
        expect(setBpm).toHaveBeenCalledWith(120, expect.anything());
    });
});
