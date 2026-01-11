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
 * @returns {Float32Array}
 */
function createSoftClipCurve() {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // Cubic soft saturation curve
        curve[i] = (3 * x - x * x * x) / 2;
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
        ctx.masterGain.gain.value = parseFloat(ui.masterVol.value);
        
        // 1. Master Soft-Clipper (Analog Glue & Safety)
        ctx.limiter = ctx.audio.createWaveShaper();
        ctx.limiter.curve = createSoftClipCurve();
        ctx.limiter.oversample = '4x';

        ctx.compressor = ctx.audio.createDynamicsCompressor();
        // Relaxed settings: higher threshold, lower ratio, faster release
        ctx.compressor.threshold.setValueAtTime(-15, ctx.audio.currentTime);
        ctx.compressor.knee.setValueAtTime(30, ctx.audio.currentTime);
        ctx.compressor.ratio.setValueAtTime(4, ctx.audio.currentTime);
        ctx.compressor.attack.setValueAtTime(0.003, ctx.audio.currentTime); 
        ctx.compressor.release.setValueAtTime(0.1, ctx.audio.currentTime); 
        
        // Signal Chain: MasterGain -> Limiter -> Compressor -> Destination
        ctx.masterGain.connect(ctx.limiter);
        ctx.limiter.connect(ctx.compressor);
        ctx.compressor.connect(ctx.audio.destination);

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
            gainNode.gain.value = m.state.volume * m.mult;
            
            // 3. Mix Glue: EQ for Chords
            if (m.name === 'chords') {
                const hp = ctx.audio.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 180; // Clear room for Bass
                
                const notch = ctx.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.value = 2500;
                notch.Q.value = 0.7;
                notch.gain.value = -4; // Clear room for Soloist bite
                
                gainNode.connect(hp);
                hp.connect(notch);
                notch.connect(ctx.masterGain);
                ctx.chordsEQ = hp; // Reference if needed
            } else {
                gainNode.connect(ctx.masterGain);
            }

            ctx[`${m.name}Gain`] = gainNode;

            const reverbGain = ctx.audio.createGain();
            reverbGain.gain.value = m.state.reverb;
            gainNode.connect(reverbGain);
            reverbGain.connect(ctx.reverbNode);
            ctx[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = ctx.audio.sampleRate * 2;
        const buffer = ctx.audio.createBuffer(1, bufSize, ctx.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        gb.audioBuffers.noise = buffer;
    }
    if (ctx.audio.state === 'suspended') ctx.audio.resume();
}

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
        gainMult: 2.3 
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
        gainMult: 1.4
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
        
        // 1. The "Strum" Offset: 5-15ms stagger between notes in a chord
        // Muted ghost notes are tighter (2-6ms)
        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.010) * staggerMult;
        const startTime = time + stagger;
        
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
        const gainNode = ctx.audio.createGain();
        
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
            
            osc.type = oscTypes[i];
            osc.frequency.setValueAtTime(freq * ratio, startTime);
            osc.detune.setValueAtTime((Math.random() * 6 - 3), startTime);
            
            oscGain.gain.setValueAtTime(preset.weights[i], startTime);
            
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
        
        filter.frequency.setValueAtTime(velocityCutoff, startTime);
        if (!muted) {
            filter.frequency.exponentialRampToValueAtTime(baseCutoff, sustainEnd);
            filter.Q.setValueAtTime(preset.resonance, startTime);
        } else {
            filter.Q.setValueAtTime(0.1, startTime); // Kill resonance for muted thuds
        }

        // Envelopes: Attack -> Sustain -> Decay
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(randomizedVol, attackEnd);
        gainNode.gain.setValueAtTime(randomizedVol, sustainEnd);
        gainNode.gain.exponentialRampToValueAtTime(0.001, releaseTime);

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
            // Lowered frequency multiplier (from 4.1 to 3.2) for a more "wooden" feel
            click.frequency.setValueAtTime(freq * (muted ? 1.2 : 3.2), startTime);
            clickGain.gain.setValueAtTime(0, startTime);
            // Lowered click volume (from 0.4 to 0.25)
            clickGain.gain.linearRampToValueAtTime(randomizedVol * 0.25, startTime + 0.002);
            clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + (muted ? 0.03 : 0.08));
            click.connect(clickGain);
            clickGain.connect(panNode);
            click.start(startTime);
            click.stop(startTime + 0.15);
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
        filter.frequency.setValueAtTime(1200 + Math.random() * 400, time);
        filter.Q.setValueAtTime(1.5, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(randomizedVol, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.chordsGain);
        
        noise.start(time);
        noise.stop(time + 0.05);
        
        noise.onended = () => safeDisconnect([gain, filter, noise]);
    } catch (e) { console.error("playChordScratch error:", e); }
}

