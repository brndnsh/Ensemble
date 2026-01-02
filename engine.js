import { ctx, gb, cb, bb, sb } from './state.js';
import { ui, triggerFlash } from './ui.js';

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
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 */
export function initAudio() {
    if (!ctx.audio) {
        ctx.audio = new (window.AudioContext || window.webkitAudioContext)();

        ctx.masterGain = ctx.audio.createGain();
        ctx.masterGain.gain.value = parseFloat(ui.masterVol.value);
        
        ctx.compressor = ctx.audio.createDynamicsCompressor();
        // Relaxed settings: higher threshold, lower ratio, faster release
        ctx.compressor.threshold.setValueAtTime(-15, ctx.audio.currentTime);
        ctx.compressor.knee.setValueAtTime(30, ctx.audio.currentTime);
        ctx.compressor.ratio.setValueAtTime(4, ctx.audio.currentTime);
        ctx.compressor.attack.setValueAtTime(0.003, ctx.audio.currentTime); // Slight attack to preserve transients
        ctx.compressor.release.setValueAtTime(0.1, ctx.audio.currentTime); // Faster recovery
        
        ctx.masterGain.connect(ctx.compressor);
        ctx.compressor.connect(ctx.audio.destination);

        // Reverb setup
        ctx.reverbNode = ctx.audio.createConvolver();
        ctx.reverbNode.buffer = createReverbImpulse(ctx.audio, 1.5, 3.0);
        ctx.reverbNode.connect(ctx.masterGain);

        // Instrument Buses
        ctx.chordsGain = ctx.audio.createGain();
        ctx.chordsGain.gain.value = cb.volume;
        ctx.chordsGain.connect(ctx.masterGain);

        ctx.bassGain = ctx.audio.createGain();
        ctx.bassGain.gain.value = bb.volume;
        ctx.bassGain.connect(ctx.masterGain);

        ctx.soloistGain = ctx.audio.createGain();
        ctx.soloistGain.gain.value = sb.volume;
        ctx.soloistGain.connect(ctx.masterGain);

        ctx.drumsGain = ctx.audio.createGain();
        ctx.drumsGain.gain.value = gb.volume;
        ctx.drumsGain.connect(ctx.masterGain);

        // Reverb Sends (Post-Fader from Buses)
        ctx.chordsReverb = ctx.audio.createGain();
        ctx.chordsReverb.gain.value = cb.reverb;
        ctx.chordsGain.connect(ctx.chordsReverb);
        ctx.chordsReverb.connect(ctx.reverbNode);

        ctx.drumsReverb = ctx.audio.createGain();
        ctx.drumsReverb.gain.value = gb.reverb;
        ctx.drumsGain.connect(ctx.drumsReverb);
        ctx.drumsReverb.connect(ctx.reverbNode);

        ctx.bassReverb = ctx.audio.createGain();
        ctx.bassReverb.gain.value = bb.reverb;
        ctx.bassGain.connect(ctx.bassReverb);
        ctx.bassReverb.connect(ctx.reverbNode);

        ctx.soloistReverb = ctx.audio.createGain();
        ctx.soloistReverb.gain.value = sb.reverb;
        ctx.soloistGain.connect(ctx.soloistReverb);
        ctx.soloistReverb.connect(ctx.reverbNode);

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

export function playNote(freq, time, duration, vol = 0.1, att = 0.05, soft = false, resonance = 1, lfoHz = 0) {
    try {
        // Add subtle volume randomization
        const randomizedVol = vol * (0.92 + Math.random() * 0.16);
        const gain = ctx.audio.createGain();
        let pan = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
        
        if (ctx.audio.createStereoPanner) {
            // Pitch-based panning for stable stereo image (Piano style: Lows Left, Highs Right)
            // Center around Middle C (261.63 Hz)
            // Map 2 octaves down/up to full pan width
            if (Number.isFinite(freq)) {
                let panVal = (Math.log2(freq / 261.63) / 2.5); 
                panVal = Math.max(-0.7, Math.min(0.7, panVal));
                pan.pan.setValueAtTime(panVal, time);
            } else {
                 pan.pan.setValueAtTime(0, time);
            }
        }

        const osc1 = ctx.audio.createOscillator();
        osc1.type = 'triangle';
        if (Number.isFinite(freq)) osc1.frequency.setValueAtTime(freq, time);
        osc1.detune.setValueAtTime(Math.random() * 4 - 2, time);
        
        let lfo = null, lfoGain = null;
        if (lfoHz > 0) {
            lfo = ctx.audio.createOscillator();
            lfoGain = ctx.audio.createGain();
            lfo.frequency.setValueAtTime(lfoHz, time);
            lfoGain.gain.setValueAtTime(freq * 0.005, time);
            lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);
            lfo.start(time); lfo.stop(time + duration * 2);
        }
        
        const osc2 = ctx.audio.createOscillator();
        osc2.type = 'sine';
        if (Number.isFinite(freq)) osc2.frequency.setValueAtTime(freq, time);
        const filter = ctx.audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(soft ? 600 : 1800, time);
        filter.frequency.exponentialRampToValueAtTime(soft ? 200 : 300, time + duration);
        filter.Q.setValueAtTime(resonance, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(randomizedVol, time + att);
        const releaseTime = soft ? duration * 1.5 : duration;
        gain.gain.exponentialRampToValueAtTime(0.001, time + releaseTime);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(pan); 
        pan.connect(ctx.chordsGain);
        
        osc1.onended = () => safeDisconnect([pan, gain, filter, osc1, osc2, lfo, lfoGain]);
        
        osc1.start(time); osc1.stop(time + releaseTime); osc2.start(time); osc2.stop(time + releaseTime);
        if (!soft) {
            const tine = ctx.audio.createOscillator(), tGain = ctx.audio.createGain();
            tine.type = 'sine'; if (Number.isFinite(freq)) tine.frequency.setValueAtTime(freq * 4, time);
            tGain.gain.setValueAtTime(0, time); tGain.gain.linearRampToValueAtTime(randomizedVol * 0.25, time + 0.002);
            tGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            tine.onended = () => safeDisconnect([tGain, tine]);
            tine.connect(tGain); 
            tGain.connect(pan); 
            tine.start(time); tine.stop(time + 0.15);
        }
    } catch (e) { console.error("playNote error:", e); }
}

export function playBassNote(freq, time, duration) {
    if (!Number.isFinite(freq)) return;
    // Boosted volume multiplier for better mix presence
    const vol = 1.1 * (0.9 + Math.random() * 0.2);
    
    // Body (Fundamental + warmth)
    const oscBody = ctx.audio.createOscillator();
    oscBody.type = 'triangle';
    oscBody.frequency.setValueAtTime(freq, time);

    // Growl/String character (Harmonics)
    const oscGrowl = ctx.audio.createOscillator();
    oscGrowl.type = 'sawtooth';
    oscGrowl.frequency.setValueAtTime(freq, time);
    const growlGain = ctx.audio.createGain();
    growlGain.gain.setValueAtTime(vol * 0.4, time);
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
    thumpGain.gain.setValueAtTime(vol * 0.2, time);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    thump.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    
    // EQ Chain
    const weight = ctx.audio.createBiquadFilter();
    weight.type = 'lowshelf';
    weight.frequency.setValueAtTime(100, time);
    weight.gain.setValueAtTime(4, time);

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
    mainFilter.frequency.setValueAtTime(1000 + (vol * 2000), time);
    mainFilter.frequency.exponentialRampToValueAtTime(600, time + duration);

    const gain = ctx.audio.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.5);

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

    oscBody.start(time);
    oscGrowl.start(time);
    thump.start(time);
    
    oscBody.stop(time + duration * 1.5 + 0.1);
    oscGrowl.stop(time + duration * 1.5 + 0.1);
    thump.stop(time + 0.05);
    
    oscBody.onended = () => safeDisconnect([gain, definition, scoop, weight, mainFilter, growlFilter, growlGain, thumpGain, thumpFilter, oscBody, oscGrowl, thump]);
}

export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0) {
    if (!Number.isFinite(freq)) return;
    
    const randomizedVol = vol * (0.95 + Math.random() * 0.1);
    const gain = ctx.audio.createGain();
    const pan = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
    if (ctx.audio.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.3, time);

    // Osc 1: Primary Sawtooth
    const osc1 = ctx.audio.createOscillator();
    osc1.type = 'sawtooth';
    
    // Osc 2: Detuned Sawtooth for thickness
    const osc2 = ctx.audio.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.setValueAtTime(14, time); // 14 cents detune

    // Pitch Envelope
    if (bendStartInterval > 0) {
        // Calculate start freq based on semitone interval
        // freq * 2^(-semitones/12)
        const startFreq = freq * Math.pow(2, -bendStartInterval / 12);
        
        // Slower, expressive bend duration (0.15s to 0.3s depending on note length)
        // Cap bend duration at note duration to avoid overshooting
        const bendDuration = Math.min(duration, 0.15 + (Math.random() * 0.1));
        
        osc1.frequency.setValueAtTime(startFreq, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
        osc2.frequency.setValueAtTime(startFreq, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
    } else {
        // Standard slight attack scoop
        osc1.frequency.setValueAtTime(freq * 0.98, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
        osc2.frequency.setValueAtTime(freq * 0.98, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
    }

    // Vibrato LFO
    const vibrato = ctx.audio.createOscillator();
    const vibSpeed = 5.7 + Math.random() * 0.6;
    vibrato.frequency.setValueAtTime(vibSpeed, time); 
    const vibGain = ctx.audio.createGain();
    
    // More natural vibrato onset
    const isLong = duration > 0.5;
    const depthFactor = isLong ? 0.015 : 0.005;
    const vibDepth = freq * (depthFactor + Math.random() * 0.004);
    
    vibGain.gain.setValueAtTime(0, time);
    // Kick in slightly earlier (100ms) but ramp smoothly
    vibGain.gain.setValueAtTime(0, time + 0.1);
    vibGain.gain.linearRampToValueAtTime(vibDepth, time + 0.5); 
    
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency);
    vibGain.connect(osc2.frequency);

    // Resonant Filter (Warmer settings)
    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    // Lower start cutoff for warmer sound (was 4000)
    filter.frequency.setValueAtTime(3000, time);
    filter.frequency.exponentialRampToValueAtTime(800, time + duration);
    const res = duration > 0.4 ? 3 : 2; // Slightly less resonance for smoother sound
    filter.Q.setValueAtTime(res, time); 

    // Amplitude Envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(randomizedVol, time + 0.02); // Slower attack
    gain.gain.exponentialRampToValueAtTime(randomizedVol * 0.7, time + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(ctx.soloistGain);

    vibrato.start(time);
    osc1.start(time);
    osc2.start(time);
    
    const stopTime = time + duration * 1.2 + 0.1;
    vibrato.stop(stopTime);
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect([pan, gain, filter, osc1, osc2, vibrato, vibGain]);
}

export function playDrumSound(name, time, velocity = 1.0) {
    const masterVol = velocity * 1.2;
    if (name === 'Kick') {
        const osc = ctx.audio.createOscillator();
        const gain = ctx.audio.createGain();
        gain.connect(ctx.drumsGain);
        
        const pitch = 150 + (Math.random() * 10 - 5);
        const decay = 0.4 + (Math.random() * 0.2);
        const vol = masterVol * (0.95 + Math.random() * 0.1);

        osc.frequency.setValueAtTime(pitch, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + decay);
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
        osc.onended = () => safeDisconnect([gain, osc]);
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + decay);
    } else if (name === 'Snare') {
        const vol = masterVol * (0.9 + Math.random() * 0.2);
        const decay = 0.2 + (Math.random() * 0.1);

        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const noiseFilter = ctx.audio.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000 + (Math.random() * 200 - 100);
        const noiseGain = ctx.audio.createGain();
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.drumsGain);
        noiseGain.gain.setValueAtTime(vol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + decay);
        noise.onended = () => safeDisconnect([noiseGain, noiseFilter, noise]);
        noise.start(time);
        noise.stop(time + decay);
        
        const tone = ctx.audio.createOscillator();
        tone.type = 'triangle';
        tone.frequency.setValueAtTime(250 + (Math.random() * 20 - 10), time);
        const toneGain = ctx.audio.createGain();
        toneGain.connect(ctx.drumsGain);
        toneGain.gain.setValueAtTime(vol * 0.5, time);
        toneGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        tone.onended = () => safeDisconnect([toneGain, tone]);
        tone.connect(toneGain);
        tone.start(time);
        tone.stop(time + 0.1);
    } else if (name === 'HiHat' || name === 'Open') {
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const filter = ctx.audio.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000 + (Math.random() * 2000 - 1000);
        
        const hGain = ctx.audio.createGain();
        noise.connect(filter);
        filter.connect(hGain);
        hGain.connect(ctx.drumsGain);
        
        const baseDuration = (name === 'Open' ? 0.4 : 0.05);
        const duration = baseDuration * (0.8 + Math.random() * 0.4);
        const vol = masterVol * 0.7 * (0.8 + Math.random() * 0.4);

        hGain.gain.setValueAtTime(vol, time);
        hGain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        noise.onended = () => safeDisconnect([hGain, filter, noise]);
        noise.start(time);
        noise.stop(time + duration);
    }
}
