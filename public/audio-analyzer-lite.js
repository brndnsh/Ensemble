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

        // Krumhansl-Schmuckler Key Profiles (Major and Minor)
        this.keyProfiles = {
            major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
            minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
        };
    }

    /**
     * Identifies the global key of the audio based on the total chromagram.
     */
    identifyGlobalKey(totalChroma) {
        let bestScore = -1;
        let bestKey = { root: 0, type: 'major' };

        for (let root = 0; root < 12; root++) {
            ['major', 'minor'].forEach(type => {
                let score = 0;
                for (let i = 0; i < 12; i++) {
                    score += totalChroma[(root + i) % 12] * this.keyProfiles[type][i];
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestKey = { root, type };
                }
            });
        }
        return bestKey;
    }

    /**
     * Analyzes an AudioBuffer and returns detected chords and pulse metadata.
     */
    async analyze(audioBuffer, options = {}) {
        // 1. Identify Pulse (BPM, Meter, Downbeat)
        const pulse = this.identifyPulse(audioBuffer, options);
        const bpm = options.bpm || pulse.bpm || 120;
        const beatsPerMeasure = pulse.beatsPerMeasure || 4;
        
        console.log(`[Analyzer-Lite] Pulse Detected: ${bpm} BPM, ${beatsPerMeasure}/4 Meter, Offset: ${pulse.downbeatOffset.toFixed(3)}s`);
        
        const sampleRate = audioBuffer.sampleRate;
        let fullSignal = audioBuffer.getChannelData(0); // Mono
        
        // Handle Trimming & Downbeat Alignment
        // We start analysis exactly on the detected downbeat to ensure measures align.
        const startOffset = options.startTime || 0;
        const alignmentOffset = (pulse.downbeatOffset > 0) ? pulse.downbeatOffset : 0;
        
        const startSample = Math.floor((startOffset + alignmentOffset) * sampleRate);
        const endSample = options.endTime ? Math.floor(options.endTime * sampleRate) : fullSignal.length;
        const signal = fullSignal.slice(startSample, endSample);
        
        // We analyze every beat to keep it musically relevant
        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);
        const beats = Math.floor(signal.length / samplesPerBeat);
        
        // --- PASS 1: Global Key Inference ---
        // Analyze a sparse sample of the signal to find the consensus key efficiently
        const sampleStep = Math.max(1, Math.floor(signal.length / 500000)); // Sample ~500k points
        const sparseSignal = new Float32Array(Math.floor(signal.length / sampleStep));
        for (let i = 0, j = 0; i < signal.length; i += sampleStep, j++) {
            sparseSignal[j] = signal[i];
        }
        const globalChroma = this.calculateChromagram(sparseSignal, sampleRate, { minMidi: 36, maxMidi: 72, step: 8 });
        const globalKey = this.identifyGlobalKey(globalChroma);
        
        if (options.onProgress) options.onProgress(15);
        console.log(`[Analyzer-Lite] Global Key Detected: ${this.notes[globalKey.root]} ${globalKey.type}`);

        const results = [];

        console.log(`[Analyzer-Lite] Processing ${beats} beats...`);

        for (let b = 0; b < beats; b++) {
            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window = signal.subarray(start, end);
            
            // 1. Full Chromagram (for quality)
            const chroma = this.calculateChromagram(window, sampleRate);
            
            // 2. Bass Chromagram (for inversions)
            const bassChroma = this.calculateChromagram(window, sampleRate, { minMidi: 24, maxMidi: 42 });
            let bassNoteIdx = -1;
            let maxBass = 0;
            for (let i = 0; i < 12; i++) {
                if (bassChroma[i] > maxBass) {
                    maxBass = bassChroma[i];
                    bassNoteIdx = i;
                }
            }

            // Identify Chord with Key Bias
            const chord = this.identifyChord(chroma, { 
                keyBias: globalKey,
                bassNote: bassNoteIdx > -1 ? this.notes[bassNoteIdx] : null
            });
            
            results.push({ beat: b, chord });

            if (options.onProgress) {
                // Scale progress from 15% to 100%
                options.onProgress(15 + (b / beats) * 85);
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
                smoothed.push({ beat: i, time: i * secondsPerBeat, chord: consensus, bpm });
                lastConsensus = consensus;
            }
        }

        return {
            results: smoothed,
            bpm,
            beatsPerMeasure,
            downbeatOffset: pulse.downbeatOffset
        };
    }

    /**
     * Identifies the "Pulse" (BPM, Meter, and Downbeat) of the audio using 
     * autocorrelation and phase folding.
     */
    identifyPulse(audioBuffer, options = {}) {
        const signal = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        
        // 1. Calculate Energy Envelope (20ms windows)
        const winSize = Math.floor(sampleRate * 0.02);
        const envelope = [];
        for (let i = 0; i < Math.min(signal.length, sampleRate * 30); i += winSize) { // Analyze first 30s
            let sum = 0;
            const end = Math.min(i + winSize, signal.length);
            for (let j = i; j < end; j++) sum += signal[j] * signal[j];
            envelope.push(Math.sqrt(sum / (end - i)));
        }
        if (options.onProgress) options.onProgress(2);

        // 2. Extract Onsets (Flux)
        const onsets = new Float32Array(envelope.length);
        for (let i = 1; i < envelope.length; i++) {
            onsets[i] = Math.max(0, envelope[i] - envelope[i - 1]);
        }
        if (options.onProgress) options.onProgress(3);

        // 3. Find BPM via autocorrelation
        // Search range: 60 - 180 BPM (150 - 50 steps at 20ms)
        const minLag = 16; 
        const maxLag = 150;
        let bestLag = 75;
        let maxCorr = -1;
        
        // Compute correlation for all lags
        const correlations = new Float32Array(maxLag + 1);

        for (let lag = minLag; lag <= maxLag; lag++) {
            let corr = 0;
            for (let i = 0; i < onsets.length - lag; i++) {
                corr += onsets[i] * onsets[i + lag];
            }
            correlations[lag] = corr;
            
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }
        if (options.onProgress) options.onProgress(5);
        
        console.log(`[Pulse Debug] Initial Best Lag: ${bestLag}`);
        
        // Harmonic Check: Detect if we picked a "measure" pulse (slow) instead of a "beat" pulse (fast)
        const checkHarmonic = (targetLag) => {
            const halfLag = Math.round(targetLag / 2);
            
            // Check for 2x/4x tempo (1/2 lag)
            if (halfLag >= minLag) {
                const scoreHalf = correlations[halfLag];
                
                // Dynamic Threshold:
                // - If < 50 BPM (lag > 60), be stricter (0.75) to avoid double-timing slow vamps.
                // - If > 130 BPM (halfLag < 23), be very strict (0.95) to avoid accidental double-time.
                // - Otherwise, be conservative (0.8) to avoid double-timing acoustic songs.
                let threshold = 0.8;
                if (targetLag > 60) threshold = 0.75;
                else if (halfLag < 23) threshold = 0.95;

                if (scoreHalf > correlations[targetLag] * threshold) {
                    return checkHarmonic(halfLag);
                }
            }
            return targetLag;
        };

        bestLag = checkHarmonic(bestLag);
        
        bestLag = checkHarmonic(bestLag);

        const guessedBPM = Math.round((60 / (bestLag * 0.02)) / 5) * 5;

        // 4. Meter Detection (3/4 vs 4/4)
        let score3 = 0;
        let score4 = 0;
        const lag3 = bestLag * 3;
        const lag4 = bestLag * 4;

        if (onsets.length > lag4) {
            for (let i = 0; i < onsets.length - lag4; i++) {
                score3 += onsets[i] * onsets[i + lag3];
                score4 += onsets[i] * onsets[i + lag4];
            }
        }

        const beatsPerMeasure = score3 > (score4 * 1.1) ? 3 : 4;

        // 5. Downbeat Detection (Phase Alignment)
        const measureSteps = bestLag * beatsPerMeasure;
        const phaseScores = new Float32Array(measureSteps);
        for (let i = 0; i < onsets.length; i++) {
            phaseScores[i % measureSteps] += onsets[i];
        }

        let bestPhase = 0;
        let maxPhaseScore = -1;
        for (let p = 0; p < measureSteps; p++) {
            if (phaseScores[p] > maxPhaseScore) {
                maxPhaseScore = phaseScores[p];
                bestPhase = p;
            }
        }

        return {
            bpm: guessedBPM,
            beatsPerMeasure,
            downbeatOffset: bestPhase * 0.02
        };
    }

    /**
     * Calculates energy in 12 semitone bins using a bank of targeted 
     * single-frequency filters with frequency weighting.
     */
    calculateChromagram(signal, sampleRate, options = {}) {
        const chroma = new Float32Array(12).fill(0);
        const len = signal.length;
        const step = options.step || 4; // Downsample for performance
        const minMidi = options.minMidi || 0;
        const maxMidi = options.maxMidi || 127;

        this.pitchFrequencies.forEach(p => {
            if (p.midi < minMidi || p.midi > maxMidi) return;

            let real = 0;
            let imag = 0;
            const angleStep = (2 * Math.PI * p.freq) / sampleRate;

            // Apply Frequency Weighting:
            // High weight for Bass (C1-C3), Medium for Mids (C4-C5), Low for Highs (C6+)
            let weight = 1.0;
            if (p.midi < 36) weight = 5.0;      // Very low bass
            else if (p.midi < 48) weight = 3.0; // Bass depth
            else if (p.midi < 60) weight = 2.0; // Low mids
            else if (p.midi > 80) weight = 0.1; // Ignore high melody noise

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

    identifyChord(chroma, options = {}) {
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

        // Diatonic Bias: Chords in the key are much more likely.
        const majorDiatonic = [0, 2, 4, 5, 7, 9, 11]; // I ii iii IV V vi vii°
        const minorDiatonic = [0, 2, 3, 5, 7, 8, 10]; // i ii° III iv v VI VII

        let bestScore = -1;
        let bestChordData = { root: 0, type: 'maj' };

        for (let root = 0; root < 12; root++) {
            for (const [type, profile] of Object.entries(profiles)) {
                let score = 0;
                
                // 1. Profile Match
                for (let i = 0; i < 12; i++) {
                    const chromaIdx = (root + i) % 12;
                    const val = chroma[chromaIdx];
                    if (profile[i]) score += val * profile[i];
                    else score -= val * 0.5;
                }

                // 2. Global Key Bias
                if (options.keyBias) {
                    const relativeRoot = (root - options.keyBias.root + 12) % 12;
                    const isDiatonic = options.keyBias.type === 'major' 
                        ? majorDiatonic.includes(relativeRoot)
                        : minorDiatonic.includes(relativeRoot);
                    
                    if (isDiatonic) score *= 1.15; // 15% boost for diatonic chords
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestChordData = { root, type };
                }
            }
        }

        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy < 0.05) return 'Rest';

        let chordName = this.notes[bestChordData.root] + (bestChordData.type === 'maj' ? '' : bestChordData.type);

        // 3. Slash Chord Detection (Inversions)
        if (options.bassNote && options.bassNote !== this.notes[bestChordData.root]) {
            // Check if bass note is strong relative to total energy
            const totalEnergy = chroma.reduce((a, b) => a + b, 0);
            const bassIdx = this.notes.indexOf(options.bassNote);
            const bassEnergy = chroma[bassIdx];
            
            // Significant bass presence (at least 20% of total chromagram energy)
            if (bassEnergy > totalEnergy * 0.2) {
                const root = bestChordData.root;
                const interval = (bassIdx - root + 12) % 12;
                const isChordTone = [3, 4, 5, 7, 10, 11].includes(interval);
                
                if (isChordTone) {
                    chordName += '/' + options.bassNote;
                }
            }
        }

        return chordName;
    }
}
