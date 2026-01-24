import { playback, groove } from './state.js';
import { safeDisconnect, clampFreq } from './utils.js';

/**
 * Instrument definitions for the chord engine.
 */
export const INSTRUMENT_PRESETS = {
    'Warm': {
        attack: 0.03, // Slightly softer attack
        decay: 0.6, // Shortened from 0.8 for better clarity
        filterBase: 600, // Darker base
        filterDepth: 1800,
        resonance: 2.2, // Increased for a "sweet" bloom
        tine: true,
        fundamental: 'triangle', // Swapped from sine for more body
        harmonic: 'sine',
        fifth: 'sine',
        weights: [1.2, 0.3, 0.1],
        reverbMult: 1.1,
        gainMult: 1.0
    },
    'Piano': {
        attack: 0.001, // Faster transient for more immediate "hit"
        decay: 5.0, 
        filterBase: 400, // Lower base for a warmer tone
        filterDepth: 2400, // Reduced from 4200 to significantly cut harsh high-end
        resonance: 1.2, // Smoother resonance
        gainMult: 1.25 // Boosted from 1.1 to anchor the mix
    }
};

function createPianoWave(audioCtx) {
    // Fourier coefficients: [fundamental, 2nd, 3rd, 4th, 5th, ...]
    // Grand pianos have strong early harmonics and a rich mid-spectrum.
    const real = new Float32Array([0, 1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.05, 0.03]);
    const imag = new Float32Array(real.length).fill(0); // Sine-based components
    return audioCtx.createPeriodicWave(real, imag);
}

let pianoWave = null;

/**
 * Updates the sustain pedal state, precisely scheduled.
 */
export function updateSustain(active, time = null) {
    const scheduleTime = time !== null ? time : (playback.audio?.currentTime || 0);
    playback.sustainActive = active;
    
    if (!active && playback.heldNotes) {
        // Release all held notes
        playback.heldNotes.forEach((note) => {
            note.stop(scheduleTime);
        });
        playback.heldNotes.clear();
    }
}

/**
 * Forcefully kills all ringing piano notes (panic button).
 */
export function killAllPianoNotes() {
    const now = playback.audio?.currentTime || 0;
    if (playback.heldNotes) {
        playback.heldNotes.forEach(note => {
            if (typeof note.stop === 'function') {
                note.stop(now, true);
            }
        });
        playback.heldNotes.clear();
    }
    playback.sustainActive = false;
}

/**
 * Plays a musical note with advanced synthesis based on instrument presets.
 * @param {number} freq - Frequency in Hz.
 * @param {number} time - AudioContext start time.
 * @param {number} duration - Note duration in seconds.
 * @param {Object} options - Synthesis options.
 * @param {number} [options.vol=0.1] - Velocity/Volume.
 * @param {number} [options.index=0] - Note index in chord for strumming.
 * @param {string} [options.instrument='Piano'] - Preset name.
 * @param {boolean} [options.muted=false] - Whether this is a muted strum.
 * @param {number} [options.numVoices=1] - Total voices in the chord for normalization.
 */
