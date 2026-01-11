import { ctx, gb, cb, bb, sb } from './state.js';
import { ui, triggerFlash } from './ui.js';
import { MIXER_GAIN_MULTIPLIERS } from './config.js';

/**
 * Creates a simple algorithmic reverb impulse response.
 * @param {AudioContext} audioCtx 
 * @param {number} duration 
 * @param {number} decay 
 * @returns {AudioBuffer}
 */
function createReverbImpulse(audioCtx, duration = 2.0, decay = 2.0) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    return impulse;
}

/**
 * Creates a soft-clipping curve for the WaveShaperNode.
 * Currently set to linear for troubleshooting.
 * @returns {Float32Array}
 */
function createSoftClipCurve() {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // Normalized monotonic cubic: f(x) = (3x - x^3) / 2
        // This ensures f(1) = 1.0 and f(-1) = -1.0 with a smooth transition.
        curve[i] = (3 * x - Math.pow(x, 3)) / 2;
    }
    return curve;
}

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 */
export function initAudio() {
    if (!ctx.audio) {
        // Modern AudioSession API to bypass silent switch on iOS
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }

        ctx.audio = new (window.AudioContext || window.webkitAudioContext)();

        ctx.masterGain = ctx.audio.createGain();
        // Use smooth ramping instead of direct assignment to prevent clicks
        const initMasterVol = parseFloat(ui.masterVol.value) || 0.5;
        ctx.masterGain.gain.setValueAtTime(0.0001, ctx.audio.currentTime);
        ctx.masterGain.gain.exponentialRampToValueAtTime(initMasterVol, ctx.audio.currentTime + 0.04);
        
        // 1. Master Soft-Clipper (Analog Glue)
        ctx.saturator = ctx.audio.createWaveShaper();
        ctx.saturator.curve = createSoftClipCurve();
        ctx.saturator.oversample = '4x';

        // 2. Master Limiter (Professional Mastering Standard)
        ctx.masterLimiter = ctx.audio.createDynamicsCompressor();
        // Lowered threshold from -0.5 to -1.5 to provide more headroom when all modules are active
        ctx.masterLimiter.threshold.setValueAtTime(-1.5, ctx.audio.currentTime);
        // Soft knee (30dB) to prevent "snapping" into compression
        ctx.masterLimiter.knee.setValueAtTime(30, ctx.audio.currentTime);
        ctx.masterLimiter.ratio.setValueAtTime(20, ctx.audio.currentTime);
        ctx.masterLimiter.attack.setValueAtTime(0.002, ctx.audio.currentTime); 
        // Release increased to 500ms to ensure gain recovery is transparent and non-rhythmic
        ctx.masterLimiter.release.setValueAtTime(0.5, ctx.audio.currentTime); 
        
        // Signal Chain: MasterGain -> Saturator -> Limiter -> Destination
        ctx.masterGain.connect(ctx.saturator);
        ctx.saturator.connect(ctx.masterLimiter);
        ctx.masterLimiter.connect(ctx.audio.destination);

        // Reverb setup
        ctx.reverbNode = ctx.audio.createConvolver();
        ctx.reverbNode.buffer = createReverbImpulse(ctx.audio, 1.5, 3.0);
        ctx.reverbNode.connect(ctx.masterGain);

        // Instrument Buses and Reverb Sends
        const modules = [
            { name: 'chords', state: cb, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: 'bass', state: bb, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: 'soloist', state: sb, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: 'drums', state: gb, mult: MIXER_GAIN_MULTIPLIERS.drums }
        ];

        modules.forEach(m => {
            const gainNode = ctx.audio.createGain();
            // Start silent and ramp up to initial volume
            const targetGain = Math.max(0.0001, m.state.volume * m.mult);
            gainNode.gain.setValueAtTime(0.0001, ctx.audio.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(targetGain, ctx.audio.currentTime + 0.04);
            
            // Mix Glue: EQ for Chords
            if (m.name === 'chords') {
                const hp = ctx.audio.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 180; // FF stability fix
                hp.frequency.setValueAtTime(180, ctx.audio.currentTime); 
                
                const notch = ctx.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.value = 2500;
                notch.frequency.setValueAtTime(2500, ctx.audio.currentTime);
                notch.Q.value = 0.7;
                notch.Q.setValueAtTime(0.7, ctx.audio.currentTime);
                notch.gain.value = -4;
                notch.gain.setValueAtTime(-4, ctx.audio.currentTime); 
                
                gainNode.connect(hp);
                hp.connect(notch);
                notch.connect(ctx.masterGain);
                ctx.chordsEQ = hp;
            } else if (m.name === 'bass') {
                const weight = ctx.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.value = 100;
                weight.frequency.setValueAtTime(100, ctx.audio.currentTime);
                weight.gain.value = 2;
                weight.gain.setValueAtTime(2, ctx.audio.currentTime);

                const scoop = ctx.audio.createBiquadFilter();
                scoop.type = 'peaking';
                scoop.frequency.value = 500;
                scoop.frequency.setValueAtTime(500, ctx.audio.currentTime);
                scoop.Q.value = 0.8;
                scoop.Q.setValueAtTime(0.8, ctx.audio.currentTime);
                scoop.gain.value = -10;
                scoop.gain.setValueAtTime(-10, ctx.audio.currentTime);

                const definition = ctx.audio.createBiquadFilter();
                definition.type = 'peaking';
                definition.frequency.value = 2500;
                definition.frequency.setValueAtTime(2500, ctx.audio.currentTime);
                definition.Q.value = 1.2;
                definition.Q.setValueAtTime(1.2, ctx.audio.currentTime);
                definition.gain.value = 3;
                definition.gain.setValueAtTime(3, ctx.audio.currentTime);

                gainNode.connect(weight);
                weight.connect(scoop);
                scoop.connect(definition);
                definition.connect(ctx.masterGain);
                ctx.bassEQ = weight; // Reference start of chain
            } else {
                gainNode.connect(ctx.masterGain);
            }

            ctx[`${m.name}Gain`] = gainNode;

            const reverbGain = ctx.audio.createGain();
            const targetReverb = Math.max(0.0001, m.state.reverb);
            reverbGain.gain.setValueAtTime(0.0001, ctx.audio.currentTime);
            reverbGain.gain.exponentialRampToValueAtTime(targetReverb, ctx.audio.currentTime + 0.04);
            gainNode.connect(reverbGain);
            reverbGain.connect(ctx.reverbNode);
            ctx[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = ctx.audio.sampleRate * 2;
        const buffer = ctx.audio.createBuffer(1, bufSize, ctx.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        gb.audioBuffers.noise = buffer;

        // Diagnostic log
        console.log(`[DSP] Audio Context Initialized: SampleRate=${ctx.audio.sampleRate}, Latency=${(ctx.audio.baseLatency * 1000).toFixed(1)}ms`);
    }
    if (ctx.audio.state === 'suspended') ctx.audio.resume();
}

/**
 * Diagnostic: Monitors the master limiter's gain reduction.
 */
export function monitorMasterLimiter() {
    if (ctx.masterLimiter && ctx.masterLimiter.reduction.value < -0.1) {
        console.log(`[DSP] Master Limiting: ${ctx.masterLimiter.reduction.value.toFixed(2)}dB`);
    }
}

/**
 * Diagnostic: Bypasses the visual updates to isolate UI-induced audio glitches.
 */
window.bypassVisuals = (shouldBypass) => {
    ctx.isDrawing = !shouldBypass;
    console.log(`[DSP] Visual Updates ${shouldBypass ? 'DISABLED' : 'ENABLED'}`);
};

/**
 * Diagnostic: Bypasses the mastering chain (Saturator + Limiter).
 */
window.bypassMaster = (shouldBypass) => {
    if (!ctx.audio || !ctx.masterGain) return;
    ctx.masterGain.disconnect();
    if (shouldBypass) {
        ctx.masterGain.connect(ctx.audio.destination);
        console.log("[DSP] Master Chain BYPASSED");
    } else {
        ctx.masterGain.connect(ctx.saturator);
        console.log("[DSP] Master Chain ACTIVE");
    }
};

/**
 * Safely disconnects multiple Web Audio nodes.
 * @param {AudioNode[]} nodes 
 */
function safeDisconnect(nodes) {
    nodes.forEach(node => {
        if (node) {
            try { node.disconnect(); } catch (e) {}
        }
    });
}

/**
 * Instrument definitions for the chord engine.
 */
export const INSTRUMENT_PRESETS = {
    'Warm': {
        attack: 0.03, // Slightly softer attack
        decay: 0.6, // Shortened from 0.8 for better clarity
        filterBase: 600, // Darker base
        filterDepth: 1800,
        resonance: 2.2, // Increased for a "sweeter" bloom
        tine: true,
        fundamental: 'triangle', // Swapped from sine for more body
        harmonic: 'sine',
        fifth: 'sine',
        weights: [1.2, 0.3, 0.1],
        reverbMult: 1.1,
        gainMult: 1.0
    },
    'Clean': {
        attack: 0.008,
        decay: 0.4, 
        filterBase: 600, 
        filterDepth: 1500, // Reduced for a smoother, less "swept" sound
        resonance: 0.5, // Low resonance for purity
        tine: false,
        fundamental: 'sine',
        harmonic: 'sine',
        fifth: 'sine',
        weights: [1.8, 0.4, 0.05], // Heavily weighted toward the fundamental
        hp: true,
        reverbMult: 0.65,
        gainMult: 2.1 
    },
    'Classic': {
        attack: 0.01,
        decay: 1.5,
        filterBase: 800,
        filterDepth: 2000,
        resonance: 1.0,
        tine: true,
        fundamental: 'sine',
        harmonic: 'triangle',
        fifth: 'sine',
        weights: [1.5, 0.5, 0.1],
        reverbMult: 0.9,
        gainMult: 1.2
    }
};

/**
 * Plays a musical note with advanced synthesis based on instrument presets.
 * @param {number} freq - Frequency in Hz.
 * @param {number} time - AudioContext start time.
 * @param {number} duration - Note duration in seconds.
 * @param {Object} options - Synthesis options.
 */
export function playNote(freq, time, duration, { vol = 0.1, index = 0, instrument = cb.instrument, muted = false } = {}) {
    if (!Number.isFinite(freq)) return;
    
    try {
        const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS['Warm'];
        const now = ctx.audio.currentTime;
        const baseTime = Math.max(time, now);
        
        // 1. The "Strum" Offset: 5-15ms stagger between notes in a chord
        // Muted ghost notes are tighter (2-6ms)
        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.010) * staggerMult;
        const startTime = baseTime + stagger;
        
        // Envelope timing calculation: 
        // Muted notes have a very short duration and decay
        const actualDuration = muted ? 0.015 : duration;
        
        // Rhythmic Tightening: 
        // If the duration is short (like in Funk/Clave), we tighten the decay to ensure definition.
        const isShortNote = duration < 0.45;
        const actualDecay = muted ? 0.03 : (isShortNote ? Math.min(preset.decay, 0.25) : preset.decay);
        
        // Clean needs to be more "plucky" (short sustain)
        // Pad styles (long duration) get full sustain, rhythmic styles get shortened
        let sustainPercent = (instrument === 'Clean' && duration < 1.0) ? 0.25 : 0.75;
        if (isShortNote) sustainPercent *= 0.6; // Even tighter for rhythmic hits

        const attackEnd = startTime + preset.attack;
        const sustainEnd = startTime + Math.max(preset.attack, actualDuration * sustainPercent);
        const releaseTime = sustainEnd + actualDecay;
        
        // Scale base volume by instrument-specific multiplier
        const baseVol = vol * (preset.gainMult || 1.0);
        const randomizedVol = baseVol * (0.95 + Math.random() * 0.1);

        // Volume safety threshold: don't trigger DSP for near-silent notes
        if (randomizedVol < 0.005) return;

        const gainNode = ctx.audio.createGain();
        gainNode.gain.value = 0;
        gainNode.gain.setValueAtTime(0, startTime);
        
        // 2. Stereophony: Frequency-based panning (Lows Left, Highs Right)
        const panNode = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
        if (ctx.audio.createStereoPanner) {
            let panVal = (Math.log2(freq / 261.63) / 2.5); // Center around Middle C
            panVal = Math.max(-0.7, Math.min(0.7, panVal));
            panNode.pan.setValueAtTime(panVal, startTime);
        }

        // 3. Additive Layering
        const oscs = [];
        const harmonicRatios = [1, 2, 1.5]; 
        const oscTypes = [preset.fundamental, preset.harmonic, preset.fifth];
        
        harmonicRatios.forEach((ratio, i) => {
            // Only use fundamental for muted notes to prevent "bloopy" harmonics
            if (muted && i > 0) return;

            const osc = ctx.audio.createOscillator();
            const oscGain = ctx.audio.createGain();
            oscGain.gain.value = 0; // Fix: Initialize sub-gains to 0
            
            osc.type = oscTypes[i];
            osc.frequency.setValueAtTime(freq * ratio, startTime);
            osc.detune.setValueAtTime((Math.random() * 6 - 3), startTime);
            
            oscGain.gain.setValueAtTime(0, startTime);
            oscGain.gain.setTargetAtTime(preset.weights[i], startTime, 0.005);
            
            osc.connect(oscGain);
            oscs.push({ osc, gain: oscGain });
        });

        // 4. Dynamic Filtering & Velocity Dynamics
        const filter = ctx.audio.createBiquadFilter();
        filter.type = (preset.hp && !muted) ? 'highpass' : 'lowpass';
        
        // Velocity Mapping: vol maps to filter cutoff
        // Muted notes are darker and use NO resonance (static filter)
        const baseCutoff = muted ? preset.filterBase * 0.6 : preset.filterBase;
        const velocityCutoff = baseCutoff + (vol * preset.filterDepth);
        
        // Firefox fix: Set .value directly to avoid state desync
        filter.frequency.value = velocityCutoff;
        filter.frequency.setValueAtTime(velocityCutoff, startTime);
        if (!muted) {
            filter.frequency.setTargetAtTime(baseCutoff, startTime, 0.1);
            filter.Q.setValueAtTime(preset.resonance, startTime);
        } else {
            filter.Q.setValueAtTime(0.1, startTime); // Kill resonance for muted thuds
        }

        // Envelopes: Attack -> Sustain -> Decay
        gainNode.gain.value = 0;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.setTargetAtTime(randomizedVol, startTime, 0.005);
        gainNode.gain.setTargetAtTime(0, sustainEnd, 0.1); 

        // Connections
        oscs.forEach(o => o.gain.connect(filter));
        filter.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(ctx.chordsGain);

        // Dynamic Reverb Adjust
        if (ctx.chordsReverb && preset.reverbMult !== undefined) {
            // We can't easily change the global send per note without a separate gain node
            // So we add a per-note reverb send gain
            const noteReverbGain = ctx.audio.createGain();
            // Dry out muted notes further
            const revMult = muted ? preset.reverbMult * 0.2 : preset.reverbMult;
            noteReverbGain.gain.setValueAtTime(cb.reverb * revMult, startTime);
            gainNode.connect(noteReverbGain);
            noteReverbGain.connect(ctx.reverbNode);
            
            // Cleanup noteReverbGain
            oscs[0].osc.addEventListener('ended', () => safeDisconnect([noteReverbGain]));
        }

        // Percussive Click (Tine or B3 Key Click)
        if (preset.tine || muted) {
            const click = ctx.audio.createOscillator();
            const clickGain = ctx.audio.createGain();
            click.type = 'sine';
            click.frequency.setValueAtTime(freq * (muted ? 1.2 : 3.2), startTime);
            
            const clickVol = randomizedVol * 0.25;
            clickGain.gain.value = 0;
            clickGain.gain.setTargetAtTime(clickVol, startTime, 0.002);
            // Smoothly decay to silence by 150ms
            clickGain.gain.setTargetAtTime(0, startTime + 0.02, 0.03);
            
            click.connect(clickGain);
            clickGain.connect(panNode);
            click.start(startTime);
            click.stop(startTime + 0.5); // Ring out
            click.onended = () => safeDisconnect([click, clickGain]);
        }

        oscs.forEach(o => {
            o.osc.start(startTime);
            o.osc.stop(releaseTime + 0.1);
        });

        oscs[0].osc.onended = () => {
            const allNodes = [panNode, gainNode, filter];
            oscs.forEach(o => {
                allNodes.push(o.osc);
                allNodes.push(o.gain);
            });
            safeDisconnect(allNodes);
        };

        
    } catch (e) { console.error("playNote error:", e); }
}

/**
 * Plays a percussive "scratch" or muted strum sound for chord rhythms.
 * @param {number} time - AudioContext time to play.
 * @param {number} vol - Volume multiplier.
 */
export function playChordScratch(time, vol = 0.1) {
    try {
        const randomizedVol = vol * (0.8 + Math.random() * 0.4);
        const gain = ctx.audio.createGain();
        const filter = ctx.audio.createBiquadFilter();
        const noise = ctx.audio.createBufferSource();
        
        noise.buffer = gb.audioBuffers.noise;
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
        gain.connect(ctx.chordsGain);
        
        noise.start(time);
        noise.stop(time + 0.2);
        
        noise.onended = () => safeDisconnect([gain, filter, noise]);
    } catch (e) { console.error("playChordScratch error:", e); }
}

export function playBassNote(freq, time, duration, velocity = 1.0, muted = false) {
    if (!Number.isFinite(freq) || !Number.isFinite(time) || !Number.isFinite(duration)) return;
    if (freq < 10 || freq > 24000) return;
    try {
        const now = ctx.audio.currentTime;
        const startTime = Math.max(time, now);
        
        // Boosted volume multiplier for better mix presence, mixed with input velocity
        const vol = 1.1 * velocity * (0.95 + Math.random() * 0.1);
        
        // Volume safety threshold: don't trigger DSP for near-silent notes
        if (vol < 0.005) return;

        // Allow slight tonal bleed for muted notes for realism
        const tonalVol = muted ? vol * 0.2 : vol;
    
        // Body (Fundamental + warmth)
        const oscBody = ctx.audio.createOscillator();
        oscBody.type = 'triangle';
        oscBody.frequency.setValueAtTime(freq, startTime);

        // Growl/String character (Harmonics)
        const oscGrowl = ctx.audio.createOscillator();
        oscGrowl.type = 'sawtooth';
        oscGrowl.frequency.setValueAtTime(freq, startTime);
        const growlGain = ctx.audio.createGain();
        growlGain.gain.setTargetAtTime(tonalVol * 0.4, startTime, 0.005);
        growlGain.gain.setTargetAtTime(0, startTime + duration * 0.5, 0.1);

        const growlFilter = ctx.audio.createBiquadFilter();
        growlFilter.type = 'lowpass';
        const dynamicCutoff = 800 + (vol * 1500); 
        growlFilter.frequency.value = dynamicCutoff; // FF stability fix
        growlFilter.frequency.setTargetAtTime(dynamicCutoff, startTime, 0.01);
        growlFilter.Q.value = 2;
        growlFilter.Q.setValueAtTime(2, startTime);

        // Percussive Thump (Finger/Pick noise)
        const thump = ctx.audio.createBufferSource();
        thump.buffer = gb.audioBuffers.noise;
        const thumpFilter = ctx.audio.createBiquadFilter();
        thumpFilter.type = 'lowpass';
        thumpFilter.frequency.value = 600;
        thumpFilter.frequency.setValueAtTime(600, startTime);
        const thumpGain = ctx.audio.createGain();
        const thumpTargetVol = vol * (muted ? 0.4 : 0.2);
        
        // Use smooth curves for the thump too
        thumpGain.gain.value = 0;
        thumpGain.gain.setTargetAtTime(thumpTargetVol, startTime, 0.002);
        thumpGain.gain.setTargetAtTime(0, startTime + 0.02, 0.01);
        
        thump.connect(thumpFilter);
        thumpFilter.connect(thumpGain);
        
        const mainFilter = ctx.audio.createBiquadFilter();
        mainFilter.type = 'lowpass';
        const targetCutoff = 1000 + (tonalVol * 2000);
        mainFilter.frequency.value = targetCutoff;
        mainFilter.frequency.setValueAtTime(targetCutoff, startTime);
        mainFilter.frequency.setTargetAtTime(600, startTime + 0.02, duration * 0.5);

        const gain = ctx.audio.createGain();
        // Initialize to 0 to prevent snap from default 1.0
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, startTime);
        // Smooth 10ms attack
        gain.gain.setTargetAtTime(tonalVol, startTime, 0.01);
        
        const sustainDuration = (muted ? 0.02 : duration * 0.2);
        const sustainEnd = startTime + sustainDuration;
        
        // Single smooth exponential decay. 
        // 50ms time constant means it's effectively silent (-60dB) after 250ms.
        // This avoids any "corners" caused by mixing ramp types.
        gain.gain.setTargetAtTime(0, sustainEnd, 0.05);

        oscBody.connect(mainFilter);
        oscGrowl.connect(growlFilter);
        growlFilter.connect(growlGain);
        growlGain.connect(mainFilter);
        
        thumpGain.connect(gain);
        mainFilter.connect(gain);
        gain.connect(ctx.bassGain);

        // Monophonic Cutoff: Stop previous bass note if it's still ringing
        if (bb.lastBassGain && bb.lastBassGain !== gain) {
            try {
                const g = bb.lastBassGain.gain;
                const fadeOutStart = startTime;
                g.cancelScheduledValues(fadeOutStart);
                // Exponentially fade current note to zero
                g.setTargetAtTime(0, fadeOutStart, 0.005);
            } catch (e) {}
        }
        bb.lastBassGain = gain;

        oscBody.start(startTime);
        oscGrowl.start(startTime);
        thump.start(startTime);
        
        // Stop time is generous to allow for exponential decay tails
        const stopTime = startTime + duration + 1.0;
        oscBody.stop(stopTime);
        oscGrowl.stop(stopTime);
        thump.stop(startTime + 0.1);
        
        oscBody.onended = () => safeDisconnect([gain, mainFilter, growlFilter, growlGain, thumpGain, thumpFilter, oscBody, oscGrowl, thump]);
    } catch (e) {
        console.error("playBassNote error:", e, { freq, time, duration });
    }
}

export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = 'scalar') {
    if (!Number.isFinite(freq)) return;
    
    const now = ctx.audio.currentTime;
    const playTime = Math.max(time, now);
    const randomizedVol = vol * (0.95 + Math.random() * 0.1);
    const gain = ctx.audio.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, playTime);
    const pan = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
    if (ctx.audio.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.3, playTime);

    // Primary Osc: Mixed Saw/Tri for a richer tone
    const osc1 = ctx.audio.createOscillator();
    osc1.type = 'sawtooth'; 
    
    const osc2 = ctx.audio.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(style === 'shred' ? 12 : 6, playTime);

    // Pitch Envelope
    if (bendStartInterval !== 0) {
        const startFreq = freq * Math.pow(2, -bendStartInterval / 12);
        // Deliberate bends: longer for blues/minimal, and scaled with note duration
        let bendDuration = (style === 'blues' || style === 'minimal') ? 0.25 : 0.15;
        bendDuration = Math.min(duration * 0.6, bendDuration + (duration * 0.05));
        
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + bendDuration);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + bendDuration);
    } else {
        const scoop = style === 'shred' ? 0.998 : 0.995;
        osc1.frequency.setValueAtTime(freq * scoop, playTime);
        // Firefox fix: use target for smoother onset
        osc1.frequency.setTargetAtTime(freq, playTime, 0.01);
        osc2.frequency.setValueAtTime(freq * scoop, playTime);
        osc2.frequency.setTargetAtTime(freq, playTime, 0.01);
    }

    // Style-specific Vibrato
    const vibrato = ctx.audio.createOscillator();
    let vibSpeed = 5.5;
    let depthFactor = 0.005;
    
    if (style === 'blues') {
        vibSpeed = 4.8 + Math.random() * 0.5; // Slower, wider
        depthFactor = 0.012;
    } else if (style === 'shred') {
        vibSpeed = 6.5 + Math.random() * 1.0; // Faster, tighter
        depthFactor = 0.004;
    } else if (style === 'bird') {
        vibSpeed = 5.8; // Medium-fast, characteristic of sax
        depthFactor = 0.006;
    } else if (style === 'minimal') {
        vibSpeed = 4.2; // Slightly faster but still slow and deliberate
        depthFactor = 0.012; // Deeper for more emotion
    }
    
    vibrato.frequency.setValueAtTime(vibSpeed, playTime); 
    const vibGain = ctx.audio.createGain();
    
    const isLongNote = duration > 0.4;
    const vibDelay = (style === 'minimal' ? 0.4 : (style === 'shred' ? 0.05 : 0.15)) + (Math.random() * 0.1);
    const vibRamp = style === 'minimal' ? 0.5 : 0.3;
    
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);
    
    vibGain.gain.setValueAtTime(0, playTime);
    vibGain.gain.setValueAtTime(0, playTime + vibDelay);
    vibGain.gain.linearRampToValueAtTime(finalVibDepth, playTime + vibDelay + vibRamp); 
    
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency);
    vibGain.connect(osc2.frequency);

    // Resonant Filter
    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoffBase = style === 'bird' ? freq * 3.5 : Math.min(freq * 4, 4000);
    filter.frequency.value = cutoffBase;
    filter.frequency.setValueAtTime(cutoffBase, playTime);
    filter.frequency.exponentialRampToValueAtTime(cutoffBase * (style === 'bird' ? 0.7 : 0.6), playTime + duration);
    const qVal = style === 'bird' ? 1.5 : (isLongNote ? 2 : 1);
    filter.Q.value = qVal;
    filter.Q.setValueAtTime(qVal, playTime); 

    // Amplitude Envelope
    // Dynamic attack based on duration to prevent "mushy" fast notes
    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = Math.min(baseAttack, duration * 0.25);
    
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(randomizedVol, playTime, attack); 
    
    const releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);
    // Start release later (80% into the note) for better sustain
    gain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(ctx.soloistGain);

    // Monophonic Cutoff: Only cutoff if this is a NEW time (allows double stops at same time)
    if (sb.lastSoloistGain && playTime > (sb.lastNoteStartTime || 0)) {
        try {
            const t = playTime;
            const g = sb.lastSoloistGain.gain;
            g.cancelScheduledValues(t);
            // Use smooth 5ms exponential fade for cutoff (matching Bassist stabilization)
            g.setTargetAtTime(0, t, 0.005);
        } catch (e) {}
    }
    sb.lastSoloistGain = gain;
    sb.lastNoteStartTime = playTime;

    // Smart Vibrato Logic
    // Only apply vibrato if note is long enough to warrant it
    if (duration > 0.15) {
        vibrato.start(playTime);
        vibrato.stop(playTime + releaseTime + 0.1);
    }

    osc1.start(playTime);
    osc2.start(playTime);
    
    const stopTime = playTime + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect([pan, gain, filter, osc1, osc2, vibrato, vibGain]);
}

