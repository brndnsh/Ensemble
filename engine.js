import { ctx, gb, cb, bb } from './state.js';
import { ui, triggerFlash } from './ui.js';

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 */
export function initAudio() {
    if (!ctx.audio) {
        ctx.audio = new (window.AudioContext || window.webkitAudioContext)();
        // ... (rest of function)

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

        const bufSize = ctx.audio.sampleRate * 2;
        const buffer = ctx.audio.createBuffer(1, bufSize, ctx.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        gb.audioBuffers.noise = buffer;
    }
    if (ctx.audio.state === 'suspended') ctx.audio.resume();
}

export function playNote(freq, time, duration, vol = 0.1, att = 0.05, soft = false, resonance = 1, lfoHz = 0) {
    try {
        const gain = ctx.audio.createGain();
        let pan = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : ctx.audio.createGain();
        if (ctx.audio.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.6, time);
        const osc1 = ctx.audio.createOscillator();
        osc1.type = 'triangle';
        if (Number.isFinite(freq)) osc1.frequency.setValueAtTime(freq, time);
        osc1.detune.setValueAtTime(Math.random() * 4 - 2, time);
        if (lfoHz > 0) {
            const lfo = ctx.audio.createOscillator(), lfoGain = ctx.audio.createGain();
            lfo.frequency.setValueAtTime(lfoHz, time);
            lfoGain.gain.setValueAtTime(freq * 0.005, time);
            lfo.onended = () => { lfoGain.disconnect(); lfo.disconnect(); };
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
        gain.gain.linearRampToValueAtTime(vol, time + att);
        const releaseTime = soft ? duration * 1.5 : duration;
        gain.gain.exponentialRampToValueAtTime(0.001, time + releaseTime);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(ctx.masterGain);
        
        osc1.onended = () => {
            pan.disconnect();
            gain.disconnect();
            filter.disconnect();
            osc1.disconnect();
            osc2.disconnect();
        };
        
        osc1.start(time); osc1.stop(time + releaseTime); osc2.start(time); osc2.stop(time + releaseTime);
        if (!soft) {
            const tine = ctx.audio.createOscillator(), tGain = ctx.audio.createGain();
            tine.type = 'sine'; if (Number.isFinite(freq)) tine.frequency.setValueAtTime(freq * 4, time);
            tGain.gain.setValueAtTime(0, time); tGain.gain.linearRampToValueAtTime(vol * 0.25, time + 0.002);
            tGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            tine.onended = () => { tGain.disconnect(); tine.disconnect(); };
            tine.connect(tGain); tGain.connect(pan); tine.start(time); tine.stop(time + 0.15);
        }
    } catch (e) { console.error("playNote error:", e); }
}

export function playBassNote(freq, time, duration) {
    if (!Number.isFinite(freq)) return;
    const vol = bb.volume;
    const osc = ctx.audio.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration * 1.2);
    filter.Q.value = 1;

    const gain = ctx.audio.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.masterGain);

    osc.start(time);
    osc.stop(time + duration * 1.2 + 0.1);
    osc.onended = () => { gain.disconnect(); filter.disconnect(); osc.disconnect(); };
}

export function playDrumSound(name, time) {
    const vol = gb.volume;
    if (name === 'Kick') {
        const osc = ctx.audio.createOscillator();
        const gain = ctx.audio.createGain();
        gain.connect(ctx.masterGain);
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
        osc.onended = () => { gain.disconnect(); osc.disconnect(); };
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + 0.5);
    } else if (name === 'Snare') {
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const noiseFilter = ctx.audio.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        const noiseGain = ctx.audio.createGain();
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.masterGain);
        noiseGain.gain.setValueAtTime(vol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        noise.onended = () => { noiseGain.disconnect(); noiseFilter.disconnect(); noise.disconnect(); };
        noise.start(time);
        noise.stop(time + 0.2);
        
        const tone = ctx.audio.createOscillator();
        tone.type = 'triangle';
        tone.frequency.setValueAtTime(250, time);
        const toneGain = ctx.audio.createGain();
        toneGain.connect(ctx.masterGain);
        toneGain.gain.setValueAtTime(vol * 0.5, time);
        toneGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        tone.onended = () => { toneGain.disconnect(); tone.disconnect(); };
        tone.connect(toneGain);
        tone.start(time);
        tone.stop(time + 0.1);
    } else if (name === 'HiHat' || name === 'Open') {
        const noise = ctx.audio.createBufferSource();
        noise.buffer = gb.audioBuffers.noise;
        const filter = ctx.audio.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000;
        const hGain = ctx.audio.createGain();
        noise.connect(filter);
        filter.connect(hGain);
        hGain.connect(ctx.masterGain);
        const duration = (name === 'Open' ? 0.4 : 0.05);
        hGain.gain.setValueAtTime(vol * 0.7, time);
        hGain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        noise.onended = () => { hGain.disconnect(); filter.disconnect(); noise.disconnect(); };
        noise.start(time);
        noise.stop(time + duration);
    }
}
