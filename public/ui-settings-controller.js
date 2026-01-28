import { ui as globalUI, showToast } from './ui.js';
import { playback, midi as midiState, dispatch, subscribe } from './state.js';
import { ACTIONS } from './types.js';
import { saveCurrentState } from './persistence.js';
import { applyTheme } from './app-controller.js';
import { initMIDI, panic } from './midi-controller.js';
import { restoreGains } from './engine.js';

/**
 * Domain-specific UI registry for Settings.
 */
const ui = {
    get themeSelect() { return globalUI.themeSelect; },
    get haptic() { return globalUI.haptic; },
    get applyPresetSettings() { return globalUI.applyPresetSettings; },
    get sessionTimerCheck() { return globalUI.sessionTimerCheck; },
    get sessionTimerInput() { return globalUI.sessionTimerInput; },
    get sessionTimerDurationContainer() { return globalUI.sessionTimerDurationContainer; },
    get sessionTimerStepper() { return globalUI.sessionTimerStepper; },
    get sessionTimerDec() { return globalUI.sessionTimerDec; },
    get sessionTimerInc() { return globalUI.sessionTimerInc; },
    get midiEnableCheck() { return globalUI.midiEnableCheck; },
    get midiMuteLocalCheck() { return globalUI.midiMuteLocalCheck; },
    get midiOutputSelect() { return globalUI.midiOutputSelect; },
    get midiLatencySlider() { return globalUI.midiLatencySlider; },
    get midiLatencyValue() { return globalUI.midiLatencyValue; },
    get midiVelocitySlider() { return globalUI.midiVelocitySlider; },
    get midiVelocityValue() { return globalUI.midiVelocityValue; },
    get midiControls() { return globalUI.midiControls; },
    // Helper for dynamic channels
    get midiChordsChannel() { return globalUI.midiChordsChannel; },
    get midiBassChannel() { return globalUI.midiBassChannel; },
    get midiSoloistChannel() { return globalUI.midiSoloistChannel; },
    get midiHarmonyChannel() { return globalUI.midiHarmonyChannel; },
    get midiDrumsChannel() { return globalUI.midiDrumsChannel; },
    get midiChordsOctave() { return globalUI.midiChordsOctave; },
    get midiBassOctave() { return globalUI.midiBassOctave; },
    get midiSoloistOctave() { return globalUI.midiSoloistOctave; },
    get midiHarmonyOctave() { return globalUI.midiHarmonyOctave; },
    get midiDrumsOctave() { return globalUI.midiDrumsOctave; },
    // Indexer for bulk iteration
    get(id) { return globalUI[id]; }
};

/**
 * Initializes general settings handlers (Theme, Timer, Haptic).
 */
export function initSettingsHandlers() {
    // 1. Theme
    if (ui.themeSelect) {
        ui.themeSelect.addEventListener('change', e => {
            applyTheme(e.target.value);
            saveCurrentState();
        });
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (playback.theme === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    // 2. Haptic
    if (ui.haptic) {
        ui.haptic.addEventListener('change', () => {
            dispatch(ACTIONS.SET_PARAM, { module: 'ctx', param: 'haptic', value: ui.haptic.checked });
        });
    }

    // 3. Preset Settings Override
    if (ui.applyPresetSettings) {
        ui.applyPresetSettings.addEventListener('change', () => {
            dispatch(ACTIONS.SET_PRESET_SETTINGS_MODE, ui.applyPresetSettings.checked);
        });
    }

    // 4. Session Timer
    if (ui.sessionTimerCheck && ui.sessionTimerInput) {
        const updateTimerUI = (isChecked) => {
            if (ui.sessionTimerDurationContainer) {
                ui.sessionTimerDurationContainer.style.opacity = isChecked ? '1' : '0.4';
                ui.sessionTimerDurationContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
            }
            if (ui.sessionTimerStepper) {
                ui.sessionTimerStepper.style.borderColor = isChecked ? 'var(--accent-color)' : 'var(--border-color)';
                ui.sessionTimerStepper.style.backgroundColor = isChecked ? 'var(--card-bg)' : 'var(--input-bg)';
            }
        };

        // Sync initial UI from potentially hydrated state
        ui.sessionTimerCheck.checked = playback.sessionTimer > 0;
        ui.sessionTimerInput.value = playback.sessionTimer > 0 ? playback.sessionTimer : 5;
        updateTimerUI(playback.sessionTimer > 0);

        ui.sessionTimerCheck.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const duration = isChecked ? parseFloat(ui.sessionTimerInput.value) : 0;
            updateTimerUI(isChecked);
            dispatch(ACTIONS.SET_SESSION_TIMER, duration);
            saveCurrentState();
        });

        ui.sessionTimerInput.addEventListener('change', (e) => {
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, parseFloat(e.target.value));
                saveCurrentState();
            }
        });

        const adjustTimer = (delta) => {
            const current = parseInt(ui.sessionTimerInput.value);
            const next = Math.max(1, Math.min(20, current + delta));
            ui.sessionTimerInput.value = next;
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, next);
                saveCurrentState();
            }
        };

        if (ui.sessionTimerDec) ui.sessionTimerDec.addEventListener('click', () => adjustTimer(-1));
        if (ui.sessionTimerInc) ui.sessionTimerInc.addEventListener('click', () => adjustTimer(1));
    }
}

