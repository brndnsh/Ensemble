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
        
        let fullSignal = audioBuffer.getChannelData(0); // Mono
        
        // Handle Trimming
        const startSample = Math.floor((options.startTime || 0) * sampleRate);
        const endSample = options.endTime ? Math.floor(options.endTime * sampleRate) : fullSignal.length;
        const signal = fullSignal.slice(startSample, endSample);
        
        // We analyze every beat to keep it musically relevant
        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);
        const beats = Math.floor(signal.length / samplesPerBeat);
        
        const results = [];

        console.log(`[Analyzer-Lite] Processing ${beats} beats...`);

        for (let b = 0; b < beats; b++) {
            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            
            // Extract Chromagram for this window
            const chroma = this.calculateChromagram(signal.subarray(start, end), sampleRate);
            const chord = this.identifyChord(chroma);
            results.push({ beat: b, chord });

            if (options.onProgress) {
                options.onProgress((b / beats) * 100);
            }
        }

        // --- SECOND PASS: Musician Smoothing ---
        // Look for the consensus chord in a sliding 3-beat window to remove "jitter"
        const smoothed = [];
        let lastConsensus = null;

        for (let i = 0; i < results.length; i++) {
            // Sliding window: [Previous, Current, Next]
            const window = results.slice(Math.max(0, i - 1), Math.min(results.length, i + 2));
            const counts = {};
            window.forEach(r => counts[r.chord] = (counts[r.chord] || 0) + 1);
            
            // Pick the winner
            const consensus = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

            if (consensus !== lastConsensus) {
                smoothed.push({ beat: i, time: i * secondsPerBeat, chord: consensus });
                lastConsensus = consensus;
            }
        }

        return smoothed;
    }

    /**
     * Calculates energy in 12 semitone bins using a bank of targeted 
     * single-frequency filters with frequency weighting.
     */
    calculateChromagram(signal, sampleRate) {
        const chroma = new Float32Array(12).fill(0);
        const len = signal.length;
        const step = 4; // Downsample for performance

        this.pitchFrequencies.forEach(p => {
            let real = 0;
            let imag = 0;
            const angleStep = (2 * Math.PI * p.freq) / sampleRate;

            // Apply Frequency Weighting:
            // High weight for Bass (C1-C3), Medium for Mids (C4-C5), Low for Highs (C6+)
            let weight = 1.0;
            if (p.midi < 48) weight = 3.0;      // Bass depth
            else if (p.midi < 60) weight = 2.0; // Low mids
            else if (p.midi > 80) weight = 0.2; // Ignore high melody noise

            for (let i = 0; i < len; i += step) {
                const angle = i * angleStep;
                real += signal[i] * Math.cos(angle);
                imag += signal[i] * Math.sin(angle);
            }

            const mag = (real * real + imag * imag) * weight;
            chroma[p.bin] += mag;
        });

        // Apply "Harmonic Sharpening"
        // If two adjacent bins (e.g. C and Db) are both high, pick the winner and 
        // suppress the neighbor to prevent "blurry" detections.
        const sharpened = new Float32Array(12);
        for (let i = 0; i < 12; i++) {
            const prev = chroma[(i - 1 + 12) % 12];
            const next = chroma[(i + 1) % 12];
            if (chroma[i] > prev && chroma[i] > next) {
                sharpened[i] = chroma[i];
            }
        }

        // Normalize
        const max = Math.max(...sharpened);
        if (max > 0) {
            for (let i = 0; i < 12; i++) sharpened[i] /= max;
        }

        return sharpened;
    }

    identifyChord(chroma) {
        // Weighted profiles: Root and 3rd are the most defining characteristics.
        // 1.5 = Essential (Root), 1.3 = Quality (3rd), 1.0 = Supporting (5th/7th)
        const profiles = {
            'maj':  { 0: 1.5, 4: 1.3, 7: 1.0 },
            'm':    { 0: 1.5, 3: 1.3, 7: 1.0 },
            '7':    { 0: 1.5, 4: 1.2, 7: 1.0, 10: 1.1 },
            'maj7': { 0: 1.5, 4: 1.2, 7: 1.0, 11: 1.1 },
            'm7':   { 0: 1.5, 3: 1.2, 7: 1.0, 10: 1.1 },
            'sus4': { 0: 1.5, 5: 1.3, 7: 1.0 },
            'dim':  { 0: 1.5, 3: 1.2, 6: 1.2 }
        };

        let bestScore = -1;
        let bestChord = 'C';

        for (let root = 0; root < 12; root++) {
            for (const [type, profile] of Object.entries(profiles)) {
                let score = 0;
                
                // Calculate match score
                for (let i = 0; i < 12; i++) {
                    const chromaIdx = (root + i) % 12;
                    const val = chroma[chromaIdx];
                    
                    if (profile[i]) {
                        // Reward note present in chord
                        score += val * profile[i];
                    } else {
                        // Penalty for energy where it shouldn't be
                        score -= val * 0.5;
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestChord = this.notes[root] + (type === 'maj' ? '' : type);
                }
            }
        }

        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy < 0.05) return 'Rest';

        return bestChord;
    }
}
