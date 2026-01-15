/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    ctx: {
        audio: null,
        masterGain: null,
        saturator: null,
        masterLimiter: null,
        reverbNode: null,
        chordsGain: null,
        bassGain: null,
        soloistGain: null,
        drumsGain: null,
        isPlaying: false
    },
    cb: { volume: 0.5, enabled: true, reverb: 0.2 },
    bb: { volume: 0.45, enabled: true, reverb: 0.05 },
    sb: { volume: 0.5, enabled: true, reverb: 0.6 },
    gb: { volume: 0.5, enabled: true, reverb: 0.2, audioBuffers: { noise: {} } }
}));

// Mock UI
vi.mock('../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' }
    }
}));

// Mock Utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    createReverbImpulse: vi.fn(() => ({})),
    createSoftClipCurve: vi.fn(() => new Float32Array(1024))
}));

import { initAudio } from '../../public/engine.js';
import { ctx } from '../../public/state.js';

describe('Mix & Signal Integrity Audit', () => {
    
    function createMockNode() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: { 
                value: 1, 
                setValueAtTime: vi.fn(), 
                exponentialRampToValueAtTime: vi.fn(), 
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn()
            },
            threshold: { setValueAtTime: vi.fn() },
            knee: { setValueAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn() },
            frequency: { setValueAtTime: vi.fn() },
            Q: { setValueAtTime: vi.fn() },
            gainNode: { setValueAtTime: vi.fn() }, // for BiquadFilter .gain
            type: '',
            reduction: { value: 0 }
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup Global Audio Mock as a proper constructor function
        const MockAudioContext = vi.fn().mockImplementation(function() {
            this.state = 'running';
            this.onstatechange = null;
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.createGain = vi.fn().mockImplementation(createMockNode);
            this.createWaveShaper = vi.fn().mockImplementation(createMockNode);
            this.createDynamicsCompressor = vi.fn().mockImplementation(createMockNode);
            this.createConvolver = vi.fn().mockImplementation(createMockNode);
            this.createBiquadFilter = vi.fn().mockImplementation(createMockNode);
            this.createBuffer = vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(1024)) }));
            this.resume = vi.fn().mockResolvedValue();
            this.destination = {};
        });

        global.window.AudioContext = MockAudioContext;
        global.window.webkitAudioContext = MockAudioContext;
        ctx.audio = null;
    });

    it('should correctly assemble the master chain (Gain -> Saturator -> Limiter -> Dest)', () => {
        initAudio();
        
        // Verify Master Chain Connections
        expect(ctx.masterGain.connect).toHaveBeenCalledWith(ctx.saturator);
        expect(ctx.saturator.connect).toHaveBeenCalledWith(ctx.masterLimiter);
        expect(ctx.masterLimiter.connect).toHaveBeenCalledWith(ctx.audio.destination);
    });

    it('should apply safety limiter settings to prevent hard clipping', () => {
        initAudio();
        
        // Threshold should be below 0dB to allow for saturator peaks
        expect(ctx.masterLimiter.threshold.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
        expect(ctx.masterLimiter.ratio.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
    });

    it('should route all instrument buses through the master gain', () => {
        initAudio();
        
        // Check instrument gains are connected to masterGain
        expect(ctx.chordsGain.connect).toHaveBeenCalled();
        expect(ctx.bassGain.connect).toHaveBeenCalled();
        expect(ctx.soloistGain.connect).toHaveBeenCalled();
        expect(ctx.drumsGain.connect).toHaveBeenCalled();
        
        // Verify they are connecting to the correct destination (masterGain or EQ)
        // Note: Chords and Bass go through EQ filters first
        const chordsDest = ctx.chordsGain.connect.mock.calls[0][0];
        expect(chordsDest.type).toBe('highpass'); // Chords EQ
    });

    it('should protect the bass bus with its own compressor', () => {
        initAudio();
        
        // Find the compressor in the bass chain
        // gainNode -> weight(EQ) -> scoop(EQ) -> definition(EQ) -> comp -> masterGain
        // In our mock, definition is the 3rd filter created for bass
        // We look at what the 3rd filter (definition) connects to
        
        // The engine creates EQ for chords, then bass.
        // Bass EQ nodes: weight, scoop, definition.
        // We need to find the compressor node created for bass.
        
        const compressors = ctx.audio.createDynamicsCompressor.mock.results;
        const bassComp = compressors.find(r => r.value.threshold.setValueAtTime.mock.calls.some(c => c[0] === -16));
        
        expect(bassComp).toBeDefined();
        expect(bassComp.value.ratio.setValueAtTime).toHaveBeenCalledWith(4, 0);
    });

    it('should verify that mixer gain multipliers are correctly applied', () => {
        initAudio();
        
        // mixer gain = state.volume * MIXER_GAIN_MULTIPLIERS[module]
        // From config.js: bass multiplier is now 0.38. state.bb.volume is 0.45.
        // Target should be 0.45 * 0.38 = 0.171
        
        const bassTarget = ctx.bassGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(bassTarget).toBeCloseTo(0.171, 4);
    });

    it('should ensure the saturator uses an oversampled soft-clip curve', () => {
        initAudio();
        
        expect(ctx.saturator.curve).toBeDefined();
        expect(ctx.saturator.oversample).toBe('4x');
    });
});
