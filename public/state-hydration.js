import { ACTIONS } from './types.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, vizState, storage, dispatch } from './state.js';
import { applyTheme, setBpm } from './app-controller.js';
import { decompressSections, generateId, normalizeKey } from './utils.js';

export function hydrateState() {
    const savedState = storage.get('currentState');
    if (savedState && savedState.sections) {
        Object.assign(arranger, {
            sections: savedState.sections,
            key: savedState.key || 'C',
            timeSignature: savedState.timeSignature || '4/4',
            isMinor: savedState.isMinor || false,
            notation: savedState.notation || 'roman',
            lastChordPreset: savedState.lastChordPreset || 'Pop (Standard)'
        });

        Object.assign(playback, {
            theme: savedState.theme || 'auto',
            bpm: savedState.bpm || 100,
            bandIntensity: savedState.bandIntensity !== undefined ? savedState.bandIntensity : 0.5,
            complexity: savedState.complexity !== undefined ? savedState.complexity : 0.3,
            autoIntensity: true,
            metronome: false,
            visualFlash: savedState.visualFlash !== undefined ? savedState.visualFlash : false,
            haptic: savedState.haptic !== undefined ? savedState.haptic : false,
            countIn: savedState.countIn !== undefined ? savedState.countIn : true,
            sessionTimer: savedState.sessionTimer !== undefined ? savedState.sessionTimer : 5,
            applyPresetSettings: savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false,
            stopAtEnd: false
        });
        
        vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
        
        if (savedState.chords) { 
            Object.assign(chords, {
                enabled: savedState.chords.enabled !== undefined ? savedState.chords.enabled : true,
                style: savedState.chords.style || 'smart',
                instrument: 'Piano',
                octave: savedState.chords.octave,
                density: savedState.chords.density,
                volume: savedState.chords.volume !== undefined ? savedState.chords.volume : 0.5,
                reverb: savedState.chords.reverb !== undefined ? savedState.chords.reverb : 0.3,
                pianoRoots: savedState.chords.pianoRoots || false,
                activeTab: savedState.chords.activeTab || 'smart'
            });
        }
        if (savedState.bass) { 
            Object.assign(bass, {
                enabled: savedState.bass.enabled !== undefined ? savedState.bass.enabled : true,
                style: savedState.bass.style || 'smart',
                octave: savedState.bass.octave,
                volume: savedState.bass.volume !== undefined ? savedState.bass.volume : 0.45,
                reverb: savedState.bass.reverb !== undefined ? savedState.bass.reverb : 0.05,
                activeTab: savedState.bass.activeTab || 'smart'
            });
        }
        if (savedState.soloist) { 
            Object.assign(soloist, {
                enabled: savedState.soloist.enabled !== undefined ? savedState.soloist.enabled : false,
                style: savedState.soloist.style || 'smart',
                octave: (savedState.soloist.octave === 77 || savedState.soloist.octave === 67 || savedState.soloist.octave === undefined) ? 72 : savedState.soloist.octave,
                volume: savedState.soloist.volume !== undefined ? savedState.soloist.volume : 0.5,
                reverb: savedState.soloist.reverb !== undefined ? savedState.soloist.reverb : 0.6,
                doubleStops: savedState.soloist.doubleStops !== undefined ? savedState.soloist.doubleStops : false,
                activeTab: savedState.soloist.activeTab || 'smart'
            });
        }
        if (savedState.harmony) {
            Object.assign(harmony, {
                enabled: savedState.harmony.enabled !== undefined ? savedState.harmony.enabled : false,
                style: savedState.harmony.style || 'smart',
                octave: savedState.harmony.octave || 60,
                volume: savedState.harmony.volume !== undefined ? savedState.harmony.volume : 0.4,
                reverb: savedState.harmony.reverb !== undefined ? savedState.harmony.reverb : 0.4,
                complexity: savedState.harmony.complexity !== undefined ? savedState.harmony.complexity : 0.5,
                activeTab: savedState.harmony.activeTab || 'smart'
            });
        }
        if (savedState.groove) { 
            Object.assign(groove, {
                enabled: savedState.groove.enabled !== undefined ? savedState.groove.enabled : true,
                volume: savedState.groove.volume !== undefined ? savedState.groove.volume : 0.5,
                reverb: savedState.groove.reverb !== undefined ? savedState.groove.reverb : 0.2,
                swing: savedState.groove.swing,
                swingSub: savedState.groove.swingSub,
                measures: savedState.groove.measures || 1,
                humanize: savedState.groove.humanize !== undefined ? savedState.groove.humanize : 20,
                followPlayback: savedState.groove.followPlayback !== undefined ? savedState.groove.followPlayback : (savedState.groove.autoFollow !== undefined ? savedState.groove.autoFollow : true),
                lastDrumPreset: savedState.groove.lastDrumPreset || 'Basic Rock',
                genreFeel: savedState.groove.genreFeel || 'Rock',
                larsMode: savedState.groove.larsMode || false,
                larsIntensity: savedState.groove.larsIntensity !== undefined ? savedState.groove.larsIntensity : 0.5,
                lastSmartGenre: savedState.groove.lastSmartGenre || 'Rock',
                activeTab: savedState.groove.activeTab || 'smart',
                mobileTab: savedState.groove.mobileTab || 'chords',
                currentMeasure: 0
            });

            if (savedState.groove.pattern && savedState.groove.pattern.length > 0) { 
                savedState.groove.pattern.forEach(savedInst => { 
                    const inst = groove.instruments.find(i => i.name === savedInst.name); 
                    if (inst) { inst.steps.fill(0); savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; }); } 
                }); 
            }
        }
        
        if (savedState.midi) {
            dispatch(ACTIONS.SET_MIDI_CONFIG, {
                enabled: savedState.midi.enabled || false,
                selectedOutputId: savedState.midi.selectedOutputId || null,
                chordsChannel: savedState.midi.chordsChannel || 1,
                bassChannel: savedState.midi.bassChannel || 2,
                soloistChannel: savedState.midi.soloistChannel || 3,
                harmonyChannel: savedState.midi.harmonyChannel || 4,
                drumsChannel: savedState.midi.drumsChannel || 10,
                latency: savedState.midi.latency || 0,
                muteLocal: savedState.midi.muteLocal !== undefined ? savedState.midi.muteLocal : true,
                chordsOctave: savedState.midi.chordsOctave || 0,
                bassOctave: savedState.midi.bassOctave || 0,
                soloistOctave: savedState.midi.soloistOctave || 0,
                drumsOctave: savedState.midi.drumsOctave || 0,
                velocitySensitivity: savedState.midi.velocitySensitivity !== undefined ? savedState.midi.velocitySensitivity : 1.0
            });

            if (savedState.midi.enabled) {
                import('./midi-controller.js').then(({ initMIDI }) => {
                    initMIDI();
                });
            }
        }

        applyTheme(playback.theme); 
    } else { 
        applyTheme('auto'); 
    }
    dispatch('HYDRATE'); // Notify UI of all changes
}

