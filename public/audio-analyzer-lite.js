/**
 * Ensemble Lightweight Audio Analyzer
 * Pure JavaScript implementation of Chromagram-based Chord Recognition.
 * Complexity: O(N) where N is audio samples.
 */

// Helper to allow UI updates during heavy processing
const yieldToMain = () => new Promise(r => setTimeout(r, 0));

export class ChordAnalyzerLite {
    constructor() {
        /** @type {string[]} */
        this.notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        
        /** 
         * Pre-calculate frequencies for notes from MIDI 24 (C1) to 96 (C7)
         * @type {Array<{midi: number, freq: number, bin: number}>} 
         */
        this.pitchFrequencies = [];
        for (let m = 24; m <= 96; m++) {
            this.pitchFrequencies.push({
                midi: m,
                freq: 440 * Math.pow(2, (m - 69) / 12),
                bin: m % 12
            });
        }

        /** 
         * Krumhansl-Schmuckler Key Profiles (Major and Minor)
         * Weights used for global key identification.
         */
        this.keyProfiles = {
            major: [6.5, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 5.0, 2.0, 3.5, 2.0, 3.0],
            minor: [6.5, 2.5, 3.5, 5.0, 2.5, 3.5, 2.5, 4.5, 4.0, 2.5, 3.5, 3.0],
            dominant: [7.5, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 5.0, 2.0, 3.5, 4.5, 2.0], // Stronger Root and b7
            bluesMaj: [7.5, 1.0, 2.0, 2.5, 6.0, 4.0, 1.5, 4.5, 1.5, 2.0, 5.5, 1.0], // Strong 3, b7
            bluesMin: [7.5, 1.0, 2.0, 6.0, 2.0, 4.0, 1.5, 4.5, 1.5, 2.0, 5.5, 1.0]  // Strong b3, b7
        };
    }

    /**
     * Identifies the global key and tuning offset of the audio.
     * Includes a high-res rotation check to handle tuning drift.
     */
    identifyGlobalKey(totalChroma) {
        let bestScore = -1;
        let bestKey = { root: 0, type: 'major', tuningOffset: 0 };

        // Test -2.0 to +2.0 semitones in 0.1 steps (higher res)
        for (let offset = -20; offset <= 20; offset++) {
            const rotatedChroma = this.rotateChroma(totalChroma, offset * 0.1);
            
            for (let root = 0; root < 12; root++) {
                ['major', 'minor', 'dominant', 'bluesMaj', 'bluesMin'].forEach(type => {
                    let score = 0;
                    for (let i = 0; i < 12; i++) {
                        score += rotatedChroma[(root + i) % 12] * this.keyProfiles[type][i];
                    }

                    // Bias towards zero tuning offset (favors standard 440Hz)
                    const offsetBias = 1.0 - (Math.abs(offset) * 0.02);
                    // Strong bias towards dominant/blues for groovier signals
                    const typeBias = (type.startsWith('blues')) ? 1.2 : (type === 'dominant') ? 1.15 : 1.0;
                    
                    score *= (offsetBias * typeBias);

                    if (score > bestScore) {
                        bestScore = score;
                        bestKey = { root, type, tuningOffset: offset * 0.1 };
                    }
                });
            }
        }
        return bestKey;
    }

    /**
     * Identifies the key from a chromagram without tuning search.
     * Used for fast local key estimation during analysis.
     */
    identifySimpleKey(chroma) {
        let bestScore = -1;
        let bestKey = { root: 0, type: 'major' };

        for (let root = 0; root < 12; root++) {
            ['major', 'minor', 'dominant', 'bluesMaj', 'bluesMin'].forEach(type => {
                let score = 0;
                for (let i = 0; i < 12; i++) {
                    score += chroma[(root + i) % 12] * this.keyProfiles[type][i];
                }
                
                // Bias (same as Global)
                const typeBias = (type.startsWith('blues')) ? 1.2 : (type === 'dominant') ? 1.15 : 1.0;
                score *= typeBias;

                if (score > bestScore) {
                    bestScore = score;
                    bestKey = { root, type, score };
                }
            });
        }
        return bestKey;
    }

    /**
     * Rotates a 12-bin chromagram by a fractional semitone using linear interpolation.
     */
    rotateChroma(chroma, amount) {
        if (amount === 0) return chroma;
        const result = new Float32Array(12);
        for (let i = 0; i < 12; i++) {
            const sourceIdx = (i - amount + 12) % 12;
            const idx1 = Math.floor(sourceIdx);
            const idx2 = (idx1 + 1) % 12;
            const frac = sourceIdx - idx1;
            result[i] = chroma[idx1] * (1 - frac) + chroma[idx2] * frac;
        }
        return result;
    }

