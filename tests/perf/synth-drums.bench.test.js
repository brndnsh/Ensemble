
import { describe, it, expect, vi } from 'vitest';

// Mock utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: () => {}
}));

// Mock state
vi.mock('../../public/state.js', () => {
    const audioContextMock = {
        currentTime: 0,
        sampleRate: 44100,
        createStereoPanner: () => ({
            pan: { setValueAtTime: () => {} },
            connect: () => {}
        }),
        createGain: () => ({
            gain: {
                value: 0,
                setValueAtTime: () => {},
                setTargetAtTime: () => {},
                linearRampToValueAtTime: () => {},
                cancelScheduledValues: () => {}
            },
            connect: () => {}
        }),
        createOscillator: () => ({
            frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, setTargetAtTime: () => {} },
            start: () => {},
            stop: () => {},
            connect: () => {},
            type: 'sine',
            onended: null
        }),
        createBufferSource: () => ({
            buffer: null,
            playbackRate: { value: 1 },
            start: () => {},
            stop: () => {},
            connect: () => {},
            loop: false,
            onended: null
        }),
        createBiquadFilter: () => ({
            frequency: { value: 0, setValueAtTime: () => {}, setTargetAtTime: () => {} },
            Q: { value: 0, setValueAtTime: () => {} },
            connect: () => {},
            type: 'lowpass'
        }),
        createBuffer: (channels, length, rate) => ({
            getChannelData: () => new Float32Array(length)
        })
    };

    return {
        playback: {
            audio: audioContextMock,
            drumsGain: { gain: { value: 1 } } // Destination
        },
        groove: {
            lastHatGain: null,
            audioBuffers: {
                noise: {}, // Mock buffer
                hihatMetal: null
            },
            humanize: 10
        }
    };
});

import { playDrumSound } from '../../public/synth-drums.js';

describe('Drum Synth Performance', () => {
    it('measures playDrumSound loop performance', () => {
        const iterations = 10000;
        // Instruments that trigger the specific array check we are optimizing
        const instruments = ['HiHat', 'Open', 'Crash', 'Shaker', 'Agogo', 'Perc', 'Guiro', 'Clave', 'TomHigh', 'CongaHigh', 'BongoHigh'];

        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            const name = instruments[i % instruments.length];
            playDrumSound(name, 0, 1.0);
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`playDrumSound x ${iterations} took ${duration.toFixed(2)}ms`);
        expect(duration).toBeGreaterThan(0);
    });
});
