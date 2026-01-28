
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
            detune: { setValueAtTime: () => {} },
            start: () => {},
            stop: () => {},
            connect: () => {},
            type: 'sine',
            setPeriodicWave: () => {},
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
        createWaveShaper: () => ({
            curve: null,
            oversample: 'none',
            connect: () => {}
        }),
        createPeriodicWave: () => ({}),
        createBuffer: (channels, length) => ({
            getChannelData: () => new Float32Array(length)
        })
    };

    return {
        playback: {
            audio: audioContextMock,
            chordsGain: { gain: { value: 1 }, connect: () => {} },
            heldNotes: new Set(),
            bandIntensity: 0.9, // Trigger the optimization path (>= 0.8)
            sustainActive: false
        },
        groove: {
            audioBuffers: {
                noise: {},
            },
            humanize: 10
        }
    };
});

import { playNote } from '../../public/synth-chords.js';

describe('Synth Chords Performance', () => {
    it('measures playNote high-intensity performance', () => {
        const iterations = 2000;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            playNote(440, 0, 1.0, { vol: 0.8, index: 0, instrument: 'Piano', muted: false, numVoices: 3 });
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`playNote (Intensity 0.9) x ${iterations} took ${duration.toFixed(2)}ms`);
        expect(duration).toBeGreaterThan(0);
    });
});