    /**
     * Analyzes an AudioBuffer and returns detected chords and pulse metadata.
     */
    async analyze(audioBuffer, options = {}) {
        // 1. Identify Pulse (BPM, Meter, Downbeat)
        const pulse = await this.identifyPulse(audioBuffer, options);
        
        // Ensure we have a valid numeric BPM
        let bpm = 120;
        if (typeof options.bpm === 'number' && options.bpm > 0) bpm = options.bpm;
        else if (typeof pulse.bpm === 'number' && pulse.bpm > 0) bpm = pulse.bpm;
        
        const beatsPerMeasure = pulse.beatsPerMeasure || 4;
        
        // console.log(`[Analyzer-Lite] Pulse Detected: ${bpm} BPM, ${beatsPerMeasure}/4 Meter, Offset: ${pulse.downbeatOffset.toFixed(3)}s`);
        
        const sampleRate = audioBuffer.sampleRate;
        let fullSignal = audioBuffer.getChannelData(0); // Mono
        
        // Handle Trimming & Downbeat Alignment
        // We start analysis exactly on the detected downbeat to ensure measures align.
        const startOffset = options.startTime || 0;
        // In synthetic tests without transients, downbeatOffset might be 0 but we check for sanity
        const alignmentOffset = (pulse.downbeatOffset >= 0) ? pulse.downbeatOffset : 0;
        
        let startSample = Math.floor((startOffset + alignmentOffset) * sampleRate);
        // Safety: If alignment offset pushes us past the end, start at 0
        if (startSample >= fullSignal.length) {
            console.warn(`[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) exceeds signal length. Starting at 0.`);
            startSample = 0;
        }

        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);

        // Safety: If alignment offset leaves less than one beat, but the original signal was long enough, reset to 0
        if (fullSignal.length - startSample < samplesPerBeat && fullSignal.length >= samplesPerBeat) {
            console.warn(`[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) leaves insufficient data (< 1 beat). Resetting to 0.`);
            startSample = Math.floor(startOffset * sampleRate);
        }
        
        const endSample = options.endTime ? Math.floor(options.endTime * sampleRate) : fullSignal.length;
        const signal = fullSignal.slice(startSample, endSample);
        
        const beats = Math.floor(signal.length / samplesPerBeat);
        
        // --- PASS 1: Global Key Inference ---
        // Analyze the entire signal with a large step to find the consensus key.
        // We raise minMidi to 48 (C3) to ignore the walking bass, which is chromatical and confusing for key detection.
        const globalChroma = this.calculateChromagram(signal, sampleRate, { 
            minMidi: 48, 
            maxMidi: 84, 
            skipSharpening: true,
            suppressHarmonics: false,
            step: Math.max(4, Math.floor(signal.length / 1000000)) 
        });
        const globalKey = this.identifyGlobalKey(globalChroma);
        const tuningOffset = globalKey.tuningOffset;
        
        if (options.onProgress) options.onProgress(15);
        // console.log(`[Analyzer-Lite] Global Key Detected: ${this.notes[globalKey.root]} ${globalKey.type} (Tuning: ${tuningOffset.toFixed(2)} semitones)`);
        
        const results = [];
        let lastChord = 'Rest';
        
        // Local Key Tracking
        const rollingChroma = new Float32Array(12).fill(0);
        const ROLL_DECAY = 0.1; // Fast adaptation for rapid modulation (Coltrane changes)

        // console.log(`[Analyzer-Lite] Processing ${beats} beats...`);

