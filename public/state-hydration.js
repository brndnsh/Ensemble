import { ctx, gb, cb, bb, sb, vizState, storage, arranger } from './state.js';
import { ui, updateKeySelectLabels, updateRelKeyButton, updateGenreUI } from './ui.js';
import { decompressSections, generateId, normalizeKey } from './utils.js';
import { applyTheme, setBpm } from './app-controller.js';
import { loadDrumPreset } from './instrument-controller.js';
import { updateStyle } from './ui-controller.js';

export function hydrateState(viz) {
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
        ctx.applyPresetSettings = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false; 
        vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
        
        if (savedState.cb) { 
            cb.enabled = savedState.cb.enabled !== undefined ? savedState.cb.enabled : true; 
            cb.style = savedState.cb.style || 'smart'; 
            cb.instrument = 'Piano'; 
            cb.octave = savedState.cb.octave; 
            cb.density = savedState.cb.density; 
            cb.volume = savedState.cb.volume; 
            cb.reverb = savedState.cb.reverb; 
            cb.practiceMode = savedState.cb.practiceMode || false;
        }
        if (savedState.bb) { 
            bb.enabled = savedState.bb.enabled !== undefined ? savedState.bb.enabled : false; 
            bb.style = savedState.bb.style || 'smart'; 
            bb.octave = savedState.bb.octave; 
            bb.volume = savedState.bb.volume; 
            bb.reverb = savedState.bb.reverb; 
        }
        if (savedState.sb) { 
            sb.enabled = savedState.sb.enabled !== undefined ? savedState.sb.enabled : false; 
            sb.style = savedState.sb.style || 'smart'; 
            sb.octave = (savedState.sb.octave === 77 || savedState.sb.octave === 67 || savedState.sb.octave === undefined) ? 72 : savedState.sb.octave; 
            sb.volume = savedState.sb.volume; 
            sb.reverb = savedState.sb.reverb; 
            sb.doubleStops = savedState.sb.doubleStops !== undefined ? savedState.sb.doubleStops : false;
        }
        if (savedState.gb) { 
            gb.enabled = savedState.gb.enabled !== undefined ? savedState.gb.enabled : true; 
            gb.volume = savedState.gb.volume; 
            gb.reverb = savedState.gb.reverb; 
            gb.swing = savedState.gb.swing; 
            gb.swingSub = savedState.gb.swingSub; 
            gb.measures = savedState.gb.measures || 1; 
            gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20; 
            gb.followPlayback = savedState.gb.followPlayback !== undefined ? savedState.gb.followPlayback : (savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true); 
            gb.lastDrumPreset = savedState.gb.lastDrumPreset || 'Standard'; 
            if (savedState.gb.pattern) { 
                savedState.gb.pattern.forEach(savedInst => { 
                    const inst = gb.instruments.find(i => i.name === savedInst.name); 
                    if (inst) { inst.steps.fill(0); savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; }); } 
                }); 
            } 
            gb.genreFeel = savedState.gb.genreFeel || 'Rock'; 
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
        if (ui.drumVol) ui.drumVol.value = gb.volume;
        if (ui.drumReverb) ui.drumReverb.value = gb.reverb;
        if (ui.swingSlider) ui.swingSlider.value = gb.swing;
        if (ui.swingBase) ui.swingBase.value = gb.swingSub;
        if (ui.humanizeSlider) ui.humanizeSlider.value = gb.humanize;
        if (ui.drumBarsSelect) ui.drumBarsSelect.value = gb.measures;
        if (ui.metronome) ui.metronome.checked = ctx.metronome;
        if (ui.applyPresetSettings) ui.applyPresetSettings.checked = ctx.applyPresetSettings;
        
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
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

function clearChordPresetHighlight() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
}
