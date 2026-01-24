/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => ({
    playback: {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                detune: { setValueAtTime: vi.fn() },
                setPeriodicWave: vi.fn(),
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null
            })),
            createGain: vi.fn(() => ({
                gain: { 
                    value: 1, 
                    setValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn()
                },
                connect: vi.fn()
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn() },
                connect: vi.fn()
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null
            })),
            createPeriodicWave: vi.fn(() => ({}))
        },
        chordsGain: { connect: vi.fn() },
        sustainActive: false
    },
    groove: { audioBuffers: { noise: {} } },
    chords: { activeTab: 'smart' },
    harmony: { enabled: false }
}));

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn()
}));

import { playNote, playChordScratch } from '../../../public/synth-chords.js';
import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi, dispatch } from '../../../public/state.js';

describe('Chord Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
        playback.sustainActive = false;
    });

    it('should use a PeriodicWave for the "Piano" instrument', () => {
        playNote(440, 10, 1.0, { instrument: 'Piano' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.setPeriodicWave).toHaveBeenCalled();
    });

    it('should apply a randomized strum offset based on index', () => {
        playNote(440, 10, 1.0, { index: 2, instrument: 'Piano' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        const startTime = osc.frequency.setValueAtTime.mock.calls[0][1];
        
        // Base time is 10. Index 2 should add approx 0.01 - 0.03s
        expect(startTime).toBeGreaterThan(10.005);
        expect(startTime).toBeLessThan(10.05);
    });

    it('should create a hammer strike noise layer for Piano', () => {
        playNote(440, 10, 1.0, { instrument: 'Piano' });

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
    });

    it('should use a simple triangle wave for the "Warm" instrument', () => {
        playNote(440, 10, 1.0, { instrument: 'Warm' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('triangle');
    });

    it('should implement chord scratch synthesis', () => {
        playChordScratch(10, 0.5);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        const filter = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(filter.type).toBe('bandpass');
    });
});
