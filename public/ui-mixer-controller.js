import { ui as globalUI } from './ui.js';
import { playback, chords, bass, soloist, harmony, groove } from './state.js';
import { saveCurrentState } from './persistence.js';
import { MIXER_GAIN_MULTIPLIERS } from './config.js';

/**
 * Domain-specific UI registry for the Mixer.
 */
const ui = {
    get chordVol() { return globalUI.chordVol; },
    get bassVol() { return globalUI.bassVol; },
    get soloistVol() { return globalUI.soloistVol; },
    get harmonyVol() { return globalUI.harmonyVol; },
    get drumVol() { return globalUI.drumVol; },
    get masterVol() { return globalUI.masterVol; },
    get chordReverb() { return globalUI.chordReverb; },
    get bassReverb() { return globalUI.bassReverb; },
    get soloistReverb() { return globalUI.soloistReverb; },
    get harmonyReverb() { return globalUI.harmonyReverb; },
    get drumReverb() { return globalUI.drumReverb; }
};

/**
 * Initializes event handlers for mixer controls (Volume, Reverb).
 */
export function initMixerHandlers() {
    // 1. Volume Sliders
    const volumeNodes = [
        { el: ui.chordVol, state: chords, gain: 'chordsGain', mult: MIXER_GAIN_MULTIPLIERS.chords },
        { el: ui.bassVol, state: bass, gain: 'bassGain', mult: MIXER_GAIN_MULTIPLIERS.bass },
        { el: ui.soloistVol, state: soloist, gain: 'soloistGain', mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { el: ui.harmonyVol, state: harmony, gain: 'harmoniesGain', mult: MIXER_GAIN_MULTIPLIERS.harmonies },
        { el: ui.drumVol, state: groove, gain: 'drumsGain', mult: MIXER_GAIN_MULTIPLIERS.drums },
        { el: ui.masterVol, state: playback, gain: 'masterGain', mult: MIXER_GAIN_MULTIPLIERS.master }
    ];

    volumeNodes.forEach(({ el, state, gain, mult }) => {
        if (!el) return;
        el.addEventListener('input', e => {
            const val = parseFloat(e.target.value);
            if (state !== playback) state.volume = val;
            
            // Update Audio Node
            if (playback[gain] && playback.audio) {
                const target = Math.max(0.0001, val * mult);
                // Ramp to avoid clicks
                playback[gain].gain.cancelScheduledValues(playback.audio.currentTime);
                playback[gain].gain.setValueAtTime(playback[gain].gain.value, playback.audio.currentTime);
                playback[gain].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    // 2. Reverb Sliders
    const reverbNodes = [
        { el: ui.chordReverb, state: chords, gain: 'chordsReverb' },
        { el: ui.bassReverb, state: bass, gain: 'bassReverb' },
        { el: ui.soloistReverb, state: soloist, gain: 'soloistReverb' },
        { el: ui.harmonyReverb, state: harmony, gain: 'harmoniesReverb' },
        { el: ui.drumReverb, state: groove, gain: 'drumsReverb' }
    ];

    reverbNodes.forEach(({ el, state, gain }) => {
        if (!el) return;
        el.addEventListener('input', e => {
            state.reverb = parseFloat(e.target.value);
            
            // Update Audio Node
            if (playback[gain] && playback.audio) {
                const target = Math.max(0.0001, state.reverb);
                playback[gain].gain.cancelScheduledValues(playback.audio.currentTime);
                playback[gain].gain.setValueAtTime(playback[gain].gain.value, playback.audio.currentTime);
                playback[gain].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });
}
