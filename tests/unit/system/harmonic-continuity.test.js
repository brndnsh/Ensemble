/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
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
    gb: { 
        enabled: true, swing: 0, humanize: 0, instruments: [], 
        genreFeel: 'Rock', pendingGenreFeel: null 
    },
    cb: { enabled: false, buffer: new Map() },
    bb: { enabled: false, buffer: new Map() },
    sb: { enabled: false, buffer: new Map() },
    arranger: { totalSteps: 64, stepMap: [], timeSignature: '4/4' },
    midi: { enabled: false, selectedOutputId: null, soloistChannel: 3, chordsChannel: 1, bassChannel: 2, drumsChannel: 10, soloistOctave: 0, chordsOctave: 0, bassOctave: 0, drumsOctave: 0 },
    dispatch: vi.fn(),
    vizState: { enabled: false }
}));

// Mock worker client
vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn()
}));

// Mock engine
vi.mock('../../../public/engine.js', () => ({
    playDrumSound: vi.fn(),
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn()
}));

// Mock conductor
vi.mock('../../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
    conductorState: { larsBpmOffset: 0 }
}));

// Mock ui
vi.mock('../../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false }
    },
    updateGenreUI: vi.fn(),
    triggerFlash: vi.fn(),
    updateActiveChordUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

// Mock instrument-controller
vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn()
}));

import { ctx, gb } from '../../../public/state.js';
import { scheduler } from '../../../public/scheduler-core.js';
import { flushWorker } from '../../../public/worker-client.js';

describe('Harmonic Continuity & Genre Transitions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.audio.currentTime = 0;
        ctx.nextNoteTime = 0;
        ctx.unswungNextNoteTime = 0;
        ctx.step = 0;
        gb.genreFeel = 'Rock';
        gb.pendingGenreFeel = null;
    });

    it('should NOT apply a pending genre mid-measure', () => {
        // Set up a pending genre change
        gb.pendingGenreFeel = { feel: 'Jazz' };
        
        // Start at step 1 (not a measure boundary)
        ctx.step = 1;
        ctx.nextNoteTime = 0.125; // 120BPM, 16th note
        
        scheduler();
        
        // Genre should still be Rock
        expect(gb.genreFeel).toBe('Rock');
        expect(gb.pendingGenreFeel).not.toBeNull();
    });

    it('should apply a pending genre exactly at Step 0 of a measure', () => {
        gb.pendingGenreFeel = { feel: 'Jazz' };
        
        // Advance to just before next measure (assuming 4/4 = 16 steps)
        ctx.step = 15;
        ctx.nextNoteTime = 15 * 0.125;
        ctx.audio.currentTime = 15 * 0.125;
        
        scheduler();
        
        // The first call to scheduleGlobalEvent in the loop will be step 15.
        // Then it advances to step 16.
        // 16 % 16 === 0, so it should apply the genre.
        
        expect(gb.genreFeel).toBe('Jazz');
        expect(gb.pendingGenreFeel).toBeNull();
        
        // It should have flushed the worker to ensure atomic scale change
        expect(flushWorker).toHaveBeenCalled();
    });
});
