import { describe, it, expect } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import fs from 'node:fs';
import path from 'node:path';

// Mock AudioBuffer
class MockAudioBuffer {
    constructor({ length, sampleRate, data }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = data;
    }
    getChannelData() { return this.data; }
}

function readWavFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    let offset = 12;
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) break;
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        
        if (chunkId === 'data') {
            offset += 8;
            const sampleCount = Math.min(chunkSize / 2, (buffer.length - offset) / 2);
            const floatData = new Float32Array(sampleCount);
            
            for (let i = 0; i < sampleCount; i++) {
                const int16 = buffer.readInt16LE(offset + (i * 2));
                floatData[i] = int16 / 32768.0;
            }
            return floatData;
        }
        offset += 8 + chunkSize;
    }
    throw new Error(`Could not find data chunk in WAV file: ${filePath}`);
}

describe('Real Audio Analysis: Multiple Files', () => {
    const analyzer = new ChordAnalyzerLite();

    const testFile = async (filename, wavName, options = {}) => {
        const wavPath = path.resolve('.gemini/tmp', wavName);
        if (!fs.existsSync(wavPath)) {
            console.warn(`WAV file not found: ${wavPath}`);
            return;
        }

        const floatData = readWavFile(wavPath);
        const audioBuffer = new MockAudioBuffer({
            length: floatData.length,
            sampleRate: 44100,
            data: floatData
        });

        const results = await analyzer.analyze(audioBuffer, options);
        
        console.log(`\n--- RESULTS FOR: ${filename} ---`);
        console.log(`DETECTED BPM: ${results.bpm}`);
        console.log(`DETECTED METER: ${results.beatsPerMeasure}/4`);
        console.log(`OFFSET: ${results.downbeatOffset.toFixed(3)}s`);
        console.log(`CHORDS DETECTED: ${results.results.length}`);
        // Log first few chords
        results.results.slice(0, 8).forEach(r => console.log(`  Beat ${r.beat}: ${r.chord}`));
        console.log(`---------------------------------\n`);

        expect(results.bpm).toBeGreaterThan(35);
        expect(results.beatsPerMeasure).toBeGreaterThan(0);

        if (filename === 'dgda.mp3') {
            const chords = results.results.map(r => r.chord);
            expect(chords).toContain('D');
        }
    };

    it('should detect BPM and meter for dgda.mp3', async () => {
        await testFile('dgda.mp3', 'dgda.wav');
    }, 20000);

    it('should detect BPM and meter for Sands.m4a', async () => {
        await testFile('Sands.m4a', 'sands.wav');
    }, 30000);
});
