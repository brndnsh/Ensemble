/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unified mock for state and context
vi.mock('../../../public/state.js', () => ({
    playback: { 
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
    groove: { 
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
    bass: { enabled: true, buffer: new Map(), octave: 38 },
    soloist: { enabled: true, buffer: new Map(), octave: 72 },
    chords: { enabled: true, buffer: new Map(), octave: 60 },
    harmony: { enabled: true, buffer: new Map(), octave: 60 },
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

import { scheduler } from '../../../public/scheduler-core.js';
import { draw } from '../../../public/animation-loop.js';
import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi, dispatch } from '../../../public/state.js';
import * as engine from '../../../public/engine.js';

describe('Long-Session Stress & Endurance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 0;
        playback.nextNoteTime = 0;
        playback.step = 0;
        playback.drawQueue = [];
        playback.isPlaying = true;
        bass.buffer.clear();
        soloist.buffer.clear();
        chords.buffer.clear();
        
        global.requestAnimationFrame = vi.fn();
    });

    it('should maintain a stable memory footprint over 1000 simulated measures', () => {
        const stepsToSimulate = 16 * 1000; 
        const secondsPerStep = 0.25 * (60 / playback.bpm); 
        
        vi.spyOn(engine, 'getVisualTime').mockImplementation(() => playback.audio.currentTime - 0.05);

        for (let i = 0; i < stepsToSimulate; i++) {
            playback.audio.currentTime += secondsPerStep;
            
            bass.buffer.set(playback.step, { freq: 100, durationSteps: 1 });
            soloist.buffer.set(playback.step, [{ freq: 400, durationSteps: 1 }]);
            chords.buffer.set(playback.step, [{ freq: 300, durationSteps: 1 }]);
            
            scheduler();
            draw(null); 
            
            if (i % 100 === 0) {
                expect(playback.drawQueue.length).toBeLessThan(350);
                expect(bass.buffer.size).toBeLessThan(10); 
                expect(soloist.buffer.size).toBeLessThan(10);
                expect(chords.buffer.size).toBeLessThan(10);
            }
        }
        
        expect(playback.step).toBeGreaterThanOrEqual(stepsToSimulate);
    });
});