export function playDrumSound(name, time, velocity = 1.0) {
    const now = ctx.audio.currentTime;
    // Add a tiny 2ms buffer to ensure scheduling always happens slightly in the future,
    // which prevents the "immediate-start" clicks common in Firefox.
    const playTime = Math.max(time, now + 0.002);
    const humanizeFactor = (gb.humanize || 0) / 100;
    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.4);
    const masterVol = velocity * 1.35 * velJitter;
    
    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const vol = masterVol * rr();
        
        // 1. Beater Snap (High-frequency transient)
        const beater = ctx.audio.createOscillator();
        const beaterGain = ctx.audio.createGain();
        beaterGain.gain.value = 0;
        beaterGain.gain.setValueAtTime(0, playTime);
        beater.type = 'sine';
        beater.frequency.setValueAtTime(3000 * rr(), playTime);
        beater.frequency.exponentialRampToValueAtTime(600, playTime + 0.005);
        beaterGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.001);
        beaterGain.gain.setTargetAtTime(0, playTime + 0.005, 0.003);

        // 2. Head "Skin" (Mid-range noise for texture)
        const skin = ctx.audio.createBufferSource();
        skin.buffer = gb.audioBuffers.noise;
        const skinFilter = ctx.audio.createBiquadFilter();
        const skinGain = ctx.audio.createGain();
        skinFilter.type = 'bandpass';
        skinFilter.frequency.value = 1000;
        skinFilter.Q.value = 1.0;
        skinGain.gain.value = 0;
        skinGain.gain.setValueAtTime(0, playTime);
        skinGain.gain.setTargetAtTime(vol * 0.2, playTime, 0.002);
        skinGain.gain.setTargetAtTime(0, playTime + 0.01, 0.01);

        // 3. The "Knock" (Fast pitch-sweeping body)
        const knock = ctx.audio.createOscillator();
        const knockGain = ctx.audio.createGain();
        knockGain.gain.value = 0;
        knockGain.gain.setValueAtTime(0, playTime);
        knock.type = 'triangle'; 
        // Very fast sweep creates a "knock" rather than a "woo"
        knock.frequency.setValueAtTime(180 * rr(), playTime);
        knock.frequency.exponentialRampToValueAtTime(60, playTime + 0.02);
        knockGain.gain.setTargetAtTime(vol * 1.3, playTime, 0.001);
        knockGain.gain.setTargetAtTime(0, playTime + 0.015, 0.03); 

        // 4. The "Shell" (Static low-end resonance)
        const shell = ctx.audio.createOscillator();
        const shellGain = ctx.audio.createGain();
        shellGain.gain.value = 0;
        shellGain.gain.setValueAtTime(0, playTime);
        shell.type = 'sine';
        shell.frequency.setValueAtTime(52 * rr(), playTime);
        shellGain.gain.setTargetAtTime(vol * 0.8, playTime, 0.005);
        shellGain.gain.setTargetAtTime(0, playTime + 0.03, 0.05);

        // Connections
        beater.connect(beaterGain);
        skin.connect(skinFilter);
        skinFilter.connect(skinGain);
        knock.connect(knockGain);
        shell.connect(shellGain);

        [beaterGain, skinGain, knockGain, shellGain].forEach(g => g.connect(ctx.drumsGain));

        beater.start(playTime);
        skin.start(playTime);
        knock.start(playTime);
        shell.start(playTime);

        beater.stop(playTime + 0.1);
        skin.stop(playTime + 0.1);
        knock.stop(playTime + 0.2);
        shell.stop(playTime + 0.5);
        
        shell.onended = () => safeDisconnect([beater, beaterGain, skin, skinFilter, skinGain, knock, knockGain, shell, shellGain]);

    } else if (name === 'Snare') {
        const vol = masterVol * rr();

        // 1. The Tone (Drum head resonance)
        const tone1 = ctx.audio.createOscillator();
        const tone2 = ctx.audio.createOscillator();
        const toneGain = ctx.audio.createGain();
        toneGain.gain.value = 0;
        toneGain.gain.setValueAtTime(0, playTime);
        tone1.type = 'triangle';
        tone2.type = 'sine';
        tone1.frequency.setValueAtTime(180 * rr(), playTime);
        tone2.frequency.setValueAtTime(330 * rr(), playTime);
        
        toneGain.gain.setTargetAtTime(vol * 0.5, playTime, 0.001);
        toneGain.gain.setTargetAtTime(0, playTime + 0.01, 0.05);
        tone1.connect(toneGain);
        tone2.connect(toneGain);
        toneGain.connect(ctx.drumsGain);

        // 2. The Wires (Snare rattle)
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const noiseFilter = ctx.audio.createBiquadFilter();
        const noiseGain = ctx.audio.createGain();
        noiseGain.gain.value = 0;
        noiseGain.gain.setValueAtTime(0, playTime);
        noiseFilter.type = 'bandpass';
        const centerFreq = 1500 + (velocity * 1000);
        const finalFreq = centerFreq * rr();
        
        // Firefox stability: set .value directly
        noiseFilter.frequency.value = finalFreq;
        noiseFilter.frequency.setValueAtTime(finalFreq, playTime);
        noiseFilter.Q.value = 1.2;
        noiseFilter.Q.setValueAtTime(1.2, playTime);
        
        noiseGain.gain.setTargetAtTime(vol, playTime, 0.001);
        noiseGain.gain.setTargetAtTime(0, playTime + 0.01, 0.08);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.drumsGain);

        tone1.start(playTime);
        tone2.start(playTime);
        noise.start(playTime);
        tone1.stop(playTime + 0.5);
        tone2.stop(playTime + 0.5);
        noise.stop(playTime + 0.5);
        
        noise.onended = () => safeDisconnect([tone1, tone2, toneGain, noise, noiseFilter, noiseGain]);

    } else if (name === 'HiHat' || name === 'Open') {
        const isOpen = name === 'Open';
        // Reduced volume for open hihat (0.4) to sit back in the mix, kept tight (0.6) for closed
        const vol = masterVol * (isOpen ? 0.4 : 0.6) * rr();
        const duration = (isOpen ? 0.35 : 0.06) * rr();

        // 0. Choking (Monophonic Cutoff for Hi-Hats)
        if (gb.lastHatGain) {
            try {
                const g = gb.lastHatGain.gain;
                g.cancelScheduledValues(playTime);
                // Sharp but smoothed kill to prevent clicks
                g.setTargetAtTime(0, playTime, 0.002);
            } catch (e) {}
        }
        
        // 1. Metallic Bank (The "Ring")
        const ratios = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];
        const baseFreq = 42 * rr();
        const metallicGain = ctx.audio.createGain();
        // Reduce metallic component for Open hihats to emphasize the noise sizzle
        metallicGain.gain.setValueAtTime(isOpen ? 0.25 : 0.5, playTime);
        const oscs = ratios.map((r, i) => {
            const o = ctx.audio.createOscillator();
            // Mix square and triangle waves for a more complex metallic spectrum
            o.type = (i % 3 === 0) ? 'square' : 'triangle';
            o.frequency.setValueAtTime(baseFreq * r, playTime);
            // Slight detuning to add natural inharmonicity and thickness
            o.detune.setValueAtTime((Math.random() - 0.5) * 15, playTime);
            return o;
        });

        // 2. Noise Layer (The "Sizzle")
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;

        const hpFilter = ctx.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        // Warmer, less harsh filter for open hihats (6000Hz base)
        const baseCutoff = isOpen ? 6000 : 8000;
        const cutoff = (baseCutoff + velocity * 3000) * rr();
        
        hpFilter.frequency.value = cutoff; // FF FIX
        hpFilter.frequency.setValueAtTime(cutoff, playTime);
        // Relaxed sweep (to 75% instead of 50%) to maintain crispness
        hpFilter.frequency.setTargetAtTime(cutoff * 0.75, playTime, duration);
        hpFilter.Q.value = 1.2;
        hpFilter.Q.setValueAtTime(1.2, playTime);
        
        const gain = ctx.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);
        // Use linear ramp for the initial snap to be more deterministic across browsers
        gain.gain.linearRampToValueAtTime(vol, playTime + 0.003);
        // Asymptotic decay for smooth tail
        gain.gain.setTargetAtTime(0, playTime + 0.005, duration * 0.5);

        gb.lastHatGain = gain;

        oscs.forEach(o => {
            o.connect(metallicGain);
            o.start(playTime);
            o.stop(playTime + duration + 0.2);
        });
        metallicGain.connect(hpFilter);
        noise.connect(hpFilter);
        noise.start(playTime);
        noise.stop(playTime + duration + 0.2);

        hpFilter.connect(gain);
        gain.connect(ctx.drumsGain);

        oscs[0].onended = () => {
            if (gb.lastHatGain === gain) gb.lastHatGain = null;
            safeDisconnect([...oscs, noise, hpFilter, gain, metallicGain]);
        };

    } else if (name === 'Crash') {
        const vol = masterVol * 0.6 * rr();
        const duration = 2.0 * rr(); 
        
        // 1. Metallic Bank (Ring)
        const ratios = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];
        const baseFreq = 60 * rr();
        const oscs = ratios.map(r => {
            const o = ctx.audio.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(baseFreq * r, playTime);
            return o;
        });

        // 2. The Wash
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;

        const hpFilter = ctx.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.value = 6000;
        hpFilter.frequency.setValueAtTime(6000, playTime);
        hpFilter.frequency.setTargetAtTime(1200, playTime, duration * 0.4);
        hpFilter.Q.value = 0.5;

        const gain = ctx.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.linearRampToValueAtTime(vol, playTime + 0.005);
        
        // Dual-Stage Decay:
        // 1. Explosive initial drop (The "Hit")
        gain.gain.setTargetAtTime(vol * 0.15, playTime + 0.01, 0.02);
        // 2. Natural lingering tail (The "Ring") - Scaled faster to ensure it hits zero
        gain.gain.setTargetAtTime(0, playTime + 0.08, duration * 0.2); 

        // Smoothly ramp to absolute zero at the very end to prevent any possible click
        const killTime = playTime + duration;
        gain.gain.setValueAtTime(0.001, killTime - 0.02);
        gain.gain.linearRampToValueAtTime(0, killTime);

        oscs.forEach(o => {
            o.connect(hpFilter);
            o.start(playTime);
            o.stop(killTime + 0.1);
        });
        noise.connect(hpFilter);
        noise.start(playTime);
        noise.stop(killTime + 0.1);

        hpFilter.connect(gain);
        gain.connect(ctx.drumsGain);

        oscs[0].onended = () => safeDisconnect([...oscs, noise, hpFilter, gain]);
    }
}

let lastAudioTime = 0;
let lastPerfTime = 0;

export function getVisualTime() {
    if (!ctx.audio) return 0;
    
    const audioTime = ctx.audio.currentTime;
    const perfTime = performance.now();
    
    if (audioTime !== lastAudioTime) {
        lastAudioTime = audioTime;
        lastPerfTime = perfTime;
    }
    
    const dt = (perfTime - lastPerfTime) / 1000;
    const smoothAudioTime = audioTime + Math.min(dt, 0.1);

    const outputLatency = ctx.audio.outputLatency || 0;
    const isChromium = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const offset = outputLatency > 0 ? outputLatency : (isChromium ? 0.015 : 0.045);
    
    return smoothAudioTime - offset;
}
