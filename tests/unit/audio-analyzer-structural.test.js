import { describe, it, expect, vi } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() { return this.data; }
}

describe('Audio Analyzer Structural Snapping', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const addDrumHit = (data, start, vol = 0.8) => {
        const startIdx = Math.floor(start * sampleRate);
        const duration = 0.05; // 50ms hit
        const endIdx = Math.min(data.length, startIdx + Math.floor(duration * sampleRate));
        for (let i = startIdx; i < endIdx; i++) {
            data[i] += (Math.random() * 2 - 1) * vol; // White noise hit for flux
        }
    };

    it('should snap to 120 BPM when duration is exactly 32s (16 bars) despite slightly drifting transients', async () => {
        // 120 BPM = 0.5s per beat. 16 bars = 64 beats = 32.0s.
        const totalDuration = 32.0;
        const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // We simulate transients at 119.5 BPM (approx 0.502s per beat)
        const noisyBeatLen = 60 / 119.5; 
        for (let i = 0; i < 64; i++) {
            addDrumHit(data, i * noisyBeatLen);
        }

        const analysis = await analyzer.identifyPulse(buffer);

        // Without structural snapping, it would likely pick ~119 or 120 (rounded).
        // With snapping, it should see that 32.0s is a PERFECT 16-bar container for 120.0 BPM.
        // Note: analyzer.identifyPulse returns rounded BPM usually, but we updated it to return snapped float.
        expect(analysis.bpm).toBe(120);
        expect(analysis.beatsPerMeasure).toBe(4);
    });

    it('should snap to 90 BPM when duration is 16s (6 bars of 4/4 or 8 bars of 3/4?)', async () => {
        // 90 BPM = 0.666s per beat.
        // 8 bars of 3/4 = 24 beats. 24 * 0.666 = 16.0s.
        // 6 bars of 4/4 = 24 beats. 24 * 0.666 = 16.0s.
        
        const totalDuration = 16.0;
        const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Transients at 89.5 BPM
        const noisyBeatLen = 60 / 89.5;
        for (let i = 0; i < 24; i++) {
            addDrumHit(data, i * noisyBeatLen);
        }

        const analysis = await analyzer.identifyPulse(buffer);
        
        expect(analysis.bpm).toBe(90);
    });

    it('should favor 3/4 structural anchor if transients align better', async () => {
        // 120 BPM in 3/4. 8 bars = 24 beats. Beat = 0.5s. Total = 12.0s.
        const totalDuration = 12.0;
        const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Strong onsets every 3 beats
        for (let i = 0; i < 24; i++) {
            const vol = (i % 3 === 0) ? 1.0 : 0.4;
            addDrumHit(data, i * 0.5, vol);
        }

        const analysis = await analyzer.identifyPulse(buffer);
        expect(analysis.bpm).toBe(120);
        expect(analysis.beatsPerMeasure).toBe(3);
    });
});
