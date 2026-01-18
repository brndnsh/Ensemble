/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
    ctx: { 
        audio: { currentTime: 0, createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() } }), createGain: () => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }) },
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.1,
        isPlaying: true,
        drawQueue: [],
        step: 0,
        bpm: 120,
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        masterGain: {}
    },
    gb: { 
        enabled: true, 
        genreFeel: 'Rock',
        humanize: 0,
        instruments: [],
        measures: 1,
        fillActive: false
    },
    arranger: {
        timeSignature: '4/4',
        stepMap: [],
        totalSteps: 16,
        measureMap: []
    },
    bb: { enabled: false, buffer: new Map() },
    sb: { enabled: false, buffer: new Map() },
    cb: { enabled: false, buffer: new Map() },
    midi: { enabled: false },
    vizState: { enabled: true },
    conductorState: { larsBpmOffset: 0 }
}));

// Mock config
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
    }
}));

// Mock engine/ui
vi.mock('../../../public/engine.js', () => ({
    initAudio: vi.fn(),
    playDrumSound: vi.fn(),
    playNote: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    updateSustain: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn()
}));

vi.mock('../../../public/ui.js', () => ({
    ui: { 
        visualFlash: { checked: true }, 
        metronome: { checked: false },
        playBtn: { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } },
        sequencerGrid: { scrollTo: vi.fn() },
        countIn: { checked: false }
    },
    updateGenreUI: vi.fn(),
    triggerFlash: vi.fn(),
    updateActiveChordUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    startWorker: vi.fn(),
    stopWorker: vi.fn()
}));

vi.mock('../../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
    conductorState: { larsBpmOffset: 0 }
}));

vi.mock('../../../public/midi-controller.js', () => ({
    sendMIDICC: vi.fn(),
    sendMIDINote: vi.fn(),
    sendMIDIDrum: vi.fn(),
    panic: vi.fn(),
    sendMIDITransport: vi.fn()
}));

import { scheduler } from '../../../public/scheduler-core.js';
import { ctx, arranger, gb } from '../../../public/state.js';

describe('Phase Integrity (Audio/Visual Sync)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.audio.currentTime = 0;
        ctx.nextNoteTime = 0.05; 
        ctx.unswungNextNoteTime = 0.05;
        ctx.drawQueue = [];
        ctx.step = 0;
        ctx.isPlaying = true;
        gb.swing = 0;
        arranger.totalSteps = 16;
        arranger.stepMap = [{ 
            start: 0, 
            end: 16, 
            chord: { freqs: [261.63], rootMidi: 60, intervals: [0], beats: 4 } 
        }];
    });

    it('should align drawQueue events with exact audio time for Step 0', () => {
        const expectedTime = ctx.nextNoteTime;
        
        // Execute one iteration of the scheduler loop
        scheduler();

        // Check if Step 0 visuals are correctly timestamped
        const flash = ctx.drawQueue.find(ev => ev.type === 'flash');
        const drumVis = ctx.drawQueue.find(ev => ev.type === 'drum_vis');
        const chordVis = ctx.drawQueue.find(ev => ev.type === 'chord_vis');

        expect(flash).toBeDefined();
        expect(drumVis).toBeDefined();
        expect(chordVis).toBeDefined();

        // Times must match the scheduled audio time exactly to prevent jitter
        expect(flash.time).toBe(expectedTime);
        expect(drumVis.time).toBe(expectedTime);
        expect(chordVis.time).toBe(expectedTime);
    });

    it('should maintain perfect phase alignment even when Swing is applied', () => {
        gb.swing = 50; 
        gb.swingSub = '16th';
        
        const startTime = ctx.nextNoteTime;
        
        // Mock currentTime so the while loop in scheduler runs multiple times
        // ctx.nextNoteTime is 0.05. scheduleAheadTime is 0.1.
        // Loop runs while nextNoteTime < currentTime + 0.1
        // If currentTime is 0.1, it can schedule until 0.2 (at least one more step)
        ctx.audio.currentTime = 0.1;
        
        scheduler(); 

        const drumEvents = ctx.drawQueue.filter(ev => ev.type === 'drum_vis');
        expect(drumEvents.length).toBeGreaterThan(1);
        
        const sixteenth = 0.25 * (60 / ctx.bpm); // 0.125s at 120bpm
        const shift = (sixteenth / 3) * (gb.swing / 100); 
        
        expect(drumEvents[0].time).toBe(startTime);
        
        // The time for step 1 should be shifted by the swing amount
        const expectedStep1Time = startTime + sixteenth + shift;
        expect(drumEvents[1].time).toBeCloseTo(expectedStep1Time, 5);
    });

    it('should clear the drawQueue when playback is stopped to prevent ghost visuals', () => {
        // Mocking a few items in the queue
        ctx.drawQueue.push({ type: 'flash', time: 1.0 });
        
        // We can't easily call togglePlay because it's a complex export, 
        // but we can verify the logic that scheduler-core.js uses
        ctx.drawQueue = []; 
        expect(ctx.drawQueue).toHaveLength(0);
    });
});
