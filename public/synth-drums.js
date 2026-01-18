import { ctx, gb } from './state.js';
import { safeDisconnect } from './utils.js';

export function killDrumNote() {
    if (gb.lastHatGain) {
        try {
            const g = gb.lastHatGain.gain;
            g.cancelScheduledValues(ctx.audio.currentTime);
            g.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
        } catch { /* ignore error */ }
        gb.lastHatGain = null;
    }
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
                g.setTargetAtTime(0, playTime, 0.005);
            } catch { /* ignore error */ }
        }

        // 2. Pre-render / Cache the Metallic Buffer (Lazy Load)
        if (!gb.audioBuffers.hihatMetal) {
            gb.audioBuffers.hihatMetal = createMetallicBuffer(ctx.audio);
        }

        // 3. Playback with variation
        const source = ctx.audio.createBufferSource();
        source.buffer = gb.audioBuffers.hihatMetal;
        // Re-introduce the random pitch variation using playbackRate
        source.playbackRate.value = rr(0.05); 

        // 4. Tone Shaping
        const bpFilter = ctx.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(10000, playTime);
        bpFilter.Q.value = 1.0;

        const hpFilter = ctx.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(7000, playTime);

        // 5. Envelope & Gain
        const gain = ctx.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);
        
        if (isOpen) {
            gain.gain.setTargetAtTime(vol, playTime, 0.015);
            gain.gain.setTargetAtTime(0, playTime + 0.02, 0.35 * rr());
        } else {
            gain.gain.setTargetAtTime(vol, playTime, 0.002);
            gain.gain.setTargetAtTime(0, playTime + 0.005, 0.05 * rr());
        }

        gb.lastHatGain = gain;

        // Connections: Source -> BP -> HP -> Gain -> Master
        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(ctx.drumsGain);

        source.start(playTime);
        source.stop(playTime + (isOpen ? 2.0 : 0.4));

        source.onended = () => {
            if (gb.lastHatGain === gain) gb.lastHatGain = null;
            safeDisconnect([source, bpFilter, hpFilter, gain]);
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

/**
 * Generates a 2-second buffer of the metallic oscillator stack.
 * Used for HiHats to avoid creating 6 oscillators per hit.
 */
function createMetallicBuffer(audioCtx) {
    const duration = 2.0;
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    
    // TR-808 Ratios
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const baseFreq = 40; // Fixed base frequency

    for (let i = 0; i < length; i++) {
        let sample = 0;
        const t = i / sampleRate;
        for (const r of ratios) {
            const freq = baseFreq * r;
            // Square wave approximation
            const phase = (t * freq) % 1;
            sample += (phase < 0.5 ? 1 : -1);
        }
        data[i] = sample / ratios.length; // Normalize
    }
    return buffer;
}