/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => ({
    playback: {
        audio: null,
        masterGain: null,
        saturator: null,
        masterLimiter: null,
        reverbNode: null,
        chordsGain: null,
        bassGain: null,
        soloistGain: null,
        harmoniesGain: null,
        drumsGain: null,
        isPlaying: false,
        conductorVelocity: 1.0
    },
    chords: { volume: 0.5, enabled: true, reverb: 0.2 },
    bass: { volume: 0.45, enabled: true, reverb: 0.05 },
    soloist: { volume: 0.5, enabled: true, reverb: 0.6 },
    harmony: { volume: 0.4, enabled: true, reverb: 0.4 },
    groove: { volume: 0.5, enabled: true, reverb: 0.2, audioBuffers: { noise: {} } },
    midi: { enabled: false, muteLocal: false }
}));

vi.mock('../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.4' }
    }
}));

import { initAudio, restoreGains } from '../../public/engine.js';
import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi, dispatch } from '../../public/state.js';

describe('Mix Stress & Headroom Test', () => {
    
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
            reduction: { value: 0 }, // We will mock this for the "Stress" part
            knee: { setValueAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn() },
            frequency: { setValueAtTime: vi.fn() },
            Q: { setValueAtTime: vi.fn() },
            gainNode: { setValueAtTime: vi.fn() },
            type: ''
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        const MockAudioContext = vi.fn().mockImplementation(function() {
            this.state = 'running';
            this.currentTime = 0;
            this.createGain = vi.fn().mockImplementation(createMockNode);
            this.createWaveShaper = vi.fn().mockImplementation(createMockNode);
            this.createDynamicsCompressor = vi.fn().mockImplementation(createMockNode);
            this.createConvolver = vi.fn().mockImplementation(createMockNode);
            this.createBiquadFilter = vi.fn().mockImplementation(createMockNode);
            this.createBuffer = vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(1024)) }));
            this.destination = {};
        });
        global.window.AudioContext = MockAudioContext;
        playback.audio = null;
    });

    it('should maintain cumulative gain below 1.0 before the limiter', () => {
        initAudio();
        restoreGains();

        // Calculate sum of all instrument gains based on actual config.js multipliers:
        // Drums: 0.5 * 0.40 = 0.20
        // Bass: 0.45 * 0.32 = 0.144
        // Chords: 0.5 * 0.30 = 0.15
        // Soloist: 0.5 * 0.38 = 0.19
        // Harmony: 0.4 * 0.22 = 0.088
        // Total = 0.772 (Original was 0.7645)
        
        // Wait, let's re-calculate with updated playNote (it has internal gainMult 1.25 for piano)
        // Actually the test checks the gainNode.setTargetAtTime which is set in restoreGains
        // restoreGains uses state.volume * mult.
        
        const drumGain = playback.drumsGain.gain.setTargetAtTime.mock.calls[0][0];
        const bassGain = playback.bassGain.gain.setTargetAtTime.mock.calls[0][0];
        const chordsGain = playback.chordsGain.gain.setTargetAtTime.mock.calls[0][0];
        const soloistGain = playback.soloistGain.gain.setTargetAtTime.mock.calls[0][0];
        const harmonyGain = playback.harmoniesGain.gain.setTargetAtTime.mock.calls[0][0];

        const totalInstrumentGain = drumGain + bassGain + chordsGain + soloistGain + harmonyGain;
        
        // Verification: The sum should be very safe (~0.77)
        expect(totalInstrumentGain).toBeLessThan(1.0);
        expect(totalInstrumentGain).toBeCloseTo(0.772, 4);
    });

    it('should have additional master headroom when Master Vol is 0.4', () => {
        initAudio();
        // Master Gain = ui.masterVol (0.4) * masterMultiplier (0.85) = 0.34
        const masterGain = playback.masterGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(masterGain).toBeCloseTo(0.34, 4);
    });
});