        for (let b = 0; b < beats; b++) {
            if (b % 10 === 0) await yieldToMain();

            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window = signal.subarray(start, end);
            
            // Calculate relative energy for this beat
            const energy = Math.sqrt(window.reduce((sum, x) => sum + x * x, 0) / window.length);

            // 1. Full Chromagram (for quality)
            // We raise minMidi to 48 (C3) to ignore the walking bass range for chord quality detection.
            // This prevents bass notes (E, G, A) from being interpreted as the Root of the chord.
            // We DISABLE harmonic suppression because it removes the Chord Root/5th when the Bass plays the Root!
            let chroma = this.calculateChromagram(window, sampleRate, { 
                minMidi: 48, 
                maxMidi: 88,
                suppressHarmonics: false 
            });
            if (tuningOffset !== 0) chroma = this.rotateChroma(chroma, tuningOffset);
            
            // Update Rolling Chroma (Local Key Context)
            if (energy > 0.0001) {
                for (let i = 0; i < 12; i++) {
                    rollingChroma[i] = rollingChroma[i] * ROLL_DECAY + chroma[i] * (1 - ROLL_DECAY);
                }
            }
            const localKey = this.identifySimpleKey(rollingChroma);
            
            // 2. Bass Chromagram (for inversions)
            let bassChroma = this.calculateChromagram(window, sampleRate, { 
                minMidi: 24, 
                maxMidi: 42,
                suppressHarmonics: false 
            });
            if (tuningOffset !== 0) bassChroma = this.rotateChroma(bassChroma, tuningOffset);

            // Identify Chord with Local Key Bias
            let chord = 'Rest';
            if (energy > 0.0001) {
                chord = this.identifyChord(chroma, { 
                    keyBias: localKey,
                    bassNote: this.getStrongestBassNote(bassChroma)
                });
                
                // If it's a weak detection, maybe keep the last chord? 
                // This helps with walking bass passing tones.
                if (chord === 'Rest' && lastChord !== 'Rest' && energy > 0.0002) {
                    chord = lastChord;
                }
            }
            
            results.push({ beat: b, chord, energy, localKey });
            lastChord = chord;
        
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
            
            // Average energy in the same window
            const avgEnergy = window.reduce((a, b) => a + b.energy, 0) / window.length;
            
            // Pick the winner
            const consensus = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

            if (consensus !== lastConsensus || (i === 0 && smoothed.length === 0)) {
                smoothed.push({ 
                    beat: i, 
                    time: i * secondsPerBeat, 
                    chord: consensus, 
                    bpm,
                    energy: avgEnergy 
                });
                lastConsensus = consensus;
            }
        }

        // Final Safety: If smoothed is still empty but we have beats, push a generic result
        if (smoothed.length === 0 && results.length > 0) {
            smoothed.push({
                beat: 0,
                time: 0,
                chord: results[0].chord,
                bpm,
                energy: results[0].energy
            });
        }

