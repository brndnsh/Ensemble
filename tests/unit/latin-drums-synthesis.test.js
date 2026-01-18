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
                playbackRate: { value: 1 },
                loop: false
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
    }
}));

// Mock utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: vi.fn()
}));

import { playDrumSound } from '../../public/synth-drums.js';
import { ctx, gb } from '../../public/state.js';

describe('Latin Drum Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.audio.currentTime = 10;
        gb.audioBuffers = { noise: {} };
    });

    it('should synthesize Clave using a single sine oscillator', () => {
        playDrumSound('Clave', 10, 1.0);
        expect(ctx.audio.createOscillator).toHaveBeenCalledTimes(1);
        const osc = ctx.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('sine');
    });

    it('should synthesize Congas with both tone and noise components', () => {
        playDrumSound('CongaHigh', 10, 1.0);
        expect(ctx.audio.createOscillator).toHaveBeenCalledTimes(1);
        expect(ctx.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should use a triangle wave for Conga Slaps for more harmonic content', () => {
        playDrumSound('CongaHighSlap', 10, 1.0);
        const osc = ctx.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('triangle');
    });

    it('should synthesize Agogo bells using a multi-oscillator stack', () => {
        playDrumSound('AgogoHigh', 10, 1.0);
        expect(ctx.audio.createOscillator).toHaveBeenCalledTimes(3);
        const osc1 = ctx.audio.createOscillator.mock.results[0].value;
        const osc2 = ctx.audio.createOscillator.mock.results[1].value;
        const body = ctx.audio.createOscillator.mock.results[2].value;
        expect(osc1.type).toBe('sine');
        expect(osc2.type).toBe('triangle');
        expect(body.type).toBe('sine');
    });

    it('should use pulsed noise for the Guiro scrape effect', () => {
        playDrumSound('Guiro', 10, 1.0);
        expect(ctx.audio.createBufferSource).toHaveBeenCalledTimes(1);
        const gain = ctx.audio.createGain.mock.results[0].value;
        // Should have multiple setTargetAtTime calls for the scrape pulses
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(8); // 4 pulses * 2 (up/down)
    });

    it('should synthesize Shaker using high-pass filtered noise', () => {
        playDrumSound('Shaker', 10, 1.0);
        expect(ctx.audio.createBufferSource).toHaveBeenCalledTimes(1);
        expect(ctx.audio.createBiquadFilter).toHaveBeenCalled();
        const filter = ctx.audio.createBiquadFilter.mock.results[0].value;
        expect(filter.type).toBe('highpass');
    });
});