export function playBassNote(freq, time, duration, velocity = 1.0, muted = false) {
    if (!Number.isFinite(freq) || !Number.isFinite(time) || !Number.isFinite(duration)) return;
    if (freq < 10 || freq > 24000) return;
    try {
            // Boosted volume multiplier for better mix presence, mixed with input velocity
            const vol = 1.1 * velocity * (0.95 + Math.random() * 0.1);
            // Allow slight tonal bleed for muted notes for realism
            const tonalVol = muted ? vol * 0.2 : vol;
        
            // Body (Fundamental + warmth)
    const oscBody = ctx.audio.createOscillator();
    oscBody.type = 'triangle';
    oscBody.frequency.setValueAtTime(freq, time);

    // Growl/String character (Harmonics)
    const oscGrowl = ctx.audio.createOscillator();
    oscGrowl.type = 'sawtooth';
    oscGrowl.frequency.setValueAtTime(freq, time);
    const growlGain = ctx.audio.createGain();
    growlGain.gain.setValueAtTime(tonalVol * 0.4, time);
    growlGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.2);

    const growlFilter = ctx.audio.createBiquadFilter();
    growlFilter.type = 'lowpass';
    // Dynamic brightness based on velocity
    const dynamicCutoff = 800 + (vol * 1500); 
    growlFilter.frequency.setValueAtTime(dynamicCutoff, time);
    growlFilter.Q.setValueAtTime(2, time);

    // Percussive Thump (Finger/Pick noise)
    const thump = ctx.audio.createBufferSource();
    thump.buffer = gb.audioBuffers.noise;
    const thumpFilter = ctx.audio.createBiquadFilter();
    thumpFilter.type = 'lowpass';
    thumpFilter.frequency.setValueAtTime(1500, time);
    const thumpGain = ctx.audio.createGain();
    const thumpTargetVol = vol * (muted ? 0.4 : 0.2);
    thumpGain.gain.setValueAtTime(0, time);
    thumpGain.gain.linearRampToValueAtTime(thumpTargetVol, time + 0.002);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, time + (muted ? 0.03 : 0.04));
    thump.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    
    // EQ Chain
    const weight = ctx.audio.createBiquadFilter();
    weight.type = 'lowshelf';
    weight.frequency.setValueAtTime(100, time);
    weight.gain.setValueAtTime(2, time);

    const scoop = ctx.audio.createBiquadFilter();
    scoop.type = 'peaking';
    scoop.frequency.setValueAtTime(500, time);
    scoop.Q.setValueAtTime(0.8, time);
    scoop.gain.setValueAtTime(-10, time);

    const definition = ctx.audio.createBiquadFilter();
    definition.type = 'peaking';
    definition.frequency.setValueAtTime(2500, time);
    definition.Q.setValueAtTime(1.2, time);
    definition.gain.setValueAtTime(3, time);

    const mainFilter = ctx.audio.createBiquadFilter();
    mainFilter.type = 'lowpass';
    // Dynamic filter envelope for punch
    mainFilter.frequency.setValueAtTime(1000 + (tonalVol * 2000), time);
    mainFilter.frequency.exponentialRampToValueAtTime(600, time + duration);

    const gain = ctx.audio.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(tonalVol, time + 0.005);
    const tonalDecay = muted ? 0.08 : (duration * 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, time + tonalDecay);

    oscBody.connect(mainFilter);
    oscGrowl.connect(growlFilter);
    growlFilter.connect(growlGain);
    growlGain.connect(mainFilter);
    
    thumpGain.connect(gain);
    mainFilter.connect(weight);
    weight.connect(scoop);
    scoop.connect(definition);
    definition.connect(gain);
    gain.connect(ctx.bassGain);

    // Monophonic Cutoff: Stop previous bass note if it's still ringing
    if (bb.lastBassGain) {
        try {
            const t = time;
            const g = bb.lastBassGain.gain;
            // Use cancelAndHoldAtTime to avoid volume jumps (clicks) by starting fade from current computed value
            if (g.cancelAndHoldAtTime) {
                g.cancelAndHoldAtTime(t);
            } else {
                g.cancelScheduledValues(t);
            }
            // Linear fade out over 5ms to match the attack of the new note (symmetrical crossfade)
            g.linearRampToValueAtTime(0, t + 0.005);
        } catch (e) {
            // Ignore errors if previous node is already gone/disconnected
        }
    }
    bb.lastBassGain = gain;

    oscBody.start(time);
    oscGrowl.start(time);
    thump.start(time);
    
    oscBody.stop(time + duration * 1.5 + 0.1);
    oscGrowl.stop(time + duration * 1.5 + 0.1);
    thump.stop(time + 0.05);
    
    oscBody.onended = () => safeDisconnect([gain, definition, scoop, weight, mainFilter, growlFilter, growlGain, thumpGain, thumpFilter, oscBody, oscGrowl, thump]);
    } catch (e) {
        console.error("playBassNote error:", e, { freq, time, duration });
    }
}

