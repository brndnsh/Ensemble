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
 * Tracks all active piano notes currently held by the sustain pedal.
 */
const heldNotes = new Set();

/**
 * Creates a custom PeriodicWave that models the harmonic profile of a Grand Piano.
 * @param {AudioContext} audioCtx 
 * @returns {PeriodicWave}
 */
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
    const scheduleTime = time !== null ? time : (ctx.audio?.currentTime || 0);
    ctx.sustainActive = active;
    
    if (!active) {
        // Release all held notes
        heldNotes.forEach((note) => {
            note.stop(scheduleTime);
        });
        heldNotes.clear();
    }
}

/**
 * Forcefully kills all ringing piano notes (panic button).
 */
export function killAllPianoNotes() {
    const now = ctx.audio?.currentTime || 0;
    heldNotes.forEach(note => {
        if (typeof note.stop === 'function') {
            note.stop(now, true);
        }
    });
    heldNotes.clear();
    ctx.sustainActive = false;
}

export function killSoloistNote() {
    if (sb.lastSoloistGain) {
        try {
            const g = sb.lastSoloistGain.gain;
            g.cancelScheduledValues(ctx.audio.currentTime);
            g.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
        } catch(e) {}
        sb.lastSoloistGain = null;
    }
}

export function killBassNote() {
    if (bb.lastBassGain) {
        try {
            const g = bb.lastBassGain.gain;
            g.cancelScheduledValues(ctx.audio.currentTime);
            g.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
        } catch(e) {}
        bb.lastBassGain = null;
    }
}

export function killChordBus() {
    if (ctx.audio && ctx.chordsGain) {
        const t = ctx.audio.currentTime;
        ctx.chordsGain.gain.cancelScheduledValues(t);
        ctx.chordsGain.gain.setTargetAtTime(0, t, 0.008);
    }
}

export function killBassBus() {
    if (ctx.audio && ctx.bassGain) {
        const t = ctx.audio.currentTime;
        ctx.bassGain.gain.cancelScheduledValues(t);
        ctx.bassGain.gain.setTargetAtTime(0, t, 0.008);
    }
}

export function killSoloistBus() {
    if (ctx.audio && ctx.soloistGain) {
        const t = ctx.audio.currentTime;
        ctx.soloistGain.gain.cancelScheduledValues(t);
        ctx.soloistGain.gain.setTargetAtTime(0, t, 0.008);
    }
}

export function killDrumNote() {
    if (gb.lastHatGain) {
        try {
            const g = gb.lastHatGain.gain;
            g.cancelScheduledValues(ctx.audio.currentTime);
            g.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
        } catch(e) {}
        gb.lastHatGain = null;
    }
}

export function killDrumBus() {
    if (ctx.audio && ctx.drumsGain) {
        const t = ctx.audio.currentTime;
        ctx.drumsGain.gain.cancelScheduledValues(t);
        ctx.drumsGain.gain.setTargetAtTime(0, t, 0.008);
    }
}

/**
 * Ramps instrument buses to zero for instant silence.
 */
export function killAllNotes() {
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killDrumNote();
    
    killChordBus();
    killBassBus();
    killSoloistBus();
    killDrumBus();
}

/**
 * Restores instrument buses to their state-defined volumes.
 */
