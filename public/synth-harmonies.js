import { ctx, hb } from './state.js';
import { safeDisconnect } from './utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (hb).
 * Optimized for Horns (stabs) and Strings (pads).
 */

export function killHarmonyNote() {
    if (hb.activeVoices && hb.activeVoices.length > 0) {
        hb.activeVoices.forEach(voice => {
            try {
                const g = voice.gain.gain;
                g.cancelScheduledValues(ctx.audio.currentTime);
                g.setTargetAtTime(0, ctx.audio.currentTime, 0.01);
            } catch { /* ignore error */ }
        });
        hb.activeVoices = [];
    }
}

/**
 * Plays a harmony note with genre-specific synthesis.
 */
export function playHarmonyNote(freq, time, duration, vol = 0.4, style = 'stabs') {
    if (!Number.isFinite(freq) || !ctx.audio) return;
    
    const now = ctx.audio.currentTime;
    const playTime = Math.max(time, now);

    if (!hb.activeVoices) hb.activeVoices = [];
    
    // Voice Management (Polyphonic Limit: 6)
    hb.activeVoices = hb.activeVoices.filter(v => (v.time + v.duration + 0.5) > playTime);
    if (hb.activeVoices.length >= 6) {
        const oldest = hb.activeVoices.shift();
        if (oldest) {
            oldest.gain.gain.cancelScheduledValues(playTime);
            oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
        }
    }

    const gain = ctx.audio.createGain();
    gain.gain.value = 0;
    hb.activeVoices.push({ gain, time: playTime, duration });

    // Synthesis: Multi-oscillator setup for "Ensemble" feel
    const osc1 = ctx.audio.createOscillator();
    const osc2 = ctx.audio.createOscillator();
    const sub = ctx.audio.createOscillator();
    
    if (style === 'stabs') {
        // Horn-like: Bright Sawtooth with sharp envelope
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(12, playTime); // Brass-like chorusing
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(freq * 0.5, playTime); // Sub-octave for body
    } else {
        // String-like: Smooth Triangles/Saws with slow attack
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        sub.type = 'sine';
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
    }
    
    osc1.frequency.setValueAtTime(freq, playTime);
    osc2.frequency.setValueAtTime(freq, playTime);

    // Filter Envelope (VITAL for Horn stabs)
    const filter = ctx.audio.createBiquadFilter();
    filter.type = 'lowpass';
    
    if (style === 'stabs') {
        const startFreq = Math.min(freq * 8, 8000);
        filter.frequency.setValueAtTime(startFreq, playTime);
        filter.frequency.exponentialRampToValueAtTime(freq * 2, playTime + 0.1);
        filter.Q.setValueAtTime(3, playTime);
    } else {
        filter.frequency.setValueAtTime(freq * 3, playTime);
        filter.frequency.exponentialRampToValueAtTime(freq * 2, playTime + duration);
        filter.Q.setValueAtTime(1, playTime);
    }

    // Amplitude Envelope
    const attack = style === 'stabs' ? 0.01 : 0.2;
    const release = style === 'stabs' ? 0.1 : 0.5;
    
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(vol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    osc1.connect(filter);
    osc2.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.harmoniesGain);

    osc1.start(playTime);
    osc2.start(playTime);
    sub.start(playTime);
    
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    sub.stop(stopTime);

    osc1.onended = () => safeDisconnect([gain, filter, osc1, osc2, sub]);
}
