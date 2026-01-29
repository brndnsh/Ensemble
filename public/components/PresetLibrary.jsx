import { h } from 'preact';
import { useEnsembleState, useDispatch } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { CHORD_PRESETS, DRUM_PRESETS } from '../presets.js';
import { formatUnicodeSymbols, generateId } from '../utils.js';
import { loadDrumPreset, flushBuffers } from '../instrument-controller.js';
import { validateAndAnalyze } from '../arranger-controller.js';
import { saveCurrentState } from '../persistence.js';
import { setBpm } from '../app-controller.js';
import { syncWorker } from '../worker-client.js';

export function PresetLibrary({ type }) {
    const dispatch = useDispatch();
    const { lastChordPreset, lastDrumPreset, isDirty, isPlaying } = useEnsembleState(s => ({
        lastChordPreset: s.arranger.lastChordPreset,
        lastDrumPreset: s.groove.lastDrumPreset,
        isDirty: s.arranger.isDirty,
        isPlaying: s.playback.isPlaying
    }));

    const presets = type === 'chord' 
        ? CHORD_PRESETS 
        : Object.keys(DRUM_PRESETS).map(name => ({ name, ...DRUM_PRESETS[name] }));

    const activeId = type === 'chord' ? lastChordPreset : lastDrumPreset;

    const handleSelect = (item) => {
        if (type === 'chord') {
            if (isDirty && !confirm("Discard your custom arrangement and load this preset?")) return;
            
            // Note: togglePlay logic handled by caller or state if needed
            
            import('../state.js').then(({ arranger, playback }) => {
                arranger.sections = item.sections.map(s => ({
                    id: generateId(),
                    label: s.label,
                    value: s.value,
                    repeat: s.repeat || 1,
                    key: s.key || '',
                    timeSignature: s.timeSignature || '',
                    seamless: !!s.seamless
                }));
                
                arranger.isDirty = false;
                arranger.isMinor = item.isMinor || false;
                arranger.lastChordPreset = item.name;

                if (item.settings) {
                    if (playback.applyPresetSettings) {
                        if (item.settings.bpm) setBpm(item.settings.bpm, null);
                        if (item.settings.style) dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: item.settings.style });
                    }
                    if (item.settings.timeSignature) {
                        arranger.timeSignature = item.settings.timeSignature;
                    }
                }

                validateAndAnalyze();
                flushBuffers();
                saveCurrentState();
            });
        } else {
            loadDrumPreset(item.name);
            import('../state.js').then(({ groove }) => {
                groove.lastDrumPreset = item.name;
                syncWorker();
                saveCurrentState();
            });
        }
    };

    // Grouping logic similar to StyleSelector if needed, but simple list for now matches legacy
    const sorted = [...presets].sort((a, b) => (a.category || '').localeCompare(b.category || ''));

    return (
        <div className="presets-container">
            {sorted.map(item => (
                <button 
                    key={item.id || item.name}
                    className={`preset-chip ${type}-preset-chip ${activeId === (item.id || item.name) ? 'active' : ''}`}
                    onClick={() => handleSelect(item)}
                    data-id={item.id || item.name}
                    data-category={item.category || 'Other'}
                >
                    {formatUnicodeSymbols(item.name)}
                </button>
            ))}
        </div>
    );
}
