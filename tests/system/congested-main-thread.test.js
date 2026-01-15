/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../public/state.js', () => ({
    ctx: {
        audio: { currentTime: 0 },
        isPlaying: true,
        bpm: 120,
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.2,
        step: 0,
        drawQueue: []
    },
    gb: { enabled: true, swing: 0, humanize: 0, instruments: [] },
    cb: { enabled: false, buffer: new Map() },
    bb: { enabled: false, buffer: new Map() },
    sb: { enabled: false, buffer: new Map() },
    arranger: { totalSteps: 64, stepMap: [], timeSignature: '4/4' },
    dispatch: vi.fn(),
    vizState: { enabled: false }
}));

// Mock worker client
vi.mock('../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn()
}));

// Mock engine
vi.mock('../../public/engine.js', () => ({
    playDrumSound: vi.fn(),
    initAudio: vi.fn()
}));

// Mock conductor
vi.mock('../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn()
}));

// Mock ui
vi.mock('../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false }
    },
    updateGenreUI: vi.fn(),
    triggerFlash: vi.fn(),
    updateActiveChordUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

import { ctx } from '../../public/state.js';
import { scheduler } from '../../public/scheduler-core.js';

describe('Main Thread Congestion Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.audio.currentTime = 0;
        ctx.nextNoteTime = 0;
        ctx.unswungNextNoteTime = 0;
        ctx.step = 0;
        ctx.scheduleAheadTime = 0.2;
    });

    it('should schedule multiple steps to catch up if the main thread was blocked', () => {
        // Simulate normal start
        scheduler();
        const firstStep = ctx.step;
        
        // Simulate a 500ms block of the main thread
        // currentTime advances, but scheduler wasn't called.
        ctx.audio.currentTime += 0.5;
        
        // Call scheduler again
        scheduler();
        
        // It should have scheduled many more steps to get ahead of currentTime + scheduleAheadTime
        expect(ctx.step).toBeGreaterThan(firstStep); 
        expect(ctx.nextNoteTime).toBeGreaterThanOrEqual(ctx.audio.currentTime + ctx.scheduleAheadTime);
    });

    it('should not enter an infinite loop if scheduleAheadTime is large', () => {
        ctx.scheduleAheadTime = 1.0; // Large lookahead
        ctx.audio.currentTime = 0;
        
        const start = Date.now();
        scheduler();
        const elapsed = Date.now() - start;
        
        expect(elapsed).toBeLessThan(100); // Should finish quickly
        expect(ctx.nextNoteTime).toBeGreaterThanOrEqual(1.0);
    });
});
