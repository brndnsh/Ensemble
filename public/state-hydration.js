import { ACTIONS } from './types.js';
import { ctx, cb, bb, sb, hb, gb, arranger, vizState, storage, dispatch } from './state.js';
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
        ctx.theme = savedState.theme || 'auto'; 
        ctx.bpm = savedState.bpm || 100; 
        ctx.bandIntensity = savedState.bandIntensity !== undefined ? savedState.bandIntensity : 0.5; 
        ctx.complexity = savedState.complexity !== undefined ? savedState.complexity : 0.3; 
        ctx.autoIntensity = savedState.autoIntensity !== undefined ? savedState.autoIntensity : true; 
        ctx.metronome = savedState.metronome || false; 
        ctx.sessionTimer = savedState.sessionTimer !== undefined ? savedState.sessionTimer : 5;
        ctx.stopAtEnd = false;
        
        if (ui.sessionTimerCheck) ui.sessionTimerCheck.checked = ctx.sessionTimer > 0;
        if (ui.sessionTimerInput) ui.sessionTimerInput.value = ctx.sessionTimer > 0 ? ctx.sessionTimer : 5;
        
        // Also ensure the visual container reflects the state
        if (ui.sessionTimerDurationContainer) {
            ui.sessionTimerDurationContainer.style.opacity = ctx.sessionTimer > 0 ? '1' : '0.4';
            ui.sessionTimerDurationContainer.style.pointerEvents = ctx.sessionTimer > 0 ? 'auto' : 'none';
        }


        ctx.applyPresetSettings = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false; 
        vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
        
        if (savedState.cb) { 
            cb.enabled = savedState.cb.enabled !== undefined ? savedState.cb.enabled : true; 
            cb.style = savedState.cb.style || 'smart'; 
            cb.instrument = 'Piano'; 
            cb.octave = savedState.cb.octave; 
            cb.density = savedState.cb.density; 
            cb.volume = savedState.cb.volume !== undefined ? savedState.cb.volume : 0.5; 
            cb.reverb = savedState.cb.reverb !== undefined ? savedState.cb.reverb : 0.3; 
            cb.practiceMode = savedState.cb.practiceMode || false;
        }
        if (savedState.bb) { 
            bb.enabled = savedState.bb.enabled !== undefined ? savedState.bb.enabled : false; 
            bb.style = savedState.bb.style || 'smart'; 
            bb.octave = savedState.bb.octave; 
            bb.volume = savedState.bb.volume !== undefined ? savedState.bb.volume : 0.45; 
            bb.reverb = savedState.bb.reverb !== undefined ? savedState.bb.reverb : 0.05; 
        }
        if (savedState.sb) { 
            sb.enabled = savedState.sb.enabled !== undefined ? savedState.sb.enabled : false; 
            sb.style = savedState.sb.style || 'smart'; 
            sb.octave = (savedState.sb.octave === 77 || savedState.sb.octave === 67 || savedState.sb.octave === undefined) ? 72 : savedState.sb.octave; 
            sb.volume = savedState.sb.volume !== undefined ? savedState.sb.volume : 0.5; 
            sb.reverb = savedState.sb.reverb !== undefined ? savedState.sb.reverb : 0.6; 
            sb.doubleStops = savedState.sb.doubleStops !== undefined ? savedState.sb.doubleStops : false;
        }
        if (savedState.hb) {
            hb.enabled = savedState.hb.enabled !== undefined ? savedState.hb.enabled : false;
            hb.style = savedState.hb.style || 'smart';
            hb.octave = savedState.hb.octave || 60;
            hb.volume = savedState.hb.volume !== undefined ? savedState.hb.volume : 0.4;
            hb.reverb = savedState.hb.reverb !== undefined ? savedState.hb.reverb : 0.4;
            hb.complexity = savedState.hb.complexity !== undefined ? savedState.hb.complexity : 0.5;
        }
        if (savedState.gb) { 
            gb.enabled = savedState.gb.enabled !== undefined ? savedState.gb.enabled : true; 
            gb.volume = savedState.gb.volume !== undefined ? savedState.gb.volume : 0.5; 
            gb.reverb = savedState.gb.reverb !== undefined ? savedState.gb.reverb : 0.2; 
            gb.swing = savedState.gb.swing; 
            gb.swingSub = savedState.gb.swingSub; 
            gb.measures = savedState.gb.measures || 1; 
            gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20; 
            gb.followPlayback = savedState.gb.followPlayback !== undefined ? savedState.gb.followPlayback : (savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true); 
            gb.lastDrumPreset = savedState.gb.lastDrumPreset || 'Standard'; 
            if (savedState.gb.pattern && savedState.gb.pattern.length > 0) { 
                savedState.gb.pattern.forEach(savedInst => { 
                    const inst = gb.instruments.find(i => i.name === savedInst.name); 
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
            gb.genreFeel = savedState.gb.genreFeel || 'Rock'; 
            gb.larsMode = savedState.gb.larsMode || false;
            gb.larsIntensity = savedState.gb.larsIntensity !== undefined ? savedState.gb.larsIntensity : 0.5;
            gb.lastSmartGenre = savedState.gb.lastSmartGenre || 'Rock'; 
            gb.activeTab = savedState.gb.activeTab || 'smart'; 
            gb.mobileTab = savedState.gb.mobileTab || 'chords'; 
            gb.currentMeasure = 0; 
        }
        ui.keySelect.value = arranger.key; 
        ui.timeSigSelect.value = arranger.timeSignature; 
        ui.bpmInput.value = ctx.bpm;
        
        if (ui.intensitySlider) { 
            ui.intensitySlider.value = Math.round(ctx.bandIntensity * 100); 
            if (ui.intensityValue) ui.intensityValue.textContent = `${ui.intensitySlider.value}%`; 
            ui.intensitySlider.disabled = ctx.autoIntensity; 
            ui.intensitySlider.style.opacity = ctx.autoIntensity ? 0.5 : 1; 
        }
        if (ui.complexitySlider) { 
            ui.complexitySlider.value = Math.round(ctx.complexity * 100); 
            let label = 'Low'; 
            if (ctx.complexity > 0.33) label = 'Medium'; 
            if (ctx.complexity > 0.66) label = 'High'; 
            if (ui.complexityValue) ui.complexityValue.textContent = label; 
        }
        if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = ctx.autoIntensity;
        document.querySelectorAll('.genre-btn').forEach(btn => { 
            btn.classList.toggle('active', btn.dataset.genre === gb.lastSmartGenre); 
        });
        ui.notationSelect.value = arranger.notation; 
        ui.densitySelect.value = cb.density; 
        if (ui.practiceModeCheck) ui.practiceModeCheck.checked = cb.practiceMode;
        if (ui.chordVol) ui.chordVol.value = cb.volume;
        if (ui.chordReverb) ui.chordReverb.value = cb.reverb;
        if (ui.bassVol) ui.bassVol.value = bb.volume;
        if (ui.bassReverb) ui.bassReverb.value = bb.reverb;
        if (ui.soloistVol) ui.soloistVol.value = sb.volume;
        if (ui.soloistReverb) ui.soloistReverb.value = sb.reverb;
        if (ui.soloistDoubleStops) ui.soloistDoubleStops.checked = sb.doubleStops;
        if (ui.harmonyVol) ui.harmonyVol.value = hb.volume;
        if (ui.harmonyReverb) ui.harmonyReverb.value = hb.reverb;
        if (ui.harmonyComplexity) {
            ui.harmonyComplexity.value = hb.complexity;
            if (ui.harmonyComplexityValue) ui.harmonyComplexityValue.textContent = `${Math.round(hb.complexity * 100)}%`;
        }
        if (ui.drumVol) ui.drumVol.value = gb.volume;
        if (ui.drumReverb) ui.drumReverb.value = gb.reverb;
        if (ui.swingSlider) ui.swingSlider.value = gb.swing;
        if (ui.swingBase) ui.swingBase.value = gb.swingSub;
        if (ui.humanizeSlider) ui.humanizeSlider.value = gb.humanize;
        if (ui.drumBarsSelect) ui.drumBarsSelect.value = gb.measures;
        if (ui.applyPresetSettings) ui.applyPresetSettings.checked = ctx.applyPresetSettings;
        
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

        applyTheme(ctx.theme); 
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
            gb.lastSmartGenre = genre;
            gb.genreFeel = genre;
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