export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = 'scalar') {
    if (!Number.isFinite(freq)) return;
    
    const randomizedVol = vol * (0.95 + Math.random() * 0.1);
    const gain = ctx.audio.createGain();
    const pan = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
    if (ctx.audio.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.3, time);

    // Primary Osc: Mixed Saw/Tri for a richer tone
    const osc1 = ctx.audio.createOscillator();
    osc1.type = 'sawtooth'; 
    
    const osc2 = ctx.audio.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(style === 'shred' ? 12 : 6, time);

    // Pitch Envelope
    if (bendStartInterval !== 0) {
        const startFreq = freq * Math.pow(2, -bendStartInterval / 12);
        // Deliberate bends: longer for blues/minimal, and scaled with note duration
        let bendDuration = (style === 'blues' || style === 'minimal') ? 0.25 : 0.15;
        bendDuration = Math.min(duration * 0.6, bendDuration + (duration * 0.05));
        
        osc1.frequency.setValueAtTime(startFreq, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
        osc2.frequency.setValueAtTime(startFreq, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
    } else {
        const scoop = style === 'shred' ? 0.998 : 0.995;
        osc1.frequency.setValueAtTime(freq * scoop, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
        osc2.frequency.setValueAtTime(freq * scoop, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
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
    
    vibrato.frequency.setValueAtTime(vibSpeed, time); 
    const vibGain = ctx.audio.createGain();
    
    const isLongNote = duration > 0.4;
    const vibDelay = (style === 'minimal' ? 0.4 : (style === 'shred' ? 0.05 : 0.15)) + (Math.random() * 0.1);
    const vibRamp = style === 'minimal' ? 0.5 : 0.3;
    
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);
    
    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    vibGain.gain.linearRampToValueAtTime(finalVibDepth, time + vibDelay + vibRamp); 
    
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency);
    vibGain.connect(osc2.frequency);

    // Resonant Filter
    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoffBase = style === 'bird' ? freq * 3.5 : Math.min(freq * 4, 4000);
    filter.frequency.setValueAtTime(cutoffBase, time);
    filter.frequency.exponentialRampToValueAtTime(cutoffBase * (style === 'bird' ? 0.7 : 0.6), time + duration);
    filter.Q.setValueAtTime(style === 'bird' ? 1.5 : (isLongNote ? 2 : 1), time); 

    // Amplitude Envelope
    // Dynamic attack based on duration to prevent "mushy" fast notes
    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = Math.min(baseAttack, duration * 0.25);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(randomizedVol, time + attack); 
    gain.gain.exponentialRampToValueAtTime(randomizedVol * 0.8, time + duration * 0.5);
    
    const releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + releaseTime);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(ctx.soloistGain);

    // Monophonic Cutoff: Only cutoff if this is a NEW time (allows double stops at same time)
    if (sb.lastSoloistGain && time > (sb.lastNoteStartTime || 0)) {
        try {
            const t = time;
            const g = sb.lastSoloistGain.gain;
            if (g.cancelAndHoldAtTime) {
                g.cancelAndHoldAtTime(t);
            } else {
                g.cancelScheduledValues(t);
            }
            g.linearRampToValueAtTime(0, t + 0.005);
        } catch (e) {}
    }
    sb.lastSoloistGain = gain;
    sb.lastNoteStartTime = time;

    // Smart Vibrato Logic
    // Only apply vibrato if note is long enough to warrant it
    if (duration > 0.15) {
        vibrato.start(time);
        vibrato.stop(time + releaseTime + 0.1);
    }

    osc1.start(time);
    osc2.start(time);
    
    const stopTime = time + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect([pan, gain, filter, osc1, osc2, vibrato, vibGain]);
}

export function playDrumSound(name, time, velocity = 1.0) {
    const humanizeFactor = (gb.humanize || 0) / 100;
    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.4);
    const masterVol = velocity * 1.35 * velJitter;
    
    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const vol = masterVol * rr();
        const kickDecay = 0.5 * rr();

        // 1. Transient stage (Beater click)
        const beater = ctx.audio.createOscillator();
        const beaterGain = ctx.audio.createGain();
        beater.type = 'sine';
        beater.frequency.setValueAtTime(4000 * rr(), time);
        beater.frequency.exponentialRampToValueAtTime(200, time + 0.005);
        beaterGain.gain.setValueAtTime(vol * 0.4, time);
        beaterGain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);
        beater.connect(beaterGain);
        beaterGain.connect(ctx.drumsGain);

        // 2. Body stage (Thump)
        const body = ctx.audio.createOscillator();
        const bodyGain = ctx.audio.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(150 * rr(), time);
        body.frequency.exponentialRampToValueAtTime(50, time + 0.05);
        bodyGain.gain.setValueAtTime(vol, time);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, time + kickDecay);
        body.connect(bodyGain);
        bodyGain.connect(ctx.drumsGain);

        beater.start(time);
        beater.stop(time + 0.01);
        body.start(time);
        body.stop(time + kickDecay);
        
        body.onended = () => safeDisconnect([beater, beaterGain, body, bodyGain]);

    } else if (name === 'Snare') {
        const vol = masterVol * rr();
        const toneDecay = 0.12 * rr();
        const wireDecay = 0.25 * rr();

        // 1. The Tone (Drum head resonance)
        const tone1 = ctx.audio.createOscillator();
        const tone2 = ctx.audio.createOscillator();
        const toneGain = ctx.audio.createGain();
        tone1.type = 'triangle';
        tone2.type = 'sine';
        tone1.frequency.setValueAtTime(180 * rr(), time);
        tone2.frequency.setValueAtTime(330 * rr(), time);
        toneGain.gain.setValueAtTime(vol * 0.5, time);
        toneGain.gain.exponentialRampToValueAtTime(0.01, time + toneDecay);
        tone1.connect(toneGain);
        tone2.connect(toneGain);
        toneGain.connect(ctx.drumsGain);

        // 2. The Wires (Snare rattle)
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const noiseFilter = ctx.audio.createBiquadFilter();
        const noiseGain = ctx.audio.createGain();
        noiseFilter.type = 'bandpass';
        // Velocity mapping for brightness (1.5kHz to 2.5kHz)
        const centerFreq = 1500 + (velocity * 1000);
        const finalFreq = centerFreq * rr();
        
        // Firefox Fix: Explicitly set .value to ensure filter state is correct
        noiseFilter.frequency.value = finalFreq;
        noiseFilter.frequency.setValueAtTime(finalFreq, time);
        
        noiseFilter.Q.value = 1.2;
        noiseFilter.Q.setValueAtTime(1.2, time);
        
        noiseGain.gain.setValueAtTime(vol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + wireDecay);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.drumsGain);

        tone1.start(time);
        tone2.start(time);
        noise.start(time);
        tone1.stop(time + toneDecay);
        tone2.stop(time + toneDecay);
        noise.stop(time + wireDecay);
        
        noise.onended = () => safeDisconnect([tone1, tone2, toneGain, noise, noiseFilter, noiseGain]);

    } else if (name === 'HiHat' || name === 'Open') {
        const isOpen = name === 'Open';
        const vol = masterVol * 0.6 * rr();
        const duration = (isOpen ? 0.4 : 0.06) * rr();
        
        // Metallic Bank (6 square wave oscillators using 808-style ratios)
        const ratios = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];
        const baseFreq = 40 * rr();
        const oscs = ratios.map(r => {
            const o = ctx.audio.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(baseFreq * r, time);
            return o;
        });

        const hpFilter = ctx.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        // Velocity mapping for brightness
        const cutoff = (7000 + velocity * 3000) * rr();
        
        // Firefox Fix: Explicitly set .value to ensure filter state is correct 
        // even if setValueAtTime is processed with slight scheduling latency.
        // Without this, Firefox may momentarily use the default LowPass filter,
        // letting the low square waves through as a "kick" sound.
        hpFilter.frequency.value = cutoff;
        hpFilter.frequency.setValueAtTime(cutoff, time);
        
        hpFilter.Q.value = 1.5;
        hpFilter.Q.setValueAtTime(1.5, time);
        
        const gain = ctx.audio.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        oscs.forEach(o => {
            o.connect(hpFilter);
            o.start(time);
            o.stop(time + duration);
        });
        hpFilter.connect(gain);
        gain.connect(ctx.drumsGain);

        oscs[0].onended = () => safeDisconnect([...oscs, hpFilter, gain]);

    } else if (name === 'Crash') {
        const vol = masterVol * 0.3 * rr(); // Reduced from 0.5 to 0.3
        const duration = 2.5 * rr();
        
        // Metallic Bank (Inharmonic Ratios for shimmer)
        const ratios = [1.0, 1.48, 1.9, 2.55, 3.1, 4.3];
        const baseFreq = 280 * rr();
        const oscs = ratios.map((r, i) => {
            const o = ctx.audio.createOscillator();
            o.type = i < 2 ? 'triangle' : 'square'; // Lower harmonics softer
            o.frequency.setValueAtTime(baseFreq * r, time);
            return o;
        });

        const metalGain = ctx.audio.createGain();
        metalGain.gain.setValueAtTime(0, time);
        metalGain.gain.linearRampToValueAtTime(vol * 0.4, time + 0.03); // Softer attack
        metalGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.6);

        const metalFilter = ctx.audio.createBiquadFilter();
        metalFilter.type = 'highpass';
        metalFilter.frequency.setValueAtTime(4000, time); // Remove tonal "gong" sound
        metalFilter.Q.value = 0.5;

        // Noise Wash (The "Swish")
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        
        const noiseGain = ctx.audio.createGain();
        noiseGain.gain.setValueAtTime(0, time);
        noiseGain.gain.linearRampToValueAtTime(vol * 0.8, time + 0.02);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        const noiseFilter = ctx.audio.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(8000, time);
        noiseFilter.frequency.exponentialRampToValueAtTime(4000, time + duration * 0.5); // Sweep down
        noiseFilter.Q.value = 0.8;

        // Connections
        oscs.forEach(o => {
            o.connect(metalFilter);
            o.start(time);
            o.stop(time + duration);
        });
        metalFilter.connect(metalGain);
        metalGain.connect(ctx.drumsGain);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.drumsGain);
        noise.start(time);
        noise.stop(time + duration);
        
        oscs[0].onended = () => safeDisconnect([...oscs, metalGain, metalFilter, noise, noiseGain, noiseFilter]);
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
