import { ctx, sb } from './state.js';
import { safeDisconnect } from './utils.js';

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
