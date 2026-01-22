import { ctx, hb, gb } from './state.js';
import { safeDisconnect } from './utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (hb).
 * Optimized for Horns (stabs) and Strings (pads).
 */

export function killHarmonyNote(fadeTime = 0.05) {
    if (hb.activeVoices && hb.activeVoices.length > 0) {
        hb.activeVoices.forEach(voice => {
            try {
                const g = voice.gain.gain;
                g.cancelScheduledValues(ctx.audio.currentTime);
                g.setTargetAtTime(0, ctx.audio.currentTime, fadeTime);
            } catch { /* ignore error */ }
        });
        hb.activeVoices = [];
    }
}

/**
 * Plays a harmony note with genre-specific synthesis and articulations.
 */
export function playHarmonyNote(freq, time, duration, vol = 0.4, style = 'stabs', midi = null, slideInterval = 0, slideDuration = 0, vibrato = { rate: 0, depth: 0 }) {
    if (!Number.isFinite(freq) || !ctx.audio) return;
    
    const now = ctx.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = gb.genreFeel;

    if (!hb.activeVoices) hb.activeVoices = [];
    
    // 1. Strict Voice Management & Stealing
    // Remove expired voices
    hb.activeVoices = hb.activeVoices.filter(v => (v.time + v.duration + 0.1) > playTime);
    
    // Pitch-aware Stealing: If this exact MIDI note is already playing, kill it immediately
    if (midi !== null) {
        const existing = hb.activeVoices.find(v => v.midi === midi);
        if (existing) {
            existing.gain.gain.cancelScheduledValues(playTime);
            existing.gain.gain.setTargetAtTime(0, playTime, 0.005);
            hb.activeVoices = hb.activeVoices.filter(v => v !== existing);
        }
    }

    // Polyphonic Limit (Max 3 voices for clarity and ensemble focus)
    if (hb.activeVoices.length >= 3) {
        const oldest = hb.activeVoices.shift();
        if (oldest) {
            oldest.gain.gain.cancelScheduledValues(playTime);
            oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
        }
    }

    // Module-Level Polyphony Scaling
    const polyphonyDucking = hb.activeVoices.length > 1 ? 0.85 : 1.0;
    const finalVol = vol * polyphonyDucking;

    const gain = ctx.audio.createGain();
    gain.gain.value = 0;

    // --- Articulation: Stereo Stage Bloom ---
    // Widens the ensemble as intensity builds. 
    // Low intensity = centered/focused. High intensity = wide/orchestral.
    const panner = ctx.audio.createStereoPanner ? ctx.audio.createStereoPanner() : null;
    if (panner) {
        // Random slight pan per voice, depth scales with intensity
        const panRange = 0.1 + (ctx.bandIntensity * 0.7); 
        const panValue = (Math.random() * 2 - 1) * panRange;
        panner.pan.setValueAtTime(panValue, playTime);
    }

    // Synthesis: Multi-oscillator setup for "Ensemble" feel
    const osc1 = ctx.audio.createOscillator();
    const osc2 = ctx.audio.createOscillator();

    // --- Lane Protection: Sub-Oscillator ---
    // Only use the sub-oscillator if the main frequency is high enough 
    // to keep the sub-octave out of the primary bass territory.
    const useSub = freq > 200; // Above G3
    const sub = useSub ? ctx.audio.createOscillator() : null;
    
    // --- Articulation: Vibrato (LFO) ---
    let lfo = null;
    let lfoGain = null;
    
    // Organ Leslie Effect override
    if (style === 'organ') {
        vibrato = { rate: 6.0, depth: 10 }; // Fast rotation
    }

    if (vibrato && vibrato.rate > 0 && vibrato.depth > 0) {
        lfo = ctx.audio.createOscillator();
        lfoGain = ctx.audio.createGain();
        lfo.frequency.setValueAtTime(vibrato.rate, playTime);
        lfoGain.gain.setValueAtTime(vibrato.depth, playTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        // Organ: Leslie affects all drawbars
        if (style === 'organ') {
            lfoGain.connect(osc2.frequency);
            if (sub) lfoGain.connect(sub.frequency);
        } else {
            lfoGain.connect(osc2.frequency);
            if (sub) lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
    }

    if (feel === 'Rock' || feel === 'Metal') {
        // Aggressive Brass/Synth: Bright Sawtooths
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(15, playTime); 
        if (sub) {
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } 
    else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        // Warm/Soulful: Multi-Triangle for clarity
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(2, playTime); 
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    else if (style === 'organ') {
        // B3 Drawbar Simulation: Root + Octave + Fifth + Percussion
        osc1.type = 'sine'; // Fundamental
        osc2.type = 'sine'; // Octave up (4')
        osc2.frequency.setValueAtTime(freq * 2, playTime);
        
        if (sub) {
            sub.type = 'sine'; // Sub-fundamental (16')
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }

        // Key Click (Percussion)
        const click = ctx.audio.createOscillator();
        const clickGain = ctx.audio.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(freq * 3, playTime); // 12th (2 2/3')
        clickGain.gain.setValueAtTime(finalVol * 0.4, playTime);
        clickGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.05);
        
        click.connect(clickGain);
        clickGain.connect(gain); // Route through main envelope
        click.start(playTime);
        click.stop(playTime + 0.1);
    }
    else if (style === 'plucks') {
        // Modern EDM Pluck: Short, resonant, punchy
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc2.detune.setValueAtTime(5, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    else if (style === 'counter') {
        // Cello/Trombone hybrid: Sawtooth with heavy filtering
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, playTime);
    }
    else if (style === 'stabs') {
        // Horn-like: Bright Sawtooth with body
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(12, playTime); 
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else {
        // Lush Strings: Mixed waveforms
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    
    // --- Articulation: Slides ---
    if (slideInterval !== 0 && slideDuration > 0) {
        const startFreq = freq * Math.pow(2, slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        if (sub) sub.frequency.setValueAtTime(startFreq * 0.5, playTime);

        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) sub.frequency.setValueAtTime(freq * 0.5, playTime);
    }

    // Filter Envelope
    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    
    // --- Articulation: Timbral Bloom ---
    // Brightness scales with intensity. 
    const intensity = ctx.bandIntensity;
    const brightnessMult = 1.0 + (intensity * 2.0); // Up to 3x brightness increase

    if (style === 'stabs') {
        const qVal = (feel === 'Rock' || feel === 'Metal') ? (5 + intensity * 5) : (3 + intensity * 2);
        const startFreq = Math.min(freq * 8 * brightnessMult, 12000);
        filter.frequency.setValueAtTime(startFreq, playTime);
        filter.frequency.exponentialRampToValueAtTime(freq * 2 * brightnessMult, playTime + 0.1);
        filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === 'plucks') {
        // "Bubble" envelope
        filter.frequency.setValueAtTime(freq * 8, playTime);
        filter.frequency.exponentialRampToValueAtTime(freq * 1.5, playTime + 0.15); // Fast snap
        filter.Q.setValueAtTime(5 + (intensity * 5), playTime); // High resonance
    } else if (style === 'counter') {
        // Expressive swell
        const start = freq * 1.5;
        const peak = freq * 3.0 * brightnessMult;
        filter.frequency.setValueAtTime(start, playTime);
        filter.frequency.linearRampToValueAtTime(peak, playTime + duration * 0.6); // Swell
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
        // Swell for pads
        const cutoff = (feel === 'Neo-Soul') ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
        filter.frequency.setValueAtTime(cutoff, playTime);
        filter.frequency.exponentialRampToValueAtTime(cutoff * 1.2, playTime + duration * 0.5);
        filter.frequency.exponentialRampToValueAtTime(cutoff, playTime + duration);
        filter.Q.setValueAtTime(1 + intensity, playTime);
    }

    // Amplitude Envelope
    const baseAttack = style === 'stabs' ? 0.01 : 0.2;
    const attack = Math.max(0.005, baseAttack - (finalVol * 0.15));
    const release = style === 'stabs' ? 0.1 : 0.5;
    
    const detuneMult = 1.0 + (finalVol * 0.5);
    osc2.detune.setValueAtTime((style === 'stabs' ? 12 : 8) * detuneMult, playTime);

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    osc1.connect(filter);
    osc2.connect(filter);
    if (sub) sub.connect(filter);
    filter.connect(gain);
    
    if (panner) {
        gain.connect(panner);
        panner.connect(ctx.harmoniesGain);
    } else {
        gain.connect(ctx.harmoniesGain);
    }

    // Register active voice
    hb.activeVoices.push({ gain, time: playTime, duration, midi });

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) sub.start(playTime);
    
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) sub.stop(stopTime);
    if (lfo) lfo.stop(stopTime);

    osc1.onended = () => safeDisconnect([gain, filter, osc1, osc2, sub, lfo, lfoGain, panner]);
}
