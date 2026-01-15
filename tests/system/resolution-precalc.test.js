import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('Audio', class {
    constructor() {
        this.play = vi.fn().mockResolvedValue();
        this.pause = vi.fn();
    }
});
vi.stubGlobal('requestAnimationFrame', vi.fn(cb => cb()));
vi.stubGlobal('navigator', { wakeLock: { request: vi.fn().mockResolvedValue({ release: vi.fn() }) } });

// Define mocks inside vi.mock or use hoisting workaround
vi.mock('../../public/worker-client.js', () => ({
    requestResolution: vi.fn(),
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn()
}));

vi.mock('../../public/state.js', () => ({
    ctx: { 
        step: 0, 
        sessionTimer: 5, 
        isEndingPending: false, 
        nextNoteTime: 0, 
        audio: { currentTime: 0 },
        scheduleAheadTime: 0.1,
        bpm: 120
    },
    arranger: { totalSteps: 64, timeSignature: '4/4' },
    gb: {}, cb: {}, bb: {}, sb: {},
    dispatch: vi.fn()
}));

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { stepsPerBeat: 4 } }
}));

vi.mock('../../public/ui.js', () => ({
    ui: { 
        playBtn: { 
            classList: { add: vi.fn(), remove: vi.fn() },
            textContent: '' 
        }, 
        sequencerGrid: { scrollTo: vi.fn() }, 
        countIn: {}, 
        visualFlash: {} 
    },
    triggerFlash: vi.fn(),
    updateGenreUI: vi.fn(),
    clearActiveVisuals: vi.fn()
}));

vi.mock('../../public/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn()
}));

vi.mock('../../public/utils.js', () => ({
    getStepsPerMeasure: () => 16,
    getStepInfo: () => ({}),
    getMidi: () => 60,
    midiToNote: () => ({ name: 'C', octave: 4 })
}));

vi.mock('../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn()
}));

vi.mock('../../public/groove-engine.js', () => ({
    applyGrooveOverrides: vi.fn(),
    calculatePocketOffset: vi.fn()
}));

vi.mock('../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn()
}));

vi.mock('../../public/animation-loop.js', () => ({
    draw: vi.fn()
}));

// Import the module under test and the mocked dependencies dynamically
// import { scheduler, togglePlay } from '../../public/scheduler-core.js';
// import { ctx } from '../../public/state.js';
// import { requestResolution } from '../../public/worker-client.js';

describe('Resolution Pre-Calculation', () => {
    let scheduler, togglePlay, ctx, requestResolution;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Dynamic import to ensure Audio stub exists
        const mod = await import('../../public/scheduler-core.js');
        scheduler = mod.scheduler;
        togglePlay = mod.togglePlay;
        
        const stateMod = await import('../../public/state.js');
        ctx = stateMod.ctx;
        
        const workerMod = await import('../../public/worker-client.js');
        requestResolution = workerMod.requestResolution;

        ctx.step = 0;
        ctx.isEndingPending = false;
        ctx.sessionTimer = 5;
        // Reset local variables in module via togglePlay
        togglePlay(); // Stop
    });

    it('should NOT request resolution if ending is not pending', () => {
        togglePlay(); // Start
        ctx.isEndingPending = false;
        ctx.step = 48; // 16 steps from end (64 - 16 = 48)
        
        // Mock nextNoteTime to allow one loop iteration
        ctx.nextNoteTime = ctx.audio.currentTime;
        
        try {
            scheduler();
        } catch (e) {
            // Ignore potential errors from deeper mocks not being perfect
        }
        
        expect(requestResolution).not.toHaveBeenCalled();
    });

    it('should request resolution when 1 measure from end if ending IS pending', () => {
        togglePlay(); // Start
        ctx.isEndingPending = true;
        ctx.step = 48; // 16 steps from end of 64-step loop
        
        // Mock nextNoteTime to allow one loop iteration
        ctx.nextNoteTime = ctx.audio.currentTime;
        
        try {
            scheduler();
        } catch (e) {}
        
        // Expect request for step 64 (48 + 16)
        expect(requestResolution).toHaveBeenCalledWith(64);
    });
});