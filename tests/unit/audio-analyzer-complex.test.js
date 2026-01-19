import { describe, it, expect } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import { extractForm } from '../../public/form-extractor.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() { return this.data; }
}

describe('Complex Synthetic Audio Analysis', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const getFreq = (note) => {
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const name = note.slice(0, -1);
        const octave = parseInt(note.slice(-1));
        const index = notes.indexOf(name);
        return 440 * Math.pow(2, (index + (octave - 4) * 12 - 9) / 12);
    };

    const addTone = (data, freq, start, end, vol = 0.3) => {
        for (let i = Math.floor(start * sampleRate); i < Math.floor(end * sampleRate); i++) {
            if (i >= data.length) break;
            // Add tone with a tiny bit of attack/decay to simulate a pluck
            const t = i / sampleRate;
            const envelope = Math.min(1, (t - start) * 50) * Math.min(1, (end - t) * 50);
            data[i] += Math.sin(2 * Math.PI * freq * t) * vol * envelope;
        }
    };

    const addChord = (data, root, type, start, end, vol = 0.3) => {
        const intervals = {
            'maj': [0, 4, 7],
            'm': [0, 3, 7],
            '7': [0, 4, 7, 10],
        };
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const rootIdx = notes.indexOf(root);
        
        // Add root in bass
        addTone(data, getFreq(root + '2'), start, end, vol * 1.5);
        
        // Add triad
        intervals[type].forEach(interval => {
            const freq = getFreq(notes[(rootIdx + interval) % 12] + '4');
            addTone(data, freq, start, end, vol);
        });
    };

    it('should analyze a 12-bar blues with accurate BPM and chords', async () => {
        const bpm = 120;
        const beatLen = 60 / bpm;
        const measureLen = beatLen * 4;
        const totalLen = measureLen * 12;
        
        const buffer = new MockAudioBuffer({ length: totalLen * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        const progression = [
            'C', 'C', 'C', 'C',
            'F', 'F', 'C', 'C',
            'G', 'F', 'C', 'G'
        ];

        progression.forEach((root, i) => {
            addChord(data, root, 'maj', i * measureLen, (i + 1) * measureLen);
            // Stronger "drums" for Spectral Flux
            for (let b = 0; b < 4; b++) {
                addTone(data, 50, (i * 4 + b) * beatLen, (i * 4 + b) * beatLen + 0.1, 0.9);
            }
        });

        // Use a slight startTime to skip any alignment transients
        const analysis = await analyzer.analyze(buffer, { startTime: 0.1 });
        
        expect(analysis.bpm).toBeGreaterThan(110);
        expect(analysis.bpm).toBeLessThan(130);
        
        const chords = analysis.results;
        // Verify that we detected the transitions eventually
        const detectedChords = chords.map(r => r.chord.replace('7', ''));
        expect(detectedChords).toContain('C');
        expect(detectedChords).toContain('F');
        expect(detectedChords).toContain('G');
    });

    it('should identify song sections based on energy', async () => {
        const beatLen = 0.5;
        const measureLen = beatLen * 4;
        const buffer = new MockAudioBuffer({ length: 64 * beatLen * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        const pattern = ['C', 'F', 'C', 'G'];

        // Verse: Quiet (8 measures of C-F-C-G)
        for (let m = 0; m < 8; m++) {
            const root = pattern[m % 4];
            addChord(data, root, 'maj', m * measureLen, (m + 1) * measureLen, 0.1);
        }
        // Chorus: Loud (8 measures of C-F-C-G)
        for (let m = 8; m < 16; m++) {
            const root = pattern[m % 4];
            addChord(data, root, 'maj', m * measureLen, (m + 1) * measureLen, 0.9);
        }

        const analysis = await analyzer.analyze(buffer, { bpm: 120 });
        const sections = extractForm(analysis.results, 4);

        // We expect at least two distinct blocks with different labels
        expect(sections.length).toBeGreaterThanOrEqual(2);
        const labels = sections.map(s => s.label);
        expect(labels[0]).not.toBe(labels[1]);
        // Section A is also acceptable if energy range isn't wide enough for Intro
        expect(['Intro', 'Section A']).toContain(labels[0]);
        expect(['Climax', 'Section B']).toContain(labels[1]);
    });

    it('should suppress harmonics to avoid false chords', async () => {
        // C3 (130.81) + Loud overtones that might look like G or E
        const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);
        const baseFreq = 130.81;
        
        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            data[i] += Math.sin(2 * Math.PI * baseFreq * t) * 0.5; // Fundamental
            data[i] += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.4; // 2nd (Octave)
            data[i] += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.3; // 3rd (G)
        }

        // With suppression, it should still be identifiable as C.
        const { results } = await analyzer.analyze(buffer, { bpm: 120 });
        expect(results[0].chord).toMatch(/^C/);
    });

    it('should robustly identify C7 blues even with chromatic walking bass', async () => {
        const bpm = 120;
        const beatLen = 60 / bpm;
        const measureLen = beatLen * 4;
        
        // 4 Measures of C7
        const buffer = new MockAudioBuffer({ length: measureLen * 4 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Sustained C7 Chord (Piano)
        // Voicing: C3, E4, G4, Bb4
        for (let m = 0; m < 4; m++) {
            addTone(data, getFreq('C3'), m * measureLen, (m + 1) * measureLen, 0.3);
            addTone(data, getFreq('E4'), m * measureLen, (m + 1) * measureLen, 0.3);
            addTone(data, getFreq('G4'), m * measureLen, (m + 1) * measureLen, 0.3);
            addTone(data, getFreq('Bb4'), m * measureLen, (m + 1) * measureLen, 0.3);
        }

        // Walking Bass (Loud)
        // Pattern: Root, 3rd, 5th, 6th (Major Blues)
        // Measure 1: C2, E2, G2, A2
        addTone(data, getFreq('C2'), 0 * beatLen, 1 * beatLen, 0.6);
        addTone(data, getFreq('E2'), 1 * beatLen, 2 * beatLen, 0.6);
        addTone(data, getFreq('G2'), 2 * beatLen, 3 * beatLen, 0.6);
        addTone(data, getFreq('A2'), 3 * beatLen, 4 * beatLen, 0.6);

        // Measure 2: Chromatic Approach to F
        // C2, D2, Eb2, E2 (Targeting F)
        addTone(data, getFreq('C2'), 4 * beatLen, 5 * beatLen, 0.6);
        addTone(data, getFreq('D2'), 5 * beatLen, 6 * beatLen, 0.6);
        addTone(data, getFreq('Eb2'), 6 * beatLen, 7 * beatLen, 0.6);
        addTone(data, getFreq('E2'), 7 * beatLen, 8 * beatLen, 0.6);

        // Measure 3: Arpeggio
        // C2, G2, Bb2, C3
        addTone(data, getFreq('C2'), 8 * beatLen, 9 * beatLen, 0.6);
        addTone(data, getFreq('G2'), 9 * beatLen, 10 * beatLen, 0.6);
        addTone(data, getFreq('Bb2'), 10 * beatLen, 11 * beatLen, 0.6);
        addTone(data, getFreq('C3'), 11 * beatLen, 12 * beatLen, 0.6);

        // Analyze
        const analysis = await analyzer.analyze(buffer, { bpm: 120 });
        const globalKey = analyzer.identifyGlobalKey(analyzer.calculateChromagram(data, sampleRate, { minMidi: 36, maxMidi: 84 }));
        
        console.log('Detected Key:', analyzer.notes[globalKey.root], globalKey.type);
        
        // Expect Global Key to be C (or close enough)
        // Note: The A2 in bass might pull towards F, but C should win.
        expect(analyzer.notes[globalKey.root]).toBe('C');

        // Check Chords
        const detectedChords = analysis.results.map(r => r.chord);
        console.log('Detected Chords:', detectedChords);

        // We want C7 predominantly.
        // The analyzer collapses identical consecutive chords, so we might only get 1-3 entries.
        // We verified they are C-based.
        const nonC = detectedChords.filter(c => !c.startsWith('C'));
        expect(nonC.length).toBe(0); 
        expect(detectedChords.length).toBeGreaterThan(0);
    });
});
