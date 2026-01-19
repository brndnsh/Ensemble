import { describe, it, expect } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

/**
 * Mock AudioBuffer since we are in a Node/Vitest environment
 */
class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() { return this.data; }
}

describe('Audio Analyzer Accuracy (Synthetic Ear)', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const createChordBuffer = (noteFreqs, duration = 4.0) => {
        const buffer = new MockAudioBuffer({ length: duration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);
        
        noteFreqs.forEach(freq => {
            for (let i = 0; i < data.length; i++) {
                // Add sine wave for each note
                data[i] += Math.sin(2 * Math.PI * freq * (i / sampleRate)) * 0.3;
            }
        });
        return buffer;
    };

    it('should identify a perfect C Major triad', async () => {
        // C4 (261.63), E4 (329.63), G4 (392.00)
        const buffer = createChordBuffer([261.63, 329.63, 392.00]);
        const { results } = await analyzer.analyze(buffer, { bpm: 60 });
        expect(results[0].chord).toBe('C');
    });

    it('should identify an A Minor triad', async () => {
        // A3 (220.00), C4 (261.63), E4 (329.63)
        const buffer = createChordBuffer([220.00, 261.63, 329.63]);
        const { results } = await analyzer.analyze(buffer, { bpm: 60 });
        expect(results[0].chord).toMatch(/^Am(\/E)?$/);
    });

    it('should identify a G Dominant 7th', async () => {
        // G3 (196.00), B3 (246.94), D4 (293.66), F4 (349.23)
        const buffer = createChordBuffer([196.00, 246.94, 293.66, 349.23]);
        const { results } = await analyzer.analyze(buffer, { bpm: 60 });
        expect(results[0].chord).toBe('G7');
    });

    it('should ignore high-frequency melody noise', async () => {
        // C Major triad + high-pitched "vocal" noise (A6 @ 1760Hz)
        const buffer = createChordBuffer([261.63, 329.63, 392.00, 1760.00]);
        const { results } = await analyzer.analyze(buffer, { bpm: 60 });
        // Frequencies weighted away from highs should still result in C
        expect(results[0].chord).toBe('C');
    });

    it('should handle silence as Rest', async () => {
        const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
        const { results } = await analyzer.analyze(buffer, { bpm: 60 });
        expect(results[0].chord).toBe('Rest');
    });
});
