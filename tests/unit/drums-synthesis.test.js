/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    ctx: {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn()
            })),
            createGain: vi.fn(() => ({
                gain: { 
                    value: 1, 
                    setValueAtTime: vi.fn(), 
                    exponentialRampToValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn()
                },
                connect: vi.fn()
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn()
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                playbackRate: { value: 1 }
            })),
            createBuffer: vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(100))
            })),
            sampleRate: 44100
        },
        drumsGain: { connect: vi.fn() }
    },
    gb: { 
        humanize: 20, 
        audioBuffers: { noise: {} },
        lastHatGain: null 
    },
    hb: { enabled: false }
}));

// Mock utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: vi.fn()
}));

import { playDrumSound } from '../../public/synth-drums.js';
import { ctx, gb } from '../../public/state.js';

describe('Drum Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gb.lastHatGain = null;
        ctx.audio.currentTime = 10;
        gb.audioBuffers = { noise: {} };
    });

    it('should create a 4-layer model for the Kick drum', () => {
        playDrumSound('Kick', 10, 1.0);

        // Layers: Beater (Osc), Skin (Noise), Knock (Osc), Shell (Osc)
        expect(ctx.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(ctx.audio.createBufferSource).toHaveBeenCalledTimes(1);
        expect(ctx.audio.createGain).toHaveBeenCalledTimes(4);
    });

    it('should use a pre-rendered AudioBuffer for HiHat to optimize CPU', () => {
        playDrumSound('HiHat', 10, 1.0);

        // Should create buffer ONCE (if not cached) and use BufferSource
        expect(ctx.audio.createBuffer).toHaveBeenCalled(); 
        expect(ctx.audio.createBufferSource).toHaveBeenCalled();
        
        // Should use playbackRate for variation
        const source = ctx.audio.createBufferSource.mock.results[0].value;
        expect(source.playbackRate.value).not.toBe(1.0); // Should be jittered
    });

    it('should implement choking logic when a new HiHat starts', () => {
        const mockPrevGain = {
            gain: { 
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn()
            }
        };
        gb.lastHatGain = mockPrevGain;

        playDrumSound('HiHat', 11, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11); 
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.005);
    });

    it('should use a highpass filter for the Snare wires', () => {
        playDrumSound('Snare', 10, 1.0);

        // Snare creates Tone (2 Oscs) and Wires (Noise)
        const filters = ctx.audio.createBiquadFilter.mock.results;
        const wiresFilter = filters.find(f => f.value.type === 'bandpass');
        expect(wiresFilter).toBeDefined();
    });

    it('should use Sidestick synthesis when name is Sidestick', () => {
        playDrumSound('Sidestick', 10, 1.0);

        // Sidestick has 3 layers: Click (Osc), Body (Osc), Snap (Noise)
        expect(ctx.audio.createOscillator).toHaveBeenCalledTimes(2);
        expect(ctx.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });
});
