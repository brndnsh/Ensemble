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
     * Analyzes an AudioBuffer and returns detected chords and pulse metadata.
     */
    async analyze(audioBuffer, options = {}) {
        // 1. Identify Pulse (BPM, Meter, Downbeat)
        const pulse = this.identifyPulse(audioBuffer);
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
    identifyPulse(audioBuffer) {
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

        // 2. Extract Onsets (Flux)
        const onsets = new Float32Array(envelope.length);
        for (let i = 1; i < envelope.length; i++) {
            onsets[i] = Math.max(0, envelope[i] - envelope[i - 1]);
        }

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
            
            // Weighting: prefer 90-130 BPM range slightly to break ties
            // 20ms steps: 100 BPM = 600ms = 30 steps.
            // 120 BPM = 25 steps. 60 BPM = 50 steps.
            // Gaussian centered at lag 27 (approx 110 BPM)
            // But let's keep it subtle so we don't force it.
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }
        
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