export function loadFromUrl(viz) {
    const params = new URLSearchParams(window.location.search); 
    let hasParams = false;
    if (params.get('s')) { arranger.sections = decompressSections(params.get('s')); hasParams = true; }
    else if (params.get('prog')) { arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }]; hasParams = true; }
    if (hasParams) clearChordPresetHighlight();
    if (params.get('key')) { arranger.key = normalizeKey(params.get('key')); }
    if (params.get('ts')) { arranger.timeSignature = params.get('ts'); }
    if (params.get('bpm')) { setBpm(params.get('bpm'), viz); }
    if (params.get('style')) {
        // Dispatch style update instead of direct UI manipulation
        dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: params.get('style') });
    }
    if (params.get('genre')) {
        const genre = params.get('genre');
        // Fallback since UI not ready for click simulation
        groove.lastSmartGenre = genre;
        groove.genreFeel = genre;
        // Logic for applying genre feel should ideally be dispatched or handled by components reacting to 'genreFeel'
    }
    if (params.get('int')) {
        const val = parseFloat(params.get('int'));
        dispatch(ACTIONS.SET_BAND_INTENSITY, val);
    }
    if (params.get('comp')) {
        const val = parseFloat(params.get('comp'));
        dispatch(ACTIONS.SET_COMPLEXITY, val);
    }
    if (params.get('notation')) { arranger.notation = params.get('notation'); }
}

function clearChordPresetHighlight() {
    // DOM manipulation not needed here as UI will reflect state
}