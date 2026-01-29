import { h } from 'preact';
import { useEnsembleState } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { dispatch, playback } from '../state.js';
import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { saveCurrentState } from '../persistence.js';

export function InstrumentSettings({ module }) {
    const state = useEnsembleState(s => {
        // Map module string to state object key
        const key = module === 'groove' ? 'groove' : module; // 'grooves' in UI id, 'groove' in state
        return s[key];
    });

    // Helper to update Volume/Reverb with audio ramping
    const updateAudio = (type, val) => {
        const numVal = parseFloat(val);
        const isReverb = type === 'reverb';
        
        // 1. Dispatch State Update
        // We can't easily dispatch a generic "SET_VOLUME" because existing actions might be specific.
        // Actually, looking at types.js, we have SET_PARAM?
        // Let's use direct state mutation + saveCurrentState like the legacy controller did for now,
        // OR define new actions. Legacy controller did `state.volume = val`.
        // Ideally we should use dispatch.
        // For now, let's stick to the "Action" pattern if possible, or replicate the legacy direct mutation if actions don't exist.
        // Accessing state directly is generally bad in Redux-like, but `state.js` allows it.
        // The legacy code: `if (state !== playback) state.volume = val;`
        
        // Let's assume we can mutate for now to match legacy behavior, but wrapper in a function.
        if (state) {
            state[isReverb ? 'reverb' : 'volume'] = numVal;
            saveCurrentState();
        }

        // 2. Update Audio Node
        // We need the gain node name.
        const moduleName = module === 'groove' ? 'drums' : 
                          module === 'harmony' ? 'harmonies' : module;
        
        const gainKey = isReverb ? `${moduleName}Reverb` : `${moduleName}Gain`;
        const multiplier = isReverb ? 1.0 : (MIXER_GAIN_MULTIPLIERS[moduleName] || 1.0);
        
        if (playback[gainKey] && playback.audio) {
            const target = Math.max(0.0001, numVal * multiplier);
            playback[gainKey].gain.cancelScheduledValues(playback.audio.currentTime);
            playback[gainKey].gain.setValueAtTime(playback[gainKey].gain.value, playback.audio.currentTime);
            playback[gainKey].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
        }
    };

    if (!state) return null;

    return (
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            {/* Left Column: Instrument Specifics */}
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">
                    {module === 'groove' ? 'Feel & Actions' : 
                     module === 'chords' || module === 'harmony' ? 'Voicing' : 'Instrument'}
                </h4>
                
                {module === 'chords' && (
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Density</label>
                        <select 
                            value={state.density || 'standard'} 
                            onChange={(e) => {
                                dispatch(ACTIONS.SET_CHORD_DENSITY, e.target.value);
                                saveCurrentState();
                            }}
                            aria-label="Voicing Density"
                        >
                            <option value="thin">Thin (3 notes)</option>
                            <option value="standard">Standard (4 notes)</option>
                            <option value="rich">Rich (5+ notes)</option>
                        </select>
                    </div>
                )}

                {module === 'harmony' && (
                    <div style="margin-bottom: 1rem;">
                        <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                            <span>Complexity</span>
                            <span>{Math.round((state.complexity || 0.5) * 100)}%</span>
                        </label>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05" 
                            value={state.complexity || 0.5} 
                            onInput={(e) => {
                                state.complexity = parseFloat(e.target.value); // Legacy mutation
                                saveCurrentState();
                            }}
                            aria-label="Harmony Complexity" 
                        />
                    </div>
                )}

                {module === 'groove' && (
                    <GrooveControls state={state} />
                )}
            </div>

            {/* Right Column: Mixer */}
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Volume</label>
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={state.volume} 
                        onInput={(e) => updateAudio('volume', e.target.value)}
                        aria-label={`${module} Volume`} 
                        style="width: 100%;"
                    />
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Reverb</label>
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={state.reverb} 
                        onInput={(e) => updateAudio('reverb', e.target.value)}
                        aria-label={`${module} Reverb`} 
                        style="width: 100%;"
                    />
                </div>
            </div>
        </div>
    );
}

function GrooveControls({ state }) {
    // We need 'playback' state for swing
    const { swing, swingSub } = useEnsembleState(s => s.playback);
    
    return (
        <div>
            <div style="margin-bottom: 1rem;">
                <label class="control-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Swing</label>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={swing || 0} 
                        onInput={(e) => {
                            dispatch(ACTIONS.SET_SWING, parseInt(e.target.value));
                            saveCurrentState();
                        }}
                        style="flex-grow: 1; height: 4px;" 
                        aria-label="Swing Amount" 
                    />
                    <select 
                        value={swingSub || '8th'}
                        onChange={(e) => {
                            dispatch(ACTIONS.SET_SWING_SUB, e.target.value);
                            saveCurrentState();
                        }}
                        aria-label="Swing Base Note"
                    >
                        <option value="16th">1/16</option>
                        <option value="8th">1/8</option>
                    </select>
                </div>
            </div>
            <div style="margin-bottom: 1rem;">
                <label class="control-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Humanize</label>
                <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={state.humanize || 0} 
                    onInput={(e) => {
                         state.humanize = parseInt(e.target.value); // Legacy mutation
                         saveCurrentState();
                    }}
                    style="width: 100%; height: 4px;" 
                    aria-label="Humanize Amount" 
                />
            </div>
            {/* Lars Mode & Buttons could go here, but omitted for brevity in first pass or implemented similarly */}
        </div>
    );
}