        return {
            results: smoothed,
            bpm,
            candidates: pulse.candidates,
            beatsPerMeasure,
            downbeatOffset: pulse.downbeatOffset
        };
    }

    /**
     * Identifies the "Pulse" (BPM, Meter, and Downbeat) of the audio using 
     * Spectral Flux for robust onset detection and autocorrelation.
     */
    async identifyPulse(audioBuffer, options = {}) {
        const signal = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        
        // If a valid BPM is provided, we skip the search and just find the downbeat
        const manualBpm = typeof options.bpm === 'number' && options.bpm > 0 ? options.bpm : 0;
        
        // 1. Calculate Spectral Flux...
        // We use 20ms windows (50Hz resolution) to capture transients
        const winSize = Math.floor(sampleRate * 0.02);
        const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
        const numWindows = Math.floor(Math.min(signal.length, sampleRate * 30) / hopSize) - 2;
        
        const flux = new Float32Array(numWindows);
        let lastSpectrum = new Float32Array(12); // Use 12-bin chroma spectrum for flux

        for (let w = 0; w < numWindows; w++) {
            if (w % 500 === 0) await yieldToMain();

            const start = w * hopSize;
            const window = signal.subarray(start, start + winSize);
            
            // Simplified Spectral Power for this window
            const currentSpectrum = this.calculateChromagram(window, sampleRate, { 
                step: 8, 
                skipSharpening: true,
                minMidi: 48, // Focus on rhythmic range (C3 and up, ignoring walking bass)
                maxMidi: 96,
                suppressHarmonics: false
            });

            // Flux = Sum of positive changes across bins
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                const diff = currentSpectrum[i] - lastSpectrum[i];
                if (diff > 0) sum += diff;
            }
            flux[w] = sum;
            lastSpectrum = currentSpectrum;
        }

        // Half-wave rectification and normalization of flux
        const maxFlux = Math.max(...flux);
        const onsets = flux.map(v => v / (maxFlux || 1));

        if (options.onProgress) options.onProgress(5);

                        // 3. Find BPM via autocorrelation (Search range: 25 - 240 BPM)
                        // Search range: 25 - 240 BPM (240 - 25 steps at 10ms)
                        const minLag = 25; 
                        const maxLag = 240;
                        let bestLag = 60;
                        let maxCorr = -1;
                        const correlations = new Float32Array(maxLag + 1);
                
                        if (manualBpm > 0) {
                            bestLag = Math.round(60 / (manualBpm * 0.01));
                        } else {
                            // Compute correlation for all lags
                            for (let lag = minLag; lag <= maxLag; lag++) {
                                if (lag % 20 === 0) await yieldToMain();

                                let corr = 0;
                                for (let i = 0; i < onsets.length - lag; i++) {
                                    corr += onsets[i] * onsets[i + lag];
                                }
                                
                                // Musical Range Bias: Favor 60-160 BPM
                                // We keep this mild to avoid forcing double-time on slow tracks
                                let bias = 1.0;
                                // Sweet spot (80-140)
                                if (lag >= 42 && lag <= 75) bias = 1.25;
                                // Acceptable range (60-160)
                                else if (lag >= 37 && lag <= 100) bias = 1.10;
                                // Penalize very slow (< 50 BPM) to avoid half-time errors
                                else if (lag > 120) bias = 0.8;
                
                                correlations[lag] = corr;
                                
                                if (corr * bias > maxCorr) {
                                    maxCorr = corr * bias;
                                    bestLag = lag;
                                }
                            }
                        }
                        if (options.onProgress) options.onProgress(5);
                        
                        // console.log(`[Pulse Debug] Initial Best Lag: ${bestLag} (${Math.round(60/(bestLag*0.01))} BPM)`);
                        
                        // Harmonic Check: Detect if we picked a "sub-beat" pulse (too fast) instead of a "beat" pulse.
                        const checkHarmonic = (targetLag) => {
                            let currentLag = targetLag;
                            
                            // 1. Check for slower tempos (downward)
                            let changed = true;
                            while (changed) {
                                changed = false;
                                // Check for 2x, 3x, 4x lags (1/2, 1/3, 1/4 tempo)
                                for (const m of [2, 3, 4]) {
                                    const slowerLag = Math.round(currentLag * m);
                                    if (slowerLag > maxLag) continue;
                
                                    const scoreSlower = correlations[slowerLag];
                                    const targetScore = correlations[currentLag];
                                    
                                    // Default threshold for switching to a slower tempo
                                    let threshold = 0.75;

                                    // If current BPM is already "healthy" (70-130 BPM, Lag 46-85), 
                                    // be reluctant to halve it unless the slower pulse is stronger.
                                    if (currentLag >= 46 && currentLag <= 85) {
                                        threshold = 1.25;
                                    }
                                    
                                    // If slower lag corresponds to < 50 BPM (Lag > 120), require massive evidence
                                    if (slowerLag > 120) threshold = 2.5;

                                    if (scoreSlower > targetScore * threshold) {
                                        currentLag = slowerLag;
                                        changed = true;
                                        break; 
                                    }
                                }                            
                            }

                            // 2. Check for faster tempos (upward) if we are stuck in the mud (< 55 BPM)
                            // Often autocorrelation favors the half-note or whole-note in swing/groove.
                            // We prefer the quarter note (approx 70-140 BPM).
                            if (currentLag > 109) { // > 109 means < 55 BPM
                                const fasterLag = Math.round(currentLag / 2);
                                if (fasterLag >= minLag) {
                                    const scoreFaster = correlations[fasterLag];
                                    const scoreCurrent = correlations[currentLag];
                                    
                                    // If the faster pulse is at least 40% of the slow one, take it.
                                    // It's better to tap twice as fast than fall asleep.
                                    if (scoreFaster > scoreCurrent * 0.4) {
                                        // console.log(`[Pulse Debug] Upgrading from ${Math.round(60/(currentLag*0.01))} BPM to ${Math.round(60/(fasterLag*0.01))} BPM (Double Time)`);
                                        currentLag = fasterLag;
                                    }
                                }
                            }

                            return currentLag;
                        };
        bestLag = checkHarmonic(bestLag);

        const primaryBPM = Math.round((60 / (bestLag * 0.01)));
        
        // Generate candidates (Half, Normal, Double)
        const candidatesMap = new Map();
        
        [2, 1, 0.5, 4, 0.25].forEach(mult => {
            const lag = Math.round(bestLag * mult);
            if (lag >= minLag && lag <= maxLag) {
                const bpm = Math.round(60 / (lag * 0.01));
                if (!candidatesMap.has(bpm)) {
                    candidatesMap.set(bpm, correlations[lag] || 0);
                }
            }
        });

        const candidates = Array.from(candidatesMap.entries()).map(([bpm, score]) => ({ bpm, score }));

        // Boost the primary BPM (selected by checkHarmonic) to ensure it wins
        const primaryCandidate = candidates.find(c => c.bpm === primaryBPM);
        if (primaryCandidate) {
            primaryCandidate.score *= 3.0; 
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

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

        const beatsPerMeasure = score3 > (score4 * 1.4) ? 3 : 4; // Stronger bias for 4/4

        // 5. Downbeat Detection (Phase Alignment)
        const measureSteps = bestLag * beatsPerMeasure;
        const phaseScores = new Float32Array(measureSteps);
        for (let i = 0; i < onsets.length; i++) {
            phaseScores[i % measureSteps] += onsets[i];
        }

        let bestPhase = 0;
        let maxPhaseScore = 0;
        for (let p = 0; p < measureSteps; p++) {
            if (phaseScores[p] > maxPhaseScore) {
                maxPhaseScore = phaseScores[p];
                bestPhase = p;
            }
        }

        return {
            bpm: candidates[0]?.bpm || primaryBPM,
            candidates: candidates.length > 0 ? candidates : [{ bpm: primaryBPM, score: 1 }],
            beatsPerMeasure,
            downbeatOffset: bestPhase * 0.01
        };
    }

    /**
     * Extracts the single strongest note from a bass-specific chromagram.
     */
    getStrongestBassNote(bassChroma) {
        let maxBass = 0;
        let bassNoteIdx = -1;
        for (let i = 0; i < 12; i++) {
            if (bassChroma[i] > maxBass) {
                maxBass = bassChroma[i];
                bassNoteIdx = i;
            }
        }
        return bassNoteIdx > -1 ? this.notes[bassNoteIdx] : null;
    }

    /**
     * Calculates energy in 12 semitone bins using a bank of targeted 
     * single-frequency filters with Hann windowing and Harmonic Suppression.
     */
    calculateChromagram(signal, sampleRate, options = {}) {
        const chroma = new Float32Array(12).fill(0);
        const pitchEnergy = new Float32Array(128).fill(0); // High-res pitch map
        const len = signal.length;
        const step = options.step || 4; 
        const minMidi = options.minMidi || 0;
        const maxMidi = options.maxMidi || 127;

        // Always calculate full range (24-96) for harmonic suppression context
        this.pitchFrequencies.forEach(p => {
            // Optimization: We could skip very high notes if maxMidi is low, but for suppression we need fundamentals.
            // Let's just calculate all configured frequencies (24-96) to be safe.
            
            let real = 0;
            let imag = 0;
            const angleStep = (2 * Math.PI * p.freq) / sampleRate;

            for (let i = 0; i < len; i += step) {
                const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
                const angle = i * angleStep;
                const sample = signal[i] * window;
                real += sample * Math.cos(angle);
                imag += sample * Math.sin(angle);
            }

            pitchEnergy[p.midi] = (real * real + imag * imag);
        });

        // Harmonic Suppression: Remove overtones of low fundamentals
        if (options.suppressHarmonics) {
            for (let m = 24; m <= 72; m++) {
                const energy = pitchEnergy[m];
                if (energy <= 0) continue;

                // Suppress 2nd harmonic (Octave) - REDUCED WEIGHTS
                if (m + 12 < 128) pitchEnergy[m + 12] = Math.max(0, pitchEnergy[m + 12] - energy * 0.2);
                // Suppress 3rd harmonic (Perfect 5th + Octave)
                if (m + 19 < 128) pitchEnergy[m + 19] = Math.max(0, pitchEnergy[m + 19] - energy * 0.1);
                // Suppress 4th harmonic (Two Octaves)
                if (m + 24 < 128) pitchEnergy[m + 24] = Math.max(0, pitchEnergy[m + 24] - energy * 0.1);
                // Suppress 5th harmonic (Major 3rd + Two Octaves)
                if (m + 28 < 128) pitchEnergy[m + 28] = Math.max(0, pitchEnergy[m + 28] - energy * 0.05);
            }
        }

        // Map suppressed pitch energy to 12-bin Chroma, RESPECTING minMidi/maxMidi
        for (let m = 24; m <= 96; m++) {
            if (m < minMidi || m > maxMidi) continue;

            const mag = pitchEnergy[m];
            let weight = 1.0;
            // De-emphasize very low notes for chord detection to avoid walking bass interference
            if (m < 48) weight = 0.6; 
            else if (m < 72) weight = 1.2; // Focus on the "meat" of the chords
            else if (m > 80) weight = 0.5; 
            
            chroma[m % 12] += mag * weight;
        }

        if (options.skipSharpening) return chroma;

        // Apply "Harmonic Sharpening"
        const sharpened = new Float32Array(12);
        for (let i = 0; i < 12; i++) {
            const prev = chroma[(i - 1 + 12) % 12];
            const next = chroma[(i + 1) % 12];
            // Only keep bins that are local maxima to clear out spectral leakage
            if (chroma[i] > prev && chroma[i] > next && chroma[i] > 0.1) {
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
            'maj':  { 0: 1.6, 4: 1.4, 7: 1.1 },
            'm':    { 0: 1.6, 3: 1.4, 7: 1.1 },
            '7':    { 0: 1.6, 4: 1.3, 7: 1.1, 10: 1.5 },
            'maj7': { 0: 1.6, 4: 1.3, 7: 1.1, 11: 1.2 },
            'm7':   { 0: 1.6, 3: 1.3, 7: 1.1, 10: 1.2 },
            '6':    { 0: 1.6, 4: 1.4, 7: 1.1, 9: 1.2 },
            'm6':   { 0: 1.6, 3: 1.4, 7: 1.1, 9: 1.2 },
            'sus4': { 0: 1.6, 5: 1.4, 7: 1.1 },
            'dim':  { 0: 1.6, 3: 1.3, 6: 1.3 }
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
                    if (profile[i]) {
                        score += val * profile[i];
                        if (val < 0.1) score -= 1.0; // Penalty for missing a required note
                    }
                    else score -= val * 0.5;
                }

                // 2. Global Key Bias
                if (options.keyBias) {
                    const relativeRoot = (root - options.keyBias.root + 12) % 12;
                    let isDiatonic = false;
                    
                    if (options.keyBias.type === 'major') isDiatonic = majorDiatonic.includes(relativeRoot);
                    else if (options.keyBias.type === 'minor') isDiatonic = minorDiatonic.includes(relativeRoot);
                    else if (options.keyBias.type === 'dominant') {
                        // Mixolydian: I7, II, iii, IV, v, vi, bVII
                        isDiatonic = [0, 2, 4, 5, 7, 9, 10].includes(relativeRoot);
                        if (isDiatonic && type === '7' && [0, 5, 7, 10].includes(relativeRoot)) score *= 1.20; // Extra boost for 7th chords in blues
                    }
                    else if (options.keyBias.type.startsWith('blues')) {
                         // Blues Scale-ish: I7, IV7, V7 are kings. bIII, bVI, bVII are common.
                         // Major: I, IV, V.  Minor: i, iv, v.
                         // Roots: 0, 3, 5, 7, 10
                         if ([0, 5, 7].includes(relativeRoot) && type === '7') score *= 1.35; // Primary Blues Chords
                         else if ([3, 10].includes(relativeRoot)) score *= 1.15; // Secondary Blues Chords
                         isDiatonic = [0, 3, 5, 7, 10].includes(relativeRoot);
                    }
                    
                    if (isDiatonic) score *= 1.30; // 30% boost for diatonic chords
                }

                // Sanity Check for 7th Chords
                // If a chord claims to be a 7th but has minimal energy in the 7th interval,
                // penalize it to prevent false positives from bias/overtones.
                if (type === '7' || type === 'm7' || type === 'maj7') {
                    const seventhIdx = (type === 'maj7') ? 11 : 10;
                    const absSeventhIdx = (root + seventhIdx) % 12;
                    if (chroma[absSeventhIdx] < 0.1) {
                        score *= 0.65; 
                    }
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
            
            // Significant bass presence (at least 35% of total chromagram energy to avoid jitter in walking lines)
            if (bassEnergy > totalEnergy * 0.35) {
                const root = bestChordData.root;
                const interval = (bassIdx - root + 12) % 12;
                // Only consider 3rd or 5th as stable inversions for this demo
                // IGNORE 7th in bass as it's often a passing tone or just muddy
                const isStableInversion = [3, 4, 7].includes(interval);
                
                if (isStableInversion) {
                    chordName += '/' + options.bassNote;
                }
            }
        }

        return chordName;
    }
}
