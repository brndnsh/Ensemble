import { ctx, gb, cb, bb, sb, midi } from './state.js';
import { ui, triggerFlash } from './ui.js';
import { MIXER_GAIN_MULTIPLIERS } from './config.js';
import { safeDisconnect, createReverbImpulse, createSoftClipCurve } from './utils.js';

// Facade: Re-export synthesis logic from specialized modules
import { playNote, playChordScratch, updateSustain, killAllPianoNotes, INSTRUMENT_PRESETS } from './synth-chords.js';
import { playBassNote, killBassNote } from './synth-bass.js';
import { playSoloNote, killSoloistNote } from './synth-soloist.js';
import { playDrumSound, killDrumNote } from './synth-drums.js';

export { playNote, playChordScratch, updateSustain, killAllPianoNotes, INSTRUMENT_PRESETS };
export { playBassNote, killBassNote };
export { playSoloNote, killSoloistNote };
export { playDrumSound, killDrumNote };

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 */
export function initAudio() {
    if (!ctx.audio || ctx.audio.state === 'closed') {
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }

        ctx.audio = new (window.AudioContext || window.webkitAudioContext)();

        ctx.audio.onstatechange = () => {
            console.log(`[DSP] AudioContext state changed to: ${ctx.audio.state}`);
            if (ctx.audio.state === 'suspended' && ctx.isPlaying) {
                console.log("[DSP] Unexpected suspension. Attempting auto-resume...");
                ctx.audio.resume().catch(e => console.error("[DSP] Auto-resume failed:", e));
            }
        };

        ctx.masterGain = ctx.audio.createGain();
        const initMasterVol = parseFloat(ui.masterVol.value) || 0.5;
        ctx.masterGain.gain.setValueAtTime(0.0001, ctx.audio.currentTime);
        ctx.masterGain.gain.exponentialRampToValueAtTime(initMasterVol, ctx.audio.currentTime + 0.04);
        
        ctx.saturator = ctx.audio.createWaveShaper();
        ctx.saturator.curve = createSoftClipCurve();
        ctx.saturator.oversample = '4x';

        ctx.masterLimiter = ctx.audio.createDynamicsCompressor();
        ctx.masterLimiter.threshold.setValueAtTime(-1.5, ctx.audio.currentTime);
        ctx.masterLimiter.knee.setValueAtTime(30, ctx.audio.currentTime);
        ctx.masterLimiter.ratio.setValueAtTime(20, ctx.audio.currentTime);
        ctx.masterLimiter.attack.setValueAtTime(0.002, ctx.audio.currentTime); 
        ctx.masterLimiter.release.setValueAtTime(0.5, ctx.audio.currentTime); 
        
        ctx.masterGain.connect(ctx.saturator);
        ctx.saturator.connect(ctx.masterLimiter);
        ctx.masterLimiter.connect(ctx.audio.destination);

        ctx.reverbNode = ctx.audio.createConvolver();
        ctx.reverbNode.buffer = createReverbImpulse(ctx.audio, 1.5, 3.0);
        ctx.reverbNode.connect(ctx.masterGain);

        const modules = [
            { name: 'chords', state: cb, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: 'bass', state: bb, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: 'soloist', state: sb, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: 'drums', state: gb, mult: MIXER_GAIN_MULTIPLIERS.drums }
        ];

        modules.forEach(m => {
            const gainNode = ctx.audio.createGain();
            const isLocalMuted = midi.enabled && midi.muteLocal;
            const targetGain = (m.state.enabled && !isLocalMuted) ? Math.max(0.0001, m.state.volume * m.mult) : 0.0001;
            gainNode.gain.setValueAtTime(0.0001, ctx.audio.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(targetGain, ctx.audio.currentTime + 0.04);
            
            if (m.name === 'chords') {
                const hp = ctx.audio.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.setValueAtTime(180, ctx.audio.currentTime); 
                const notch = ctx.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.setValueAtTime(2500, ctx.audio.currentTime);
                notch.Q.setValueAtTime(0.7, ctx.audio.currentTime);
                notch.gain.setValueAtTime(-4, ctx.audio.currentTime); 
                gainNode.connect(hp); hp.connect(notch); notch.connect(ctx.masterGain);
                ctx.chordsEQ = hp;
            } else if (m.name === 'bass') {
                const weight = ctx.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.setValueAtTime(100, ctx.audio.currentTime);
                weight.gain.setValueAtTime(2, ctx.audio.currentTime);
                const scoop = ctx.audio.createBiquadFilter();
                scoop.type = 'peaking';
                scoop.frequency.setValueAtTime(500, ctx.audio.currentTime);
                scoop.Q.setValueAtTime(0.8, ctx.audio.currentTime);
                scoop.gain.setValueAtTime(-10, ctx.audio.currentTime);
                const definition = ctx.audio.createBiquadFilter();
                definition.type = 'peaking';
                definition.frequency.setValueAtTime(2500, ctx.audio.currentTime);
                definition.Q.setValueAtTime(1.2, ctx.audio.currentTime);
                definition.gain.setValueAtTime(3, ctx.audio.currentTime);

                const comp = ctx.audio.createDynamicsCompressor();
                comp.threshold.setValueAtTime(-16, ctx.audio.currentTime);
                comp.knee.setValueAtTime(12, ctx.audio.currentTime);
                comp.ratio.setValueAtTime(4, ctx.audio.currentTime);
                comp.attack.setValueAtTime(0.005, ctx.audio.currentTime);
                comp.release.setValueAtTime(0.125, ctx.audio.currentTime);

                gainNode.connect(weight); 
                weight.connect(scoop); 
                scoop.connect(definition); 
                definition.connect(comp);
                comp.connect(ctx.masterGain);
                ctx.bassEQ = weight; 
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

export function killChordBus() {
    if (ctx.chordsGain) {
        ctx.chordsGain.gain.cancelScheduledValues(ctx.audio.currentTime);
        ctx.chordsGain.gain.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
    }
}

export function killBassBus() {
    if (ctx.bassGain) {
        ctx.bassGain.gain.cancelScheduledValues(ctx.audio.currentTime);
        ctx.bassGain.gain.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
    }
}

export function killSoloistBus() {
    if (ctx.soloistGain) {
        ctx.soloistGain.gain.cancelScheduledValues(ctx.audio.currentTime);
        ctx.soloistGain.gain.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
    }
}

export function killDrumBus() {
    if (ctx.drumsGain) {
        ctx.drumsGain.gain.cancelScheduledValues(ctx.audio.currentTime);
        ctx.drumsGain.gain.setTargetAtTime(0, ctx.audio.currentTime, 0.005);
    }
}

export async function killAllNotes() {
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killDrumNote();
    
    killChordBus();
    killBassBus();
    killSoloistBus();
    killDrumBus();

    try {
        const { panic } = await import('./midi-controller.js');
        panic();
    } catch (e) {}
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
            const isLocalMuted = midi.enabled && midi.muteLocal;
            const target = (m.state.enabled && !isLocalMuted) ? (m.state.volume * m.mult) : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
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
