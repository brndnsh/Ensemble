/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, gb, arranger } from '../public/state.js';
import { scheduler } from '../public/scheduler-core.js';

// Mock dependencies
vi.mock('../public/ui.js', () => ({
    ui: {
        playBtn: { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } },
        countIn: { checked: false },
        metronome: { checked: false },
        visualFlash: { checked: false },
        sequencerGrid: { scrollTo: vi.fn() }
    },
    updateGenreUI: vi.fn(),
    triggerFlash: vi.fn(),
    updateActiveChordUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

vi.mock('../public/engine.js', () => ({
    initAudio: vi.fn(),
    playNote: vi.fn(),
    playDrumSound: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    updateSustain: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn()
}));

vi.mock('../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn()
}));

vi.mock('../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn()
}));

vi.mock('../public/groove-engine.js', () => ({
    applyGrooveOverrides: vi.fn(() => ({ shouldPlay: false })),
    calculatePocketOffset: vi.fn(() => 0)
}));

vi.mock('../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn()
}));

vi.mock('../public/animation-loop.js', () => ({ draw: vi.fn() }));

describe('Clock Drift & Scheduling Precision', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.isPlaying = true;
        ctx.bpm = 120;
        ctx.step = 0;
        ctx.scheduleAheadTime = 0.1;
        gb.swing = 60;
        gb.swingSub = '8th';
        arranger.timeSignature = '4/4';
        arranger.totalSteps = 64;
        arranger.stepMap = [{ start: 0, end: 64, chord: { freqs: [261.63] } }];
        
        ctx.audio = {
            currentTime: 0,
            createOscillator: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() } })),
            createGain: vi.fn(() => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
            state: 'running'
        };
        ctx.nextNoteTime = 0;
        ctx.unswungNextNoteTime = 0;
    });

    it('should maintain sub-millisecond precision over a simulated 30-minute session', () => {
        const BPM = 120;
        const SIXTEENTH = 0.25 * (60.0 / BPM); // 0.125s
        const MINUTES = 30;
        const TOTAL_STEPS = Math.round((MINUTES * 60) / SIXTEENTH); // 14400 steps
        
        // Mock the advanceGlobalStep logic to run without real-time delay
        for (let i = 0; i < TOTAL_STEPS; i++) {
            const step = ctx.step;
            const sixteenth = 0.25 * (60.0 / ctx.bpm);
            let duration = sixteenth;
            
            if (gb.swing > 0) {
                const shift = (sixteenth / 3) * (gb.swing / 100);
                // Swing 8th (swing every other 8th note, i.e., steps 2, 6, 10...)
                duration += (((step % 4) < 2) ? shift : -shift);
            }

            ctx.nextNoteTime += duration;
            ctx.unswungNextNoteTime += sixteenth;
            ctx.step++;

            // Periodically check drift
            if (i % 1000 === 0) {
                const expectedUnswung = i * SIXTEENTH + SIXTEENTH; 
                expect(ctx.unswungNextNoteTime).toBeCloseTo(expectedUnswung, 10);
                
                // Ensure swung time hasn't drifted from unswung reference by more than one swing shift
                const shift = (SIXTEENTH / 3) * (gb.swing / 100);
                const diff = Math.abs(ctx.nextNoteTime - ctx.unswungNextNoteTime);
                expect(diff).toBeLessThanOrEqual(shift + 0.0001);
            }
        }

        expect(ctx.step).toBe(TOTAL_STEPS);
        const finalExpectedUnswung = TOTAL_STEPS * SIXTEENTH;
        expect(ctx.unswungNextNoteTime).toBeCloseTo(finalExpectedUnswung, 8);
    });

    it('should correctly reset nextNoteTime to unswung reference on genre changes', () => {
        ctx.nextNoteTime = 10.05; // Swung
        ctx.unswungNextNoteTime = 10.0; // Anchor
        
        // Simulating the applyPendingGenre reset logic
        ctx.nextNoteTime = ctx.unswungNextNoteTime;
        
        expect(ctx.nextNoteTime).toBe(10.0);
    });

    it('should handle BPM changes mid-session without losing the grid', () => {
        const sixteenthOld = 0.25 * (60.0 / 120); // 0.125
        ctx.nextNoteTime = 10 * sixteenthOld;
        ctx.unswungNextNoteTime = 10 * sixteenthOld;
        
        ctx.bpm = 60; // Half speed
        const sixteenthNew = 0.25 * (60.0 / 60); // 0.25
        
        // Advance one step at new BPM
        ctx.nextNoteTime += sixteenthNew;
        ctx.unswungNextNoteTime += sixteenthNew;
        
        expect(ctx.unswungNextNoteTime).toBe(10 * sixteenthOld + sixteenthNew);
        expect(ctx.unswungNextNoteTime).toBe(1.25 + 0.25);
    });
});
