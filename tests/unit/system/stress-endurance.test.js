/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unified mock for state and context
vi.mock('../../../public/state.js', () => ({
    ctx: { 
        audio: { 
            currentTime: 0,
            createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() } }),
            createGain: () => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })
        },
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.1,
        isPlaying: true,
        drawQueue: [],
        step: 0,
        bpm: 200, 
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        isDrawing: true,
        masterGain: {}
    },
    gb: { 
        enabled: true, 
        genreFeel: 'Rock',
        humanize: 0,
        instruments: [],
        measures: 1,
        fillActive: false,
        followPlayback: false
    },
    arranger: {
        timeSignature: '4/4',
        stepMap: [{ start: 0, end: 100000, chord: { freqs: [261.63], rootMidi: 60, intervals: [0], beats: 4 } }],
        totalSteps: 16,
        measureMap: []
    },
    bb: { enabled: true, buffer: new Map(), octave: 38 },
    sb: { enabled: true, buffer: new Map(), octave: 72 },
    cb: { enabled: true, buffer: new Map(), octave: 60 },
    midi: { enabled: false },
    vizState: { enabled: true },
    conductorState: { larsBpmOffset: 0 }
}));

vi.mock('../../../public/engine.js', () => ({
    getVisualTime: () => 0,
    playDrumSound: vi.fn(),
    playNote: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn()
}));

vi.mock('../../../public/ui.js', () => ({
    ui: { 
        visualFlash: { checked: true }, 
        metronome: { checked: false },
        intensitySlider: { value: '50' },
        playBtn: { textContent: '' }
    },
    triggerFlash: vi.fn(),
    updateActiveChordUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn()
}));

vi.mock('../../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
    conductorState: { larsBpmOffset: 0 }
}));

import { scheduler } from '../../../public/scheduler-core.js';
import { draw } from '../../../public/animation-loop.js';
import { ctx, bb, sb, cb } from '../../../public/state.js';
import * as engine from '../../../public/engine.js';

describe('Long-Session Stress & Endurance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.audio.currentTime = 0;
        ctx.nextNoteTime = 0;
        ctx.step = 0;
        ctx.drawQueue = [];
        ctx.isPlaying = true;
        bb.buffer.clear();
        sb.buffer.clear();
        cb.buffer.clear();
        
        global.requestAnimationFrame = vi.fn();
    });

    it('should maintain a stable memory footprint over 1000 simulated measures', () => {
        const stepsToSimulate = 16 * 1000; 
        const secondsPerStep = 0.25 * (60 / ctx.bpm); 
        
        vi.spyOn(engine, 'getVisualTime').mockImplementation(() => ctx.audio.currentTime - 0.05);

        for (let i = 0; i < stepsToSimulate; i++) {
            ctx.audio.currentTime += secondsPerStep;
            
            bb.buffer.set(ctx.step, { freq: 100, durationSteps: 1 });
            sb.buffer.set(ctx.step, [{ freq: 400, durationSteps: 1 }]);
            cb.buffer.set(ctx.step, [{ freq: 300, durationSteps: 1 }]);
            
            scheduler();
            draw(null); 
            
            if (i % 100 === 0) {
                expect(ctx.drawQueue.length).toBeLessThan(350);
                expect(bb.buffer.size).toBeLessThan(10); 
                expect(sb.buffer.size).toBeLessThan(10);
                expect(cb.buffer.size).toBeLessThan(10);
            }
        }
        
        expect(ctx.step).toBeGreaterThanOrEqual(stepsToSimulate);
    });
});
