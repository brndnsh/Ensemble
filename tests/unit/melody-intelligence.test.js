import { describe, it, expect } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import { extractMelodyForm } from '../../public/form-extractor.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() { return this.data; }
}

describe('Melody Analyzer Intelligence', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const addTone = (data, freq, start, end, vol = 0.3) => {
        const startIdx = Math.floor(start * sampleRate);
        const endIdx = Math.floor(end * sampleRate);
        for (let i = startIdx; i < endIdx; i++) {
            if (i >= data.length) break;
            const t = i / sampleRate;
            const envelope = Math.min(1, (t - start) * 50) * Math.min(1, (end - t) * 50);
            data[i] += Math.sin(2 * Math.PI * freq * t) * vol * envelope;
        }
    };

    it('should favor diatonic notes (B) over non-diatonic (Bb) in C Major via gravity', async () => {
        // C4 = 261.63, B3 = 246.94, Bb3 = 233.08
        const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // We provide Bb and B with SIMILAR energy.
        // Without bias, Bb might win if it's slightly louder.
        // With bias, B should win even if slightly quieter.
        addTone(data, 233.08, 0, 1, 0.4); // Bb3 (Louder)
        addTone(data, 246.94, 0, 1, 0.35); // B3 (Quieter but Diatonic)

        const pulse = { bpm: 60, downbeatOffset: 0 };
        const results = await analyzer.extractMelody(buffer, pulse, {
            keyBias: { root: 0, type: 'major' } // C Major
        });

        expect(results[0].midi % 12).toBe(11); // Should be B (11) not Bb (10)
    });

    it('should heal a melody phrase using consensus', () => {
        // 12-bar melody (3 repetitions of 4 bars)
        // Phrase 1: C D E F (x4 measures)
        // Phrase 2: C D Eb F (x4 measures) - Noisy
        // Phrase 3: C D E F (x4 measures)
        
        const longMelody = [];
        const p1 = [60, 62, 64, 65];
        const p2 = [60, 62, 63, 65]; // Noisy (63 instead of 64)

        const addPhrase = (pattern, startMeasure) => {
            for (let m = 0; m < 4; m++) {
                pattern.forEach((midi, b) => longMelody.push({ beat: (startMeasure + m) * 4 + b, midi }));
            }
        };

        addPhrase(p1, 0); // Measures 0-3
        addPhrase(p2, 4); // Measures 4-7 (Noisy)
        addPhrase(p1, 8); // Measures 8-11

        const healedLong = extractMelodyForm(longMelody, 4);
        
        // Any beat in the middle phrase that was 63 should now be 64 (consensus of phrases 1 and 3)
        // Check Measure 4, Beat 2: (4*4 + 2) = 18
        expect(healedLong[18].midi).toBe(64); 
        expect(healedLong[22].midi).toBe(64);
        expect(healedLong[26].midi).toBe(64);
        expect(healedLong[30].midi).toBe(64);
    });
});
