import { ctx, bb, gb } from './state.js';
import { safeDisconnect } from './utils.js';

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
        mainFilter.frequency.setTargetAtTime(isPop ? 800 : 500, startTime + 0.02, duration * 0.5);

        // Slap/Pop Resonant Peak
        const popPeak = ctx.audio.createBiquadFilter();
        popPeak.type = 'peaking';
        popPeak.frequency.value = 1800; // Lowered from 2200 to reduce quack
        popPeak.Q.value = 1.5; // Lowered from 2.5 for smoother resonance
        popPeak.gain.value = isPop ? 5 : 0; // Lowered from 7
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
