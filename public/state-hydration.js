import { ACTIONS } from './types.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, vizState, storage, dispatch } from './state.js';
import { applyTheme, setBpm } from './app-controller.js';
import { ui, updateRelKeyButton, updateKeySelectLabels } from './ui.js';
import { decompressSections, generateId, normalizeKey } from './utils.js';
import { updateStyle } from './ui-controller.js';

export function hydrateState() {
    const savedState = storage.get('currentState');
    if (savedState && savedState.sections) {
        arranger.sections = savedState.sections; 
        arranger.key = savedState.key || 'C'; 
        arranger.timeSignature = savedState.timeSignature || '4/4'; 
        arranger.isMinor = savedState.isMinor || false; 
        arranger.notation = savedState.notation || 'roman'; 
        arranger.lastChordPreset = savedState.lastChordPreset || 'Pop (Standard)'; 
        playback.theme = savedState.theme || 'auto'; 
        playback.bpm = savedState.bpm || 100; 
        playback.bandIntensity = savedState.bandIntensity !== undefined ? savedState.bandIntensity : 0.5; 
        playback.complexity = savedState.complexity !== undefined ? savedState.complexity : 0.3; 
        playback.autoIntensity = savedState.autoIntensity !== undefined ? savedState.autoIntensity : true; 
        playback.highFidelity = savedState.highFidelity || false;
        playback.metronome = savedState.metronome || false; 
        playback.sessionTimer = savedState.sessionTimer !== undefined ? savedState.sessionTimer : 5;
        playback.stopAtEnd = false;
        
        if (ui.sessionTimerCheck) ui.sessionTimerCheck.checked = playback.sessionTimer > 0;
        if (ui.sessionTimerInput) ui.sessionTimerInput.value = playback.sessionTimer > 0 ? playback.sessionTimer : 5;
        
        // Also ensure the visual container reflects the state
        if (ui.sessionTimerDurationContainer) {
            ui.sessionTimerDurationContainer.style.opacity = playback.sessionTimer > 0 ? '1' : '0.4';
            ui.sessionTimerDurationContainer.style.pointerEvents = playback.sessionTimer > 0 ? 'auto' : 'none';
        }


        playback.applyPresetSettings = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false; 
        vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
        
        if (savedState.chords) { 
            chords.enabled = savedState.chords.enabled !== undefined ? savedState.chords.enabled : true; 
            chords.style = savedState.chords.style || 'smart'; 
            chords.instrument = 'Piano'; 
            chords.octave = savedState.chords.octave; 
            chords.density = savedState.chords.density; 
        chords.volume = savedState.chords.volume !== undefined ? savedState.chords.volume : 0.5;
        chords.reverb = savedState.chords.reverb !== undefined ? savedState.chords.reverb : 0.3;
        chords.pianoRoots = savedState.chords.pianoRoots || false;
        chords.activeTab = savedState.chords.activeTab || 'smart';
        }
        if (savedState.bass) { 
            bass.enabled = savedState.bass.enabled !== undefined ? savedState.bass.enabled : true; 
            bass.style = savedState.bass.style || 'smart'; 
            bass.octave = savedState.bass.octave; 
            bass.volume = savedState.bass.volume !== undefined ? savedState.bass.volume : 0.45; 
            bass.reverb = savedState.bass.reverb !== undefined ? savedState.bass.reverb : 0.05; 
            bass.activeTab = savedState.bass.activeTab || 'smart';
        }
        if (savedState.soloist) { 
            soloist.enabled = savedState.soloist.enabled !== undefined ? savedState.soloist.enabled : false; 
            soloist.style = savedState.soloist.style || 'smart'; 
            soloist.octave = (savedState.soloist.octave === 77 || savedState.soloist.octave === 67 || savedState.soloist.octave === undefined) ? 72 : savedState.soloist.octave; 
            soloist.volume = savedState.soloist.volume !== undefined ? savedState.soloist.volume : 0.5; 
            soloist.reverb = savedState.soloist.reverb !== undefined ? savedState.soloist.reverb : 0.6; 
            soloist.doubleStops = savedState.soloist.doubleStops !== undefined ? savedState.soloist.doubleStops : false;
            soloist.activeTab = savedState.soloist.activeTab || 'smart';
        }
        if (savedState.harmony) {
            harmony.enabled = savedState.harmony.enabled !== undefined ? savedState.harmony.enabled : false;
            harmony.style = savedState.harmony.style || 'smart';
            harmony.octave = savedState.harmony.octave || 60;
            harmony.volume = savedState.harmony.volume !== undefined ? savedState.harmony.volume : 0.4;
            harmony.reverb = savedState.harmony.reverb !== undefined ? savedState.harmony.reverb : 0.4;
            harmony.complexity = savedState.harmony.complexity !== undefined ? savedState.harmony.complexity : 0.5;
            harmony.activeTab = savedState.harmony.activeTab || 'smart';
        }
        if (savedState.groove) { 
            groove.enabled = savedState.groove.enabled !== undefined ? savedState.groove.enabled : true; 
            groove.volume = savedState.groove.volume !== undefined ? savedState.groove.volume : 0.5; 
            groove.reverb = savedState.groove.reverb !== undefined ? savedState.groove.reverb : 0.2; 
            groove.swing = savedState.groove.swing; 
            groove.swingSub = savedState.groove.swingSub; 
            groove.measures = savedState.groove.measures || 1; 
            groove.humanize = savedState.groove.humanize !== undefined ? savedState.groove.humanize : 20; 
            groove.followPlayback = savedState.groove.followPlayback !== undefined ? savedState.groove.followPlayback : (savedState.groove.autoFollow !== undefined ? savedState.groove.autoFollow : true); 
            groove.lastDrumPreset = savedState.groove.lastDrumPreset || 'Basic Rock'; 
            if (savedState.groove.pattern && savedState.groove.pattern.length > 0) { 
                savedState.groove.pattern.forEach(savedInst => { 
                    const inst = groove.instruments.find(i => i.name === savedInst.name); 
                    if (inst) { inst.steps.fill(0); savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; }); } 
                }); 
            } else {
                // Fallback: Load the last preset if no custom pattern is saved
                // We need to import loadDrumPreset to do this, but circular dependencies might be an issue.
                // Instead, we can defer this or handle it in main.js.
                // Actually, let's just use the loadDrumPreset logic if we can import it.
                // But loadDrumPreset is in instrument-controller.js which imports state.js -> cycle.
                // We can't import loadDrumPreset here easily.
                
                // ALTERNATIVE: Set a flag so main.js can handle it?
                // Or duplicate the logic (risky).
                
                // Better: Let's assume main.js handles the default case. 
                // But main.js only checks storage.get('currentState').sections.
                
                // Let's modify main.js instead!
            }
            groove.genreFeel = savedState.groove.genreFeel || 'Rock'; 
            groove.larsMode = savedState.groove.larsMode || false;
            groove.larsIntensity = savedState.groove.larsIntensity !== undefined ? savedState.groove.larsIntensity : 0.5;
            groove.lastSmartGenre = savedState.groove.lastSmartGenre || 'Rock'; 
            groove.activeTab = savedState.groove.activeTab || 'smart'; 
            groove.mobileTab = savedState.groove.mobileTab || 'chords'; 
            groove.currentMeasure = 0; 
        }
        ui.keySelect.value = arranger.key; 
        ui.timeSigSelect.value = arranger.timeSignature; 
        ui.bpmInput.value = playback.bpm;
        
        if (ui.intensitySlider) { 
            ui.intensitySlider.value = Math.round(playback.bandIntensity * 100); 
            if (ui.intensityValue) ui.intensityValue.textContent = `${ui.intensitySlider.value}%`; 
            ui.intensitySlider.disabled = playback.autoIntensity; 
            ui.intensitySlider.style.opacity = playback.autoIntensity ? 0.5 : 1; 
        }
        if (ui.complexitySlider) { 
            ui.complexitySlider.value = Math.round(playback.complexity * 100); 
            let label = 'Low'; 
            if (playback.complexity > 0.33) label = 'Medium'; 
            if (playback.complexity > 0.66) label = 'High'; 
            if (ui.complexityValue) ui.complexityValue.textContent = label; 
        }
        if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = playback.autoIntensity;
        document.querySelectorAll('.genre-btn').forEach(btn => { 
            btn.classList.toggle('active', btn.dataset.genre === groove.lastSmartGenre); 
        });
        if (ui.notationSelect) ui.notationSelect.value = arranger.notation;
        if (ui.highFidelityCheck) ui.highFidelityCheck.checked = playback.highFidelity;
        ui.densitySelect.value = chords.density; 
    if (ui.chordVol) ui.chordVol.value = chords.volume;
    if (ui.pianoRootsCheck) ui.pianoRootsCheck.checked = chords.pianoRoots;
    if (ui.chordReverb) ui.chordReverb.value = chords.reverb;
        if (ui.bassVol) ui.bassVol.value = bass.volume;
        if (ui.bassReverb) ui.bassReverb.value = bass.reverb;
        if (ui.soloistVol) ui.soloistVol.value = soloist.volume;
        if (ui.soloistReverb) ui.soloistReverb.value = soloist.reverb;
        if (ui.soloistDoubleStops) ui.soloistDoubleStops.checked = soloist.doubleStops;
        if (ui.harmonyVol) ui.harmonyVol.value = harmony.volume;
        if (ui.harmonyReverb) ui.harmonyReverb.value = harmony.reverb;
        if (ui.harmonyComplexity) {
            ui.harmonyComplexity.value = harmony.complexity;
            if (ui.harmonyComplexityValue) ui.harmonyComplexityValue.textContent = `${Math.round(harmony.complexity * 100)}%`;
        }
        if (ui.drumVol) ui.drumVol.value = groove.volume;
        if (ui.drumReverb) ui.drumReverb.value = groove.reverb;
        if (ui.swingSlider) ui.swingSlider.value = groove.swing;
        if (ui.swingBase) ui.swingBase.value = groove.swingSub;
        if (ui.humanizeSlider) ui.humanizeSlider.value = groove.humanize;
        if (ui.drumBarsSelect) ui.drumBarsSelect.value = groove.measures;
        if (ui.applyPresetSettings) ui.applyPresetSettings.checked = playback.applyPresetSettings;
        
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

            if (ui.midiEnableCheck) ui.midiEnableCheck.checked = savedState.midi.enabled || false;
            if (ui.midiMuteLocalCheck) ui.midiMuteLocalCheck.checked = savedState.midi.muteLocal !== undefined ? savedState.midi.muteLocal : true;
            if (ui.midiChordsChannel) ui.midiChordsChannel.value = savedState.midi.chordsChannel || 1;
            if (ui.midiBassChannel) ui.midiBassChannel.value = savedState.midi.bassChannel || 2;
            if (ui.midiSoloistChannel) ui.midiSoloistChannel.value = savedState.midi.soloistChannel || 3;
            if (ui.midiHarmonyChannel) ui.midiHarmonyChannel.value = savedState.midi.harmonyChannel || 4;
            if (ui.midiDrumsChannel) ui.midiDrumsChannel.value = savedState.midi.drumsChannel || 10;
            
            if (ui.midiVelocitySlider) {
                ui.midiVelocitySlider.value = savedState.midi.velocitySensitivity !== undefined ? savedState.midi.velocitySensitivity : 1.0;
                if (ui.midiVelocityValue) ui.midiVelocityValue.textContent = parseFloat(ui.midiVelocitySlider.value).toFixed(1);
            }
            if (ui.midiChordsOctave) ui.midiChordsOctave.value = savedState.midi.chordsOctave || 0;
            if (ui.midiBassOctave) ui.midiBassOctave.value = savedState.midi.bassOctave || 0;
            if (ui.midiSoloistOctave) ui.midiSoloistOctave.value = savedState.midi.soloistOctave || 0;
            if (ui.midiHarmonyOctave) ui.midiHarmonyOctave.value = savedState.midi.harmonyOctave || 0;
            if (ui.midiDrumsOctave) ui.midiDrumsOctave.value = savedState.midi.drumsOctave || 0;

            if (savedState.midi.enabled) {
                import('./midi-controller.js').then(({ initMIDI }) => {
                    initMIDI();
                });
            }
        }

        applyTheme(playback.theme); 
    } else { 
        applyTheme('auto'); 
        if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = true;
        if (ui.intensitySlider) {
            ui.intensitySlider.disabled = true;
            ui.intensitySlider.style.opacity = 0.5;
        }
    }
    updateRelKeyButton(); 
    updateKeySelectLabels();
}

