import { h } from 'preact';
import { useEnsembleState } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { dispatch, playback } from '../state.js'; // playback needed for audio access
import { saveCurrentState } from '../persistence.js';
import { applyTheme } from '../app-controller.js';
import { initMIDI, panic } from '../midi-controller.js';
import { restoreGains } from '../engine.js';
import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { showToast } from '../ui.js';

export function Settings() {
    const { 
        theme, masterVolume, countIn, metronome, visualFlash, haptic, sessionTimer,
        midiEnabled, midiMuteLocal, midiSelectedOutputId, midiOutputs,
        midiChannels, midiOctaves, midiLatency, midiVelocity
    } = useEnsembleState(state => ({
        theme: state.playback.theme,
        masterVolume: state.playback.masterVolume, // Note: State doesn't explicitly track masterVolume in playback object in some versions, but let's assume it does or we read from gain. 
        // Wait, ui-mixer-controller.js said: `state !== playback`. So playback HAS volume.
        countIn: state.playback.countIn, // Assuming exist
        metronome: state.playback.metronome, // Assuming exist
        visualFlash: state.playback.visualFlash, // Assuming exist
        haptic: state.playback.haptic,
        sessionTimer: state.playback.sessionTimer,
        
        midiEnabled: state.midi.enabled,
        midiMuteLocal: state.midi.muteLocal,
        midiSelectedOutputId: state.midi.selectedOutputId,
        midiOutputs: state.midi.outputs,
        midiChannels: {
            chords: state.midi.chordsChannel,
            bass: state.midi.bassChannel,
            soloist: state.midi.soloistChannel,
            harmony: state.midi.harmonyChannel,
            drums: state.midi.drumsChannel
        },
        midiOctaves: {
            chords: state.midi.chordsOctave,
            bass: state.midi.bassOctave,
            soloist: state.midi.soloistOctave,
            harmony: state.midi.harmonyOctave,
            drums: state.midi.drumsOctave
        },
        midiLatency: state.midi.latency,
        midiVelocity: state.midi.velocitySensitivity
    }));
    
    // We need to fetch 'masterVolume' if it's not in state. 
    // In `ui-mixer-controller.js`: `el: ui.masterVol, state: playback`.
    // So playback.volume IS master volume?
    // Let's check `state.js`.
    // `playback` export usually has `isPlaying`, `bpm`. 
    // `ui-mixer-controller` sets `playback.volume`. 
    // So yes, `state.playback.volume` is master volume.
    const actualMasterVolume = useEnsembleState(s => s.playback.volume);

    const closeSettings = () => {
        const overlay = document.getElementById('settingsOverlay');
        if (overlay) overlay.classList.remove('active');
    };

    const handleMasterVolume = (e) => {
        const val = parseFloat(e.target.value);
        playback.volume = val;
        
        if (playback.masterGain && playback.audio) {
            const target = Math.max(0.0001, val * MIXER_GAIN_MULTIPLIERS.master);
            playback.masterGain.gain.cancelScheduledValues(playback.audio.currentTime);
            playback.masterGain.gain.setValueAtTime(playback.masterGain.gain.value, playback.audio.currentTime);
            playback.masterGain.gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
        }
        saveCurrentState();
    };

    const handleMidiEnable = async (e) => {
        const enabled = e.target.checked;
        if (enabled) {
            const success = await initMIDI();
            if (!success) {
                showToast("MIDI Access Denied or Not Supported");
                return; // Checkbox will revert on re-render if state didn't change
            }
        } else {
            panic();
        }
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
        restoreGains();
        saveCurrentState();
    };

    return (
        <div class="settings-content">
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                <h2>Settings</h2>
                <button 
                    id="closeSettingsBtn" 
                    style="background: none; border: none; font-size: 1.5rem;" 
                    aria-label="Close Settings"
                    onClick={closeSettings}
                >&times;</button>
            </div>
            
            <div class="settings-controls">
                {/* Appearance Section */}
                <div class="settings-section">
                    <h3>Appearance</h3>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Theme</label>
                        <select 
                            value={theme} 
                            onChange={(e) => {
                                applyTheme(e.target.value);
                                saveCurrentState();
                            }}
                            aria-label="Select Theme"
                        >
                            <option value="auto">Auto (System Default)</option>
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                        </select>
                    </div>
                </div>

                {/* Playback & Performance Section */}
                <div class="settings-section">
                    <h3>Playback & Performance</h3>
                    <div class="setting-item" style="margin-bottom: 1.5rem;">
                        <label class="setting-label">
                            <span>Master Volume</span>
                        </label>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05" 
                            value={actualMasterVolume || 0.5} 
                            onInput={handleMasterVolume}
                            style="width: 100%;" 
                            aria-label="Master Volume"
                        />
                    </div>

                    <div style="margin-bottom: 1.5rem; display: flex; gap: 1.5rem; flex-wrap: wrap;">
                         <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" checked={haptic} onChange={(e) => {
                                dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'haptic', value: e.target.checked });
                                saveCurrentState();
                            }} />
                            <span>Haptic Feedback</span>
                        </label>
                    </div>

                    <div class="performance-ending-section" style="background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 8px;">
                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500;">
                                <input 
                                    type="checkbox" 
                                    checked={sessionTimer > 0} 
                                    onChange={(e) => {
                                        const val = e.target.checked ? 5 : 0;
                                        dispatch(ACTIONS.SET_SESSION_TIMER, val);
                                        saveCurrentState();
                                    }}
                                />
                                <span>Session Timer</span>
                            </label>
                            
                            <div style={{
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5rem', 
                                opacity: sessionTimer > 0 ? '1' : '0.4', 
                                pointerEvents: sessionTimer > 0 ? 'auto' : 'none',
                                transition: 'all 0.2s ease'
                            }}>
                                <div class="stepper-control" style={{
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    background: 'var(--input-bg)', 
                                    border: '1px solid var(--border-color)', 
                                    borderRadius: '8px', 
                                    overflow: 'hidden',
                                    borderColor: sessionTimer > 0 ? 'var(--accent-color)' : 'var(--border-color)',
                                    backgroundColor: sessionTimer > 0 ? 'var(--card-bg)' : 'var(--input-bg)'
                                }}>
                                    <button 
                                        class="stepper-btn" 
                                        style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                                        onClick={() => {
                                            const next = Math.max(1, sessionTimer - 1);
                                            dispatch(ACTIONS.SET_SESSION_TIMER, next);
                                            saveCurrentState();
                                        }}
                                    >-</button>
                                    <input 
                                        type="number" 
                                        value={sessionTimer > 0 ? sessionTimer : 5} 
                                        readonly 
                                        style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
                                    />
                                    <button 
                                        class="stepper-btn" 
                                        style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                                        onClick={() => {
                                            const next = Math.min(20, sessionTimer + 1);
                                            dispatch(ACTIONS.SET_SESSION_TIMER, next);
                                            saveCurrentState();
                                        }}
                                    >+</button>
                                </div>
                                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">Minutes</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* External Section (MIDI) */}
                <div class="settings-section">
                    <h3>External (MIDI Output)</h3>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input 
                                type="checkbox" 
                                checked={midiEnabled} 
                                onChange={handleMidiEnable}
                            />
                            <span>Enable Web MIDI Output</span>
                        </label>
                    </div>

                    <div style={{
                        opacity: midiEnabled ? '1' : '0.5', 
                        pointerEvents: midiEnabled ? 'auto' : 'none', 
                        transition: 'opacity 0.2s'
                    }}>
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input 
                                    type="checkbox" 
                                    checked={midiMuteLocal} 
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_MIDI_CONFIG, { muteLocal: e.target.checked });
                                        restoreGains();
                                        saveCurrentState();
                                    }}
                                />
                                <span>Mute Browser Audio</span>
                            </label>
                        </div>

                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Output Port</label>
                            <select 
                                value={midiSelectedOutputId || ''} 
                                onChange={(e) => {
                                    dispatch(ACTIONS.SET_MIDI_CONFIG, { selectedOutputId: e.target.value });
                                    saveCurrentState();
                                }}
                                style="width: 100%;"
                            >
                                {midiOutputs && midiOutputs.length > 0 ? 
                                    midiOutputs.map(out => <option value={out.id}>{out.name}</option>) : 
                                    <option value="">No outputs found</option>
                                }
                            </select>
                        </div>

                        {/* MIDI Channels */}
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                            {['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'].map(ch => (
                                <div class="midi-ch-group">
                                    <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">{ch}</label>
                                    <div style="display: flex; gap: 0.25rem;">
                                        <input 
                                            type="number" 
                                            min="1" max="16" 
                                            value={midiChannels[ch.toLowerCase()]} 
                                            onChange={(e) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Channel`]: parseInt(e.target.value) });
                                                saveCurrentState();
                                            }}
                                            style="width: 50%;" 
                                            title="Channel" 
                                        />
                                        <input 
                                            type="number" 
                                            min="-2" max="2" 
                                            value={midiOctaves[ch.toLowerCase()]} 
                                            onChange={(e) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Octave`]: parseInt(e.target.value) });
                                                saveCurrentState();
                                            }}
                                            style="width: 50%;" 
                                            title="Octave Offset" 
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
