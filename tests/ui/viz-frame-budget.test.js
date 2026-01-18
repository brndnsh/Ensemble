/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx } from '../../public/state.js';
import { draw } from '../../public/animation-loop.js';

// Mock dependencies
vi.mock('../../public/ui.js', () => ({
    ui: { intensitySlider: { value: '0' } },
    triggerFlash: vi.fn(),
    clearActiveVisuals: vi.fn(),
    updateActiveChordUI: vi.fn()
}));

vi.mock('../../public/engine.js', () => ({
    getVisualTime: vi.fn(() => ctx.audio.currentTime)
}));

vi.mock('../../public/instrument-controller.js', () => ({
    switchMeasure: vi.fn()
}));

describe('Visualizer Frame Budget & Queue Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.isDrawing = true;
        ctx.isPlaying = true;
        ctx.drawQueue = [];
        ctx.audio = { currentTime: 10.0 };
    });

    it('should purge events older than 2 seconds from the queue', () => {
        // Add a very old event
        ctx.drawQueue.push({ type: 'drum_vis', time: 5.0, step: 0 }); // Current is 10.0
        ctx.drawQueue.push({ type: 'drum_vis', time: 10.1, step: 1 });
        
        // Run draw
        draw(null);
        
        // The event at 5.0 should be gone because it's < (10.0 - 2.0)
        expect(ctx.drawQueue.some(e => e.time === 5.0)).toBe(false);
        expect(ctx.drawQueue.length).toBe(1);
    });

    it('should cap the queue at 300 events to prevent memory exhaustion', () => {
        // Fill queue with 500 future events
        for(let i = 0; i < 500; i++) {
            ctx.drawQueue.push({ type: 'drum_vis', time: 20.0, step: i });
        }
        
        expect(ctx.drawQueue.length).toBe(500);
        
        draw(null);
        
        // Code says: if (ctx.drawQueue.length > 300) ctx.drawQueue = ctx.drawQueue.slice(ctx.drawQueue.length - 200);
        expect(ctx.drawQueue.length).toBe(200);
    });

    it('should process all due events in a single frame', () => {
        const now = 10.0;
        ctx.audio.currentTime = now;
        
        // 3 events due now or in the past
        ctx.drawQueue.push({ type: 'drum_vis', time: 9.0, step: 0 });
        ctx.drawQueue.push({ type: 'drum_vis', time: 9.5, step: 1 });
        ctx.drawQueue.push({ type: 'drum_vis', time: 10.0, step: 2 });
        // 1 future event
        ctx.drawQueue.push({ type: 'drum_vis', time: 10.1, step: 3 });
        
        draw(null);
        
        // 3 should have been shifted out and processed
        expect(ctx.drawQueue.length).toBe(1);
        expect(ctx.drawQueue[0].step).toBe(3);
    });
});