export function playNote(freq, time, duration, { vol = 0.1, index = 0, instrument = 'Piano', muted = false, numVoices = 1 } = {}) {
    if (!Number.isFinite(freq)) return;
    
    // Normalize volume based on chord density (Anti-Clutter Scaling)
    // Formula: v = base_v * (1 / sqrt(num_voices))
    // This ensures a 5-note chord has the same perceived energy as a 1-note melody.
    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
    const finalVol = vol * polyphonyComp;

    // Ensure heldNotes exists on playback
    if (!playback.heldNotes) playback.heldNotes = new Set();
    
    try {
        if (playback.highFidelity) {
            playHiFiNote(freq, time, duration, vol, index, instrument, muted, numVoices);
            return;
        }

        // Fallback safety for legacy instruments
        if (instrument !== 'Piano' && instrument !== 'Warm') instrument = 'Piano';
        
        const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS['Piano'];
        const now = playback.audio.currentTime;
        const baseTime = Math.max(time, now);
        
        const isPiano = instrument === 'Piano';
        if (isPiano && !pianoWave) pianoWave = createPianoWave(playback.audio);

        // 1. The "Strum" Offset
        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.010) * staggerMult;
        const startTime = baseTime + stagger;
        
        // Intensity-aware brightness mapping (Wide Range for Alternative Loop)
        const intensity = playback.bandIntensity;
        const intensityShift = (intensity - 0.5) * 2400; // Expanded from 1200
        const intensityDepthMult = 0.5 + (intensity * 2.5); // 0.5x to 3.0x depth (Expanded from 0.5-2.0)
        const velocityCutoff = Math.max(100, (preset.filterBase + intensityShift) + (finalVol * preset.filterDepth * intensityDepthMult));
        
        // --- Component A: The Hammer Strike ---
        if (isPiano && !muted) {
            const strike = playback.audio.createBufferSource();
            strike.buffer = groove.audioBuffers.noise;
            const strikeFilter = playback.audio.createBiquadFilter();
            const strikeGain = playback.audio.createGain();
            
            strikeFilter.type = 'bandpass';
            strikeFilter.frequency.setValueAtTime(1200 + (finalVol * 800), startTime);
            strikeFilter.Q.setValueAtTime(1.5, startTime);
            
            strikeGain.gain.setValueAtTime(0, startTime);
            strikeGain.gain.setTargetAtTime(finalVol * 0.15, startTime, 0.001); // Reduced from 0.25
            strikeGain.gain.setTargetAtTime(0, startTime + 0.01, 0.01);
            
            strike.connect(strikeFilter);
            strikeFilter.connect(strikeGain);
            strikeGain.connect(playback.chordsGain);
            strike.start(startTime);
            strike.stop(startTime + 0.1);
            strike.onended = () => safeDisconnect([strike, strikeFilter, strikeGain]);
        }

        // --- Component B: The Harmonic Body ---
        const osc = playback.audio.createOscillator();
        const mainGain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();
        
        if (isPiano) {
            osc.setPeriodicWave(pianoWave);
        } else {
            osc.type = preset.fundamental || 'sine';
        }
        
        osc.frequency.setValueAtTime(freq, startTime);
        osc.detune.setValueAtTime((Math.random() * 4 - 2), startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(velocityCutoff, startTime);
        filter.frequency.setTargetAtTime(preset.filterBase, startTime, isPiano ? 0.35 : 0.1); // Reduced from 0.8 for faster tonal decay
        filter.Q.setValueAtTime(preset.resonance, startTime);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.setTargetAtTime(finalVol * (preset.gainMult || 1.0), startTime, preset.attack);

        const stopNote = (t, isPanic = false) => {
            mainGain.gain.cancelScheduledValues(t);
            // Sharp damping for staccato, smoother for sustained, very fast for panic
            const dampingConstant = isPanic ? 0.005 : (duration < 0.2 ? 0.02 : 0.12);
            mainGain.gain.setTargetAtTime(0, t, dampingConstant); 
            try { osc.stop(t + 0.5); } catch { /* ignore already stopped */ }
        };

        if (playback.sustainActive && !muted) {
            const noteRef = { stop: stopNote };
            playback.heldNotes.add(noteRef);
            if (playback.heldNotes.size > 64) {
                const firstNote = playback.heldNotes.values().next().value;
                firstNote.stop(now);
                playback.heldNotes.delete(firstNote);
            }
        } else {
            const actualDuration = muted ? 0.015 : duration;
            // Immediate damping at end of duration
            mainGain.gain.setTargetAtTime(0, startTime + actualDuration, 0.03); 
        }

        osc.connect(filter);
        
        // --- Intensity-driven Crunch (>= 0.8) ---
        let lastNode = filter;
        if (intensity >= 0.8 && !muted) {
            const shaper = playback.audio.createWaveShaper();
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const drive = 1.0 + (intensity - 0.8) * 10.0; // 1.0 to 3.0
            for (let i = 0; i < n_samples; ++i) {
                const x = (i * 2) / n_samples - 1;
                curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
            }
            shaper.curve = curve;
            shaper.oversample = '2x';
            filter.connect(shaper);
            lastNode = shaper;
        }

        lastNode.connect(mainGain);

        // --- Mix Separation: HPF & Panning ---
        const hpf = playback.audio.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.setValueAtTime(150, startTime);
        
        const panner = playback.audio.createStereoPanner ? playback.audio.createStereoPanner() : playback.audio.createGain();
        if (playback.audio.createStereoPanner) {
            panner.pan.setValueAtTime(-0.2, startTime); // Slight Left
        }

        mainGain.connect(hpf);
        hpf.connect(panner);
        panner.connect(playback.chordsGain);

        osc.start(startTime);
        if (!playback.sustainActive || muted) {
            osc.stop(startTime + (muted ? 0.1 : duration + 1.0));
        }

        osc.onended = () => safeDisconnect([osc, filter, mainGain]);

    } catch (err) { console.error("playNote error:", err); }
}

/**
 * HIGH FIDELITY Chord Engine
 * Features: FM Electric Piano, Lush Pads, Stereo Spread
 */
