/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    ctx: {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: { 
                    setValueAtTime: vi.fn(), 
                    exponentialRampToValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    value: 0
                },
                detune: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null
            })),
            createGain: vi.fn(() => ({
                gain: { 
                    value: 1, 
                    setValueAtTime: vi.fn(), 
                    exponentialRampToValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                    linearRampToValueAtTime: vi.fn()
                },
                connect: vi.fn()
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { 
                    value: 0, 
                    setValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn()
                },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn()
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn()
            }))
        },
        soloistGain: { connect: vi.fn() }
    },
    sb: { 
        activeVoices: [],
        doubleStops: false
    },
    hb: { 
        activeVoices: []
    }
}));

// Mock utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: vi.fn()
}));

import { playSoloNote } from '../../public/synth-soloist.js';
import { ctx, sb } from '../../public/state.js';

describe('Soloist Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sb.activeVoices = [];
        sb.doubleStops = false;
        ctx.audio.currentTime = 10;
    });

    it('should enforce monophonic voice stealing by default', () => {
        playSoloNote(440, 10, 1.0);
        playSoloNote(880, 11, 1.0); // New note should kill previous

        // The first note's gain should have been told to ramp to 0
        const firstVoiceGain = sb.activeVoices[0].gain.gain;
        // In the code, voices are shifted out of activeVoices.
        // We can check if the first created gain node was cancelled.
        const mockGains = ctx.audio.createGain.mock.results;
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.01);
    });

    it('should allow two voices when doubleStops is enabled', () => {
        sb.doubleStops = true;
        playSoloNote(440, 10, 1.0);
        playSoloNote(554, 10, 1.0); // Same time, double stop

        expect(sb.activeVoices.length).toBe(2);
    });

    it('should apply pitch bends when bendStartInterval is provided', () => {
        playSoloNote(440, 10, 1.0, 0.4, 2); // 2 semitone bend

        const osc = ctx.audio.createOscillator.mock.results[0].value;
        expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(440, expect.any(Number));
    });

    it('should configure vibrato for the "blues" style', () => {
        playSoloNote(440, 10, 1.0, 0.4, 0, 'blues');

        // Vibrato is the 3rd oscillator created
        const vibratoOsc = ctx.audio.createOscillator.mock.results[2].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];
        
        // Blues speed is 4.8 + random
        expect(vibSpeed).toBeGreaterThanOrEqual(4.8);
        expect(vibSpeed).toBeLessThanOrEqual(5.3);
    });

    it('should use mixed sawtooth and triangle oscillators for rich tone', () => {
        playSoloNote(440, 10, 1.0);

        const osc1 = ctx.audio.createOscillator.mock.results[0].value;
        const osc2 = ctx.audio.createOscillator.mock.results[1].value;
        
        expect(osc1.type).toBe('sawtooth');
        expect(osc2.type).toBe('triangle');
    });

    it('should handle rapid note triggers (shredding) without exceeding voice limit', () => {
        sb.doubleStops = false;
        // Trigger 10 notes very rapidly
        for(let i = 0; i < 10; i++) {
            playSoloNote(440 + i*10, 10 + (i * 0.05), 0.1);
        }

        // Only 1 voice should be active at the end since they are all new gestures
        expect(sb.activeVoices.length).toBe(1);
        
        // Old voices should have been told to ramp down
        const mockGains = ctx.audio.createGain.mock.results;
        // Each call creates ~2 gains (main + vibrato). Main is at 0, 2, 4...
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
        expect(mockGains[2].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
    });
});