export function loadFromUrl(viz) {
    const params = new URLSearchParams(window.location.search); 
    let hasParams = false;
    if (params.get('s')) { arranger.sections = decompressSections(params.get('s')); hasParams = true; }
    else if (params.get('prog')) { arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }]; hasParams = true; }
    if (hasParams) clearChordPresetHighlight();
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); arranger.key = ui.keySelect.value; }
    if (params.get('ts')) { arranger.timeSignature = params.get('ts'); ui.timeSigSelect.value = arranger.timeSignature; }
    if (params.get('bpm')) { setBpm(params.get('bpm'), viz); }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('genre')) {
        const genre = params.get('genre');
        // Find the genre button and simulate a click to trigger all associated logic
        const btn = document.querySelector(`.genre-btn[data-genre="${genre}"]`);
        if (btn) {
            btn.click();
        }
        else {
            // Fallback if UI not yet ready
            groove.lastSmartGenre = genre;
            groove.genreFeel = genre;
        }
    }
    if (params.get('int')) {
        const val = parseFloat(params.get('int'));
        dispatch(ACTIONS.SET_BAND_INTENSITY, val);
        if (ui.intensitySlider) {
            ui.intensitySlider.value = Math.round(val * 100);
            if (ui.intensityValue) ui.intensityValue.textContent = `${ui.intensitySlider.value}%`;
        }
    }
    if (params.get('comp')) {
        const val = parseFloat(params.get('comp'));
        dispatch(ACTIONS.SET_COMPLEXITY, val);
        if (ui.complexitySlider) {
            ui.complexitySlider.value = Math.round(val * 100);
        }
    }
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

function clearChordPresetHighlight() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
}