function playHiFiNote(freq, time, duration, vol, index, instrument, muted, numVoices) {
    const ctx = playback.audio;
    const now = ctx.currentTime;
    const startTime = Math.max(time, now);
    const activeNodes = [];

    // Normalize Volume
    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
    const finalVol = vol * polyphonyComp;

    // Stagger (Strum)
    const stagger = index * (0.005 + Math.random() * 0.010) * (muted ? 0.4 : 1.0);
    const noteStart = startTime + stagger;

    // Master Note Gain
    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0, noteStart);

    // Stereo Spread (Random pan per note)
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() * 1.0 - 0.5), noteStart);

    mainGain.connect(panner);
    if (playback.chordsGain) panner.connect(playback.chordsGain);
    activeNodes.push(mainGain, panner);

    // Instrument Logic
    if (instrument === 'Piano') {
        // FM Electric Piano (Rhodes-ish)
        // Carrier: Sine
        // Modulator: Sine (Ratio 1:1 or 1:14 for tines)

        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(freq, noteStart);

        const modulator = ctx.createOscillator();
        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(freq * 14.0, noteStart); // High harmonic "tine"

        const modGain = ctx.createGain();
        // Tine decay is fast
        const modDepth = freq * (0.2 + finalVol * 0.5);
        modGain.gain.setValueAtTime(modDepth, noteStart);
        modGain.gain.exponentialRampToValueAtTime(0.01, noteStart + 0.1);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        // Body (Fundamentals)
        const sub = ctx.createOscillator();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(freq, noteStart);

        // Routing
        carrier.connect(mainGain);
        sub.connect(mainGain);

        activeNodes.push(carrier, modulator, modGain, sub);

        // Envelopes
        mainGain.gain.setTargetAtTime(finalVol, noteStart, 0.005); // Fast attack

        const stopTime = noteStart + (muted ? 0.1 : duration + 1.0);

        // Sustain Logic
        if (playback.sustainActive && !muted) {
            playback.heldNotes.add({ stop: (t) => mainGain.gain.setTargetAtTime(0, t, 0.1) });
        } else {
            mainGain.gain.setTargetAtTime(0, noteStart + (muted ? 0.05 : duration), 0.1);
        }

        carrier.start(noteStart);
        modulator.start(noteStart);
        sub.start(noteStart);

        carrier.stop(stopTime);
        modulator.stop(stopTime);
        sub.stop(stopTime);

    } else {
        // Lush Pad (Warm)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, noteStart);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, noteStart);
        osc2.detune.setValueAtTime(12, noteStart); // Detune cents

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const cutoff = freq * 3 * (1 + playback.bandIntensity);
        filter.frequency.setValueAtTime(clampFreq(cutoff), noteStart);
        filter.Q.value = 1.0;

        // Slow LFO on filter
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 200;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(mainGain);

        activeNodes.push(osc1, osc2, filter, lfo, lfoGain);

        // Soft Attack
        mainGain.gain.linearRampToValueAtTime(finalVol * 0.6, noteStart + 0.3);

        if (playback.sustainActive) {
            playback.heldNotes.add({ stop: (t) => mainGain.gain.setTargetAtTime(0, t, 0.5) });
        } else {
            mainGain.gain.setTargetAtTime(0, noteStart + duration, 0.5);
        }

        const stopTime = noteStart + duration + 2.0;
        osc1.start(noteStart);
        osc2.start(noteStart);
        lfo.start(noteStart);

        osc1.stop(stopTime);
        osc2.stop(stopTime);
        lfo.stop(stopTime);
    }

    // Cleanup trigger
    activeNodes.find(n => n instanceof OscillatorNode).onended = () => safeDisconnect(activeNodes);
}

/**
 * Plays a percussive "scratch" or muted strum sound for chord rhythms.
 * @param {number} time - AudioContext time to play.
 * @param {number} vol - Volume multiplier.
 */
export function playChordScratch(time, vol = 0.1) {
    try {
        const randomizedVol = vol * (0.8 + Math.random() * 0.4);
        const gain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();
        const noise = playback.audio.createBufferSource();
        
        noise.buffer = groove.audioBuffers.noise;
        filter.type = 'bandpass';
        const scratchFreq = 1200 + Math.random() * 400;
        filter.frequency.value = scratchFreq;
        filter.frequency.setValueAtTime(scratchFreq, time);
        filter.Q.value = 1.5;
        filter.Q.setValueAtTime(1.5, time);
        
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(randomizedVol, time, 0.005);
        gain.gain.setTargetAtTime(0, time + 0.02, 0.02);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(playback.chordsGain);
        
        noise.start(time);
        noise.stop(time + 0.2);
        
        noise.onended = () => safeDisconnect([gain, filter, noise]);
    } catch (e) { console.error("playChordScratch error:", e); }
}