/**
 * Initializes MIDI settings and event handlers.
 */
export function setupMIDIHandlers() {
    if (!ui.midiEnableCheck) return;

    ui.midiEnableCheck.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (enabled) {
            const success = await initMIDI();
            if (!success) {
                ui.midiEnableCheck.checked = false;
                showToast("MIDI Access Denied or Not Supported");
                return;
            }
        } else {
            panic();
        }
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
        updateMIDIControlsUI(enabled);
        restoreGains();
        saveCurrentState();
    });

    if (ui.midiMuteLocalCheck) {
        ui.midiMuteLocalCheck.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_MIDI_CONFIG, { muteLocal: e.target.checked });
            restoreGains();
            saveCurrentState();
        });
    }

    ui.midiOutputSelect.addEventListener('change', (e) => {
        dispatch(ACTIONS.SET_MIDI_CONFIG, { selectedOutputId: e.target.value });
        saveCurrentState();
    });

    const channels = ['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'];
    channels.forEach(ch => {
        const el = ui.get(`midi${ch}Channel`);
        if (el) {
            el.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Channel`]: val });
                saveCurrentState();
            });
        }
        
        const octEl = ui.get(`midi${ch}Octave`);
        if (octEl) {
            octEl.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Octave`]: val });
                saveCurrentState();
            });
        }
    });

    if (ui.midiLatencySlider) {
        ui.midiLatencySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_MIDI_CONFIG, { latency: val });
            if (ui.midiLatencyValue) ui.midiLatencyValue.textContent = `${val > 0 ? '+' : ''}${val}ms`;
        });
        ui.midiLatencySlider.addEventListener('change', () => saveCurrentState());
    }

    if (ui.midiVelocitySlider) {
        ui.midiVelocitySlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            dispatch(ACTIONS.SET_MIDI_CONFIG, { velocitySensitivity: val });
            if (ui.midiVelocityValue) ui.midiVelocityValue.textContent = val.toFixed(1);
        });
        ui.midiVelocitySlider.addEventListener('change', () => saveCurrentState());
    }

    // Hydrate UI from State
    ui.midiEnableCheck.checked = midiState.enabled;
    if (ui.midiChordsChannel) ui.midiChordsChannel.value = midiState.chordsChannel;
    if (ui.midiBassChannel) ui.midiBassChannel.value = midiState.bassChannel;
    if (ui.midiSoloistChannel) ui.midiSoloistChannel.value = midiState.soloistChannel;
    if (ui.midiHarmonyChannel) ui.midiHarmonyChannel.value = midiState.harmonyChannel;
    if (ui.midiDrumsChannel) ui.midiDrumsChannel.value = midiState.drumsChannel;
    if (ui.midiChordsOctave) ui.midiChordsOctave.value = midiState.chordsOctave;
    if (ui.midiBassOctave) ui.midiBassOctave.value = midiState.bassOctave;
    if (ui.midiSoloistOctave) ui.midiSoloistOctave.value = midiState.soloistOctave;
    if (ui.midiHarmonyOctave) ui.midiHarmonyOctave.value = midiState.harmonyOctave;
    if (ui.midiDrumsOctave) ui.midiDrumsOctave.value = midiState.drumsOctave;
    if (ui.midiVelocitySlider) ui.midiVelocitySlider.value = midiState.velocitySensitivity || 1.0;
    if (ui.midiVelocityValue) ui.midiVelocityValue.textContent = (midiState.velocitySensitivity || 1.0).toFixed(1);
    if (ui.midiLatencySlider) ui.midiLatencySlider.value = midiState.latency;
    if (ui.midiLatencyValue) ui.midiLatencyValue.textContent = `${midiState.latency > 0 ? '+' : ''}${midiState.latency}ms`;
    
    updateMIDIControlsUI(midiState.enabled);
    renderMIDIOutputs();

    // Subscribe to state changes for MIDI output list updates
    subscribe((action, payload) => {
        if (action === ACTIONS.SET_MIDI_CONFIG && payload.outputs) {
            renderMIDIOutputs();
        }
    });
}

function updateMIDIControlsUI(enabled) {
    if (!ui.midiControls) return;
    ui.midiControls.style.opacity = enabled ? '1' : '0.5';
    ui.midiControls.style.pointerEvents = enabled ? 'auto' : 'none';
}

function renderMIDIOutputs() {
    if (!ui.midiOutputSelect) return;
    const select = ui.midiOutputSelect;
    const currentId = midiState.selectedOutputId;
    
    select.innerHTML = midiState.outputs.length > 0 ? '' : '<option value="">No outputs found</option>';
    
    midiState.outputs.forEach(out => {
        const opt = document.createElement('option');
        opt.value = out.id;
        opt.textContent = out.name;
        if (out.id === currentId) opt.selected = true;
        select.appendChild(opt);
    });

    if (!currentId && midiState.outputs.length > 0) {
        dispatch(ACTIONS.SET_MIDI_CONFIG, { selectedOutputId: midiState.outputs[0].id });
    }
}
