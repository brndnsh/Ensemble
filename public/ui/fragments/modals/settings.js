export const settingsModalHtml = `
<div id="settingsOverlay" class="settings-overlay">
    <div class="settings-content">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
            <h2>Settings</h2>
            <button id="closeSettingsBtn" style="background: none; border: none; font-size: 1.5rem;" aria-label="Close Settings">&times;</button>
        </div>
        
        <div class="settings-controls">
            <!-- Appearance Section -->
            <div class="settings-section">
                <h3>Appearance</h3>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Theme</label>
                    <select id="themeSelect" aria-label="Select Theme">
                        <option value="auto">Auto (System Default)</option>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                    </select>
                </div>

                <div style="margin-bottom: 0;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Chord Notation</label>
                    <select id="notationSelect" aria-label="Chord Notation">
                        <option value="roman">Roman Numerals (I, vi, IV)</option>
                        <option value="name">Chord Names (C, Am, F)</option>
                        <option value="nns">Nashville Numbers (1, 6-, 4)</option>
                    </select>
                </div>
            </div>

            <!-- Playback & Performance Section -->
            <div class="settings-section">
                <h3>Playback & Performance</h3>
                <div class="setting-item" style="margin-bottom: 1.5rem;">
                    <label class="setting-label">
                        <span>Master Volume</span>
                    </label>
                    <input type="range" id="masterVolume" min="0" max="1" step="0.05" value="0.5" style="width: 100%;" aria-label="Master Volume">
                </div>

                <div style="margin-bottom: 1.5rem; display: flex; gap: 1.5rem; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="countInCheck" checked>
                        <span>Count-in</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="metronomeCheck">
                        <span>Metronome</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="visualFlashCheck">
                        <span>Visual Flash</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="hapticCheck">
                        <span>Haptic Feedback</span>
                    </label>
                </div>

                <div class="performance-ending-section" style="background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500;">
                            <input type="checkbox" id="sessionTimerCheck">
                            <span>Session Timer</span>
                        </label>
                        <div id="sessionTimerDurationContainer" style="display: flex; align-items: center; gap: 0.5rem; opacity: 0.5; pointer-events: none; transition: all 0.2s ease;">
                             <div id="sessionTimerStepper" class="stepper-control" style="display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                                <button id="sessionTimerDec" aria-label="Decrease Session Timer" class="stepper-btn" style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;">-</button>
                                <input type="number" id="sessionTimerInput" value="5" min="1" max="20" readonly style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;">
                                <button id="sessionTimerInc" aria-label="Increase Session Timer" class="stepper-btn" style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;">+</button>
                             </div>
                             <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">Minutes</span>
                        </div>
                    </div>
                    <p class="performance-ending-footer" style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">The band will complete the current progression loop before performing the resolution.</p>
                </div>
            </div>

            <!-- Library & Presets Section -->
            <div class="settings-section">
                <h3>Library & Presets</h3>
                <div style="margin-bottom: 0;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="applyPresetSettingsCheck">
                        <span>Auto-Apply Preset Settings</span>
                    </label>
                    <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;">
                        Automatically update BPM and Style when loading a library preset.
                    </p>
                </div>
            </div>

            <!-- External Section (MIDI) -->
            <div class="settings-section">
                <h3>External (MIDI Output)</h3>
                <div style="margin-bottom: 1rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="midiEnableCheck">
                        <span>Enable Web MIDI Output</span>
                    </label>
                    <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;">
                        Route notes to your DAW or external hardware.
                    </p>
                </div>

                <div id="midiControls" style="opacity: 0.5; pointer-events: none; transition: opacity 0.2s;">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="midiMuteLocalCheck" checked>
                            <span>Mute Browser Audio</span>
                        </label>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Output Port</label>
                        <select id="midiOutputSelect" aria-label="MIDI Output Port" style="width: 100%;">
                            <option value="">No outputs found</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                        <div class="midi-ch-group">
                            <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">Chords</label>
                            <div style="display: flex; gap: 0.25rem;">
                                <input type="number" id="midiChordsChannel" min="1" max="16" value="1" style="width: 50%;" title="Channel" aria-label="Chords Channel">
                                <input type="number" id="midiChordsOctave" min="-2" max="2" value="0" style="width: 50%;" title="Octave Offset" aria-label="Chords Octave Offset">
                            </div>
                        </div>
                        <div class="midi-ch-group">
                            <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">Bass</label>
                            <div style="display: flex; gap: 0.25rem;">
                                <input type="number" id="midiBassChannel" min="1" max="16" value="2" style="width: 50%;" title="Channel" aria-label="Bass Channel">
                                <input type="number" id="midiBassOctave" min="-2" max="2" value="0" style="width: 50%;" title="Octave Offset" aria-label="Bass Octave Offset">
                            </div>
                        </div>
                        <div class="midi-ch-group">
                            <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">Soloist</label>
                            <div style="display: flex; gap: 0.25rem;">
                                <input type="number" id="midiSoloistChannel" min="1" max="16" value="3" style="width: 50%;" title="Channel" aria-label="Soloist Channel">
                                <input type="number" id="midiSoloistOctave" min="-2" max="2" value="0" style="width: 50%;" title="Octave Offset" aria-label="Soloist Octave Offset">
                            </div>
                        </div>
                        <div class="midi-ch-group">
                            <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">Harmony</label>
                            <div style="display: flex; gap: 0.25rem;">
                                <input type="number" id="midiHarmonyChannel" min="1" max="16" value="4" style="width: 50%;" title="Channel" aria-label="Harmony Channel">
                                <input type="number" id="midiHarmonyOctave" min="-2" max="2" value="0" style="width: 50%;" title="Octave Offset" aria-label="Harmony Octave Offset">
                            </div>
                        </div>
                        <div class="midi-ch-group">
                            <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">Drums</label>
                            <div style="display: flex; gap: 0.25rem;">
                                <input type="number" id="midiDrumsChannel" min="1" max="16" value="10" style="width: 50%;" title="Channel" aria-label="Drums Channel">
                                <input type="number" id="midiDrumsOctave" min="-2" max="2" value="0" style="width: 50%;" title="Octave Offset" aria-label="Drums Octave Offset">
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 1rem;">
                        <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                            <span>Latency Offset</span>
                            <span id="midiLatencyValue" style="color: var(--accent-color);">0ms</span>
                        </label>
                        <input type="range" id="midiLatencySlider" min="-100" max="100" step="1" value="0" style="width: 100%;" aria-label="MIDI Latency Offset">
                    </div>

                    <div style="margin-bottom: 0;">
                        <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                            <span>Velocity Sensitivity</span>
                            <span id="midiVelocityValue" style="color: var(--accent-color);">1.0</span>
                        </label>
                        <input type="range" id="midiVelocitySlider" min="0.5" max="2.0" step="0.1" value="1.0" style="width: 100%;" aria-label="MIDI Velocity Sensitivity">
                    </div>
                </div>
            </div>
            
            <!-- Actions Section -->
            <div class="settings-section" style="border-bottom: none; padding-bottom: 0;">
                <h3>System Actions</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <button id="settingsExportMidiBtn" class="secondary-btn" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;">
                        <span>🎹</span> Export MIDI
                    </button>
                    <button id="installAppBtn" class="secondary-btn" style="display: none; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;">
                        <span>📲</span> Install App
                    </button>
                    <button id="resetSettingsBtn" class="secondary-btn" style="color: var(--error-color); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); padding: 0.8rem 0.5rem;">
                        <span>🗑️</span> Reset All
                    </button>
                    <button id="refreshAppBtn" class="secondary-btn" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;">
                        <span>🔄</span> Force Refresh
                    </button>
                </div>
            </div>
        </div>

        <div class="settings-help" style="margin-top: 1rem; border-top: 1px solid #334155; padding-top: 1rem; border-top: none;">
            <details open>
                <summary style="cursor: pointer; font-weight: bold; color: var(--text-primary); list-style: none; display: flex; align-items: center; justify-content: space-between;">
                    <span>Help & Instructions</span>
                    <span style="font-size: 0.8em;">▼</span>
                </summary>
                <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
                    <div style="margin-bottom: 1.5rem; background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
                        <h4 style="color: var(--accent-color); margin-top: 0; margin-bottom: 0.5rem;">Need more help?</h4>
                        <p style="margin-bottom: 0.8rem;">For a deep dive into notation, soloing styles, and MIDI export, check out the full manual.</p>
                        <a href="manual.html" target="_blank" rel="noopener noreferrer" style="color: white; background: var(--accent-color); padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Open User Manual</a>
                    </div>
                </div>
            </details>
            <div id="appVersion" style="text-align: center; margin-top: 1.5rem; color: var(--text-muted); font-size: 0.8rem; opacity: 0.7;"></div>
        </div>
    </div>
</div>
`;