export function restoreGains() {
    if (!ctx.audio) return;
    const t = ctx.audio.currentTime;
    const modules = [
        { node: ctx.chordsGain, state: cb, mult: MIXER_GAIN_MULTIPLIERS.chords },
        { node: ctx.bassGain, state: bb, mult: MIXER_GAIN_MULTIPLIERS.bass },
        { node: ctx.soloistGain, state: sb, mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { node: ctx.drumsGain, state: gb, mult: MIXER_GAIN_MULTIPLIERS.drums }
    ];
    modules.forEach(m => {
        if (m.node) {
            const target = m.state.enabled ? (m.state.volume * m.mult) : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
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
        gainMult: 1.1 // Reduced from 1.25 to prevent overpowering the mix
    }
};

/**
 * Plays a musical note with advanced synthesis based on instrument presets.
 * @param {number} freq - Frequency in Hz.
 * @param {number} time - AudioContext start time.
 * @param {number} duration - Note duration in seconds.
 * @param {Object} options - Synthesis options.
 */
export function playNote(freq, time, duration, { vol = 0.1, index = 0, instrument = 'Piano', muted = false, dry = false } = {}) {
    if (!Number.isFinite(freq)) return;
    
    try {
        // Fallback safety for legacy instruments
        if (instrument !== 'Piano' && instrument !== 'Warm') instrument = 'Piano';
        
        const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS['Piano'];
        const now = ctx.audio.currentTime;
        const baseTime = Math.max(time, now);
        
        const isPiano = instrument === 'Piano';
        if (isPiano && !pianoWave) pianoWave = createPianoWave(ctx.audio);

        // 1. The "Strum" Offset
        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.010) * staggerMult;
        const startTime = baseTime + stagger;
        
        const velocityCutoff = preset.filterBase + (vol * preset.filterDepth);
        
        // --- Component A: The Hammer Strike ---
        if (isPiano && !muted) {
            const strike = ctx.audio.createBufferSource();
            strike.buffer = gb.audioBuffers.noise;
            const strikeFilter = ctx.audio.createBiquadFilter();
            const strikeGain = ctx.audio.createGain();
            
            strikeFilter.type = 'bandpass';
            strikeFilter.frequency.setValueAtTime(1200 + (vol * 800), startTime);
            strikeFilter.Q.setValueAtTime(1.5, startTime);
            
            strikeGain.gain.setValueAtTime(0, startTime);
            strikeGain.gain.setTargetAtTime(vol * 0.25, startTime, 0.001); // Reduced from 0.4
            strikeGain.gain.setTargetAtTime(0, startTime + 0.01, 0.01);
            
            strike.connect(strikeFilter);
            strikeFilter.connect(strikeGain);
            strikeGain.connect(ctx.chordsGain);
            strike.start(startTime);
            strike.stop(startTime + 0.1);
            strike.onended = () => safeDisconnect([strike, strikeFilter, strikeGain]);
        }

        // --- Component B: The Harmonic Body ---
        const osc = ctx.audio.createOscillator();
        const mainGain = ctx.audio.createGain();
        const filter = ctx.audio.createBiquadFilter();
        
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
        mainGain.gain.setTargetAtTime(vol * (preset.gainMult || 1.0), startTime, preset.attack);

        const stopNote = (t, isPanic = false) => {
            mainGain.gain.cancelScheduledValues(t);
            // Sharp damping for staccato, smoother for sustained, very fast for panic
            const dampingConstant = isPanic ? 0.005 : (duration < 0.2 ? 0.02 : 0.12);
            mainGain.gain.setTargetAtTime(0, t, dampingConstant); 
            try { osc.stop(t + 0.5); } catch(e) {}
        };

        // Handle Reverb Suppression for dry hits
        if (dry && ctx.chordsReverb) {
            // We can't easily disconnect the main gain from reverb for ONE note, 
            // but we can scale the master chord reverb send temporarily or ignore it.
            // For now, we'll just focus on the duration/decay as 'dryness'.
        }

        if (isPiano && ctx.sustainActive && !muted) {
            const noteRef = { stop: stopNote };
            heldNotes.add(noteRef);
            if (heldNotes.size > 64) {
                const firstNote = heldNotes.values().next().value;
                firstNote.stop(now);
                heldNotes.delete(firstNote);
            }
        } else {
            const actualDuration = muted ? 0.015 : duration;
            // Immediate damping at end of duration
            mainGain.gain.setTargetAtTime(0, startTime + actualDuration, 0.03); 
        }

        osc.connect(filter);
        filter.connect(mainGain);
        mainGain.connect(ctx.chordsGain);

        osc.start(startTime);
        if (!ctx.sustainActive || muted) {
            osc.stop(startTime + (muted ? 0.1 : duration + 1.0));
        }

        osc.onended = () => safeDisconnect([osc, filter, mainGain]);

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
        const isPop = velocity > 1.1 && !muted;
        
        // Volume safety threshold: don't trigger DSP for near-silent notes
        if (vol < 0.005) return;

        // Allow slight tonal bleed for muted notes for realism
        const tonalVol = muted ? vol * 0.15 : vol;
    
        // Body (Fundamental + warmth)
        const oscBody = ctx.audio.createOscillator();
        oscBody.type = 'triangle';
        oscBody.frequency.setValueAtTime(freq, startTime);

        // Growl/String character (Harmonics)
        const oscGrowl = ctx.audio.createOscillator();
        oscGrowl.type = isPop ? 'sawtooth' : 'sawtooth'; // Both use sawtooth but different filtering
        oscGrowl.frequency.setValueAtTime(freq, startTime);
        const growlGain = ctx.audio.createGain();
        growlGain.gain.setTargetAtTime(tonalVol * (isPop ? 0.6 : 0.4), startTime, 0.005);
        growlGain.gain.setTargetAtTime(0, startTime + duration * (isPop ? 0.3 : 0.5), 0.1);

        const growlFilter = ctx.audio.createBiquadFilter();
        growlFilter.type = 'lowpass';
        const dynamicCutoff = (isPop ? 3000 : 800) + (vol * 1500); 
        growlFilter.frequency.value = dynamicCutoff; // FF stability fix
        growlFilter.frequency.setTargetAtTime(dynamicCutoff, startTime, 0.01);
        growlFilter.Q.value = isPop ? 3 : 2;
        growlFilter.Q.setValueAtTime(isPop ? 3 : 2, startTime);

        // Percussive Thump (Finger/Pick noise / Slap)
        const thump = ctx.audio.createBufferSource();
        thump.buffer = gb.audioBuffers.noise;
        const thumpFilter = ctx.audio.createBiquadFilter();
        
        // SLAP/MUTE Logic: Ghost notes use a tighter, more resonant "thump"
        thumpFilter.type = muted ? 'bandpass' : 'lowpass';
        const thumpFreq = muted ? 1200 : 600; // Raised frequency for ghost clicks
        thumpFilter.frequency.value = thumpFreq;
        thumpFilter.frequency.setValueAtTime(thumpFreq, startTime);
        if (muted) thumpFilter.Q.value = 4.0; // Higher resonance for "slap" feel

        const thumpGain = ctx.audio.createGain();
        // Ghost notes are mostly percussive; regular notes have just a hint of thump
        const thumpTargetVol = vol * (muted ? 1.0 : (isPop ? 0.35 : 0.2));
        
        thumpGain.gain.value = 0;
        thumpGain.gain.setTargetAtTime(thumpTargetVol, startTime, 0.001);
        thumpGain.gain.setTargetAtTime(0, startTime + (muted ? 0.015 : 0.02), 0.01);
        
        thump.connect(thumpFilter);
        thumpFilter.connect(thumpGain);
        
        const mainFilter = ctx.audio.createBiquadFilter();
        mainFilter.type = 'lowpass';
        const targetCutoff = (isPop ? 4000 : 1000) + (tonalVol * 2000);
        mainFilter.frequency.value = targetCutoff;
        mainFilter.frequency.setValueAtTime(targetCutoff, startTime);
        mainFilter.frequency.setTargetAtTime(isPop ? 1000 : 600, startTime + 0.02, duration * 0.5);

        // Slap/Pop Resonant Peak
        const popPeak = ctx.audio.createBiquadFilter();
        popPeak.type = 'peaking';
        popPeak.frequency.value = 2200; // Lowered from 2500 to move away from nasal range
        popPeak.Q.value = 2.5; // Lowered from 5 to reduce resonance
        popPeak.gain.value = isPop ? 7 : 0; // Lowered from 12
        if (isPop) popPeak.gain.setTargetAtTime(0, startTime + 0.05, 0.05);

        const gain = ctx.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, startTime);
        // Sharper attack for Pop (0.002s) per the plan, regular notes stay at 0.01s
        gain.gain.setTargetAtTime(tonalVol, startTime, isPop ? 0.002 : 0.01);
        
        const sustainDuration = (muted ? 0.01 : (isPop ? duration * 0.1 : duration * 0.2));
        const sustainEnd = startTime + sustainDuration;
        
        gain.gain.setTargetAtTime(0, sustainEnd, isPop ? 0.03 : 0.05);

        oscBody.connect(mainFilter);
        oscGrowl.connect(growlFilter);
        growlFilter.connect(growlGain);
        growlGain.connect(mainFilter);
        
        thumpGain.connect(gain);
        mainFilter.connect(popPeak);
        popPeak.connect(gain);
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
        // Deliberate bends: longer for blues, shorter for bebop
        let bendDuration = 0.1;
        if (style === 'blues') bendDuration = 0.15;
        else if (style === 'bird') bendDuration = 0.05;
        else if (style === 'minimal') bendDuration = 0.25;
        
        bendDuration = Math.min(duration * 0.6, bendDuration);
        
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

    // Monophonic Cutoff: Ensure only one note rings at a time per module.
    // If a note arrives with an identical or past time, we still cutoff to prevent bunching.
    // NEW: Allow small overlap (double stops) if notes start at almost the exact same time.
    if (sb.lastSoloistGain && Math.abs(playTime - sb.lastNoteStartTime) > 0.001) {
        try {
            const g = sb.lastSoloistGain.gain;
            g.cancelScheduledValues(playTime);
            g.setTargetAtTime(0, playTime, 0.005);
        } catch (e) {}
    }
    
    // Only track the primary note for future cutoffs
    if (Math.abs(playTime - sb.lastNoteStartTime) > 0.001) {
        sb.lastSoloistGain = gain;
        sb.lastNoteStartTime = playTime;
    }

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

    } else if (name === 'Snare' || name === 'Sidestick') {
        const isSidestick = name === 'Sidestick';
        const vol = masterVol * rr() * (isSidestick ? 0.8 : 1.0);

        if (isSidestick) {
            // --- Sidestick (Rim Click) - 3-Layer Model ---
            
            // 1. The "Click" (Transient Impact)
            const click = ctx.audio.createOscillator();
            const clickGain = ctx.audio.createGain();
            click.type = 'sine';
            click.frequency.setValueAtTime(6500 * rr(), playTime);
            
            clickGain.gain.setValueAtTime(0, playTime);
            clickGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.001);
            clickGain.gain.setTargetAtTime(0, playTime + 0.005, 0.005); // Faster decay
            
            click.connect(clickGain);
            clickGain.connect(ctx.drumsGain);
            
            // 2. The "Body" (Woody Resonance)
            const body = ctx.audio.createOscillator();
            const bodyGain = ctx.audio.createGain();
            const bodyFilter = ctx.audio.createBiquadFilter();
            
            body.type = 'triangle';
            const bodyFreq = 330 * rr();
            body.frequency.setValueAtTime(bodyFreq, playTime);
            body.frequency.setTargetAtTime(bodyFreq * 0.9, playTime, 0.1); 
            
            bodyFilter.type = 'bandpass';
            bodyFilter.frequency.setValueAtTime(350, playTime);
            bodyFilter.Q.setValueAtTime(1.5, playTime);

            bodyGain.gain.setValueAtTime(0, playTime);
            bodyGain.gain.setTargetAtTime(vol * 0.8, playTime, 0.002);
            bodyGain.gain.setTargetAtTime(0, playTime + 0.02, 0.04); 
            
            body.connect(bodyFilter);
            bodyFilter.connect(bodyGain);
            bodyGain.connect(ctx.drumsGain);
            
            // 3. The "Snap" (Noise Texture)
            const noise = ctx.audio.createBufferSource();
            noise.buffer = gb.audioBuffers.noise;
            const noiseFilter = ctx.audio.createBiquadFilter();
            const noiseGain = ctx.audio.createGain();
            
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.setValueAtTime(3500, playTime);
            
            noiseGain.gain.setValueAtTime(0, playTime);
            noiseGain.gain.setTargetAtTime(vol * 0.35, playTime, 0.002);
            noiseGain.gain.setTargetAtTime(0, playTime + 0.01, 0.02); 
            
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.drumsGain);
            
            // Trigger
            click.start(playTime);
            body.start(playTime);
            noise.start(playTime);
            
            const stopTime = playTime + 0.5; // Generous stop
            click.stop(stopTime);
            body.stop(stopTime);
            noise.stop(stopTime);
            
            noise.onended = () => safeDisconnect([click, clickGain, body, bodyFilter, bodyGain, noise, noiseFilter, noiseGain]);
            
            return; // Exit early for Sidestick
        }

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
        const vol = masterVol * (isOpen ? 0.5 : 0.7) * rr();

        // 1. Improved Choking Logic (Natural "Grab")
        if (gb.lastHatGain) {
            try {
                const g = gb.lastHatGain.gain;
                g.cancelScheduledValues(playTime);
                // Very fast exponential ramp (0.005s) to zero to prevent clicks
                g.setTargetAtTime(0, playTime, 0.005);
            } catch (e) {}
        }
        
        // 2. Metallic Bank (TR-808 Inharmonicity)
        // 6 Square wave oscillators with specific non-integer ratios
        const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
        const baseFreq = 40 * rr();
        const oscs = ratios.map(r => {
            const o = ctx.audio.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(baseFreq * r, playTime);
            return o;
        });

        // 3. Tone Shaping
        // Bandpass (10kHz) followed by Highpass (7kHz) to remove low-frequency hiss
        const bpFilter = ctx.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(10000, playTime);
        bpFilter.Q.value = 1.0;

        const hpFilter = ctx.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(7000, playTime);

        // 4. Envelope & Gain
        const gain = ctx.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);
        
        if (isOpen) {
            // "Blooming" attack: slightly slower
            gain.gain.setTargetAtTime(vol, playTime, 0.015);
            // Longer decay (around 0.3s to 0.5s)
            gain.gain.setTargetAtTime(0, playTime + 0.02, 0.35 * rr());
        } else {
            // Fast attack for closed hat
            gain.gain.setTargetAtTime(vol, playTime, 0.002);
            // Tight decay
            gain.gain.setTargetAtTime(0, playTime + 0.005, 0.05 * rr());
        }

        gb.lastHatGain = gain;

        // Connections: Oscs -> BP -> HP -> Gain -> Master
        oscs.forEach(o => {
            o.connect(bpFilter);
            o.start(playTime);
            // Generous stop time to allow for decay tails
            o.stop(playTime + (isOpen ? 2.0 : 0.4));
        });

        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(ctx.drumsGain);

        oscs[0].onended = () => {
            if (gb.lastHatGain === gain) gb.lastHatGain = null;
            safeDisconnect([...oscs, bpFilter, hpFilter, gain]);
        };

    } else if (name === 'Crash') {
        const vol = masterVol * 0.85 * rr();
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
