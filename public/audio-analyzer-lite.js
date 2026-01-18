/**
 * Ensemble Lightweight Audio Analyzer
 * Pure JavaScript implementation of Chromagram-based Chord Recognition.
 * Complexity: O(N) where N is audio samples.
 * Estimated Size: ~10 KB
 */

export class ChordAnalyzerLite {
    constructor() {
        this.notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        // Pre-calculate frequencies for notes from MIDI 24 (C1) to 96 (C7)
        this.pitchFrequencies = [];
        for (let m = 24; m <= 96; m++) {
            this.pitchFrequencies.push({
                midi: m,
                freq: 440 * Math.pow(2, (m - 69) / 12),
                bin: m % 12
            });
        }
    }

    /**
     * Analyzes an AudioBuffer and returns detected chords.
     */
    async analyze(audioBuffer, options = {}) {
        const bpm = options.bpm || 120;
        const sampleRate = audioBuffer.sampleRate;
        const signal = audioBuffer.getChannelData(0); // Mono
        
        // We analyze every beat to keep it musically relevant
        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);
        const beats = Math.floor(signal.length / samplesPerBeat);
        
        const results = [];
        let lastChord = null;

        console.log(`[Analyzer-Lite] Processing ${beats} beats...`);

        for (let b = 0; b < beats; b++) {
            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            
            // Extract Chromagram for this window
            const chroma = this.calculateChromagram(signal.subarray(start, end), sampleRate);
            const chord = this.identifyChord(chroma);

            if (chord !== lastChord) {
                results.push({ beat: b, time: b * secondsPerBeat, chord });
                lastChord = chord;
            }
            
            // Progress callback if provided
            if (options.onProgress) {
                options.onProgress((b / beats) * 100);
            }
        }

        return results;
    }

    /**
     * Calculates energy in 12 semitone bins using a bank of simple 
     * single-frequency DFT (Goertzel-like) filters.
     */
    calculateChromagram(signal, sampleRate) {
        const chroma = new Float32Array(12).fill(0);
        
        // Downsample signal for performance (we only care about frequencies < 2000Hz)
        const step = 4; 
        const len = signal.length;

        this.pitchFrequencies.forEach(p => {
            let real = 0;
            let imag = 0;
            const angleStep = (2 * Math.PI * p.freq) / sampleRate;

            for (let i = 0; i < len; i += step) {
                const angle = i * angleStep;
                real += signal[i] * Math.cos(angle);
                imag += signal[i] * Math.sin(angle);
            }

            // Magnitude squared
            const mag = (real * real + imag * imag);
            chroma[p.bin] += mag;
        });

        // Normalize chroma
        const max = Math.max(...chroma);
        if (max > 0) {
            for (let i = 0; i < 12; i++) chroma[i] /= max;
        }

        return chroma;
    }

    identifyChord(chroma) {
        const profiles = {
            'maj': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
            'm':   [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
            '7':   [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
            'maj7':[1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
            'm7':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
            'sus4':[1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
            'dim': [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0]
        };

        let bestScore = -1;
        let bestChord = 'C';

        for (let root = 0; root < 12; root++) {
            for (const [type, profile] of Object.entries(profiles)) {
                let score = 0;
                for (let i = 0; i < 12; i++) {
                    const chromaIdx = (root + i) % 12;
                    // Boost the score if the note exists in the profile
                    if (profile[i] > 0) {
                        score += chroma[chromaIdx];
                    } else {
                        // Penalty for energy where it shouldn't be (helps distinguish maj from maj7)
                        score -= chroma[chromaIdx] * 0.3;
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestChord = this.notes[root] + (type === 'maj' ? '' : type);
                }
            }
        }

        // If very low energy, call it a rest (silent or too noisy)
        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy < 0.1) return 'Rest';

        return bestChord;
    }
}
