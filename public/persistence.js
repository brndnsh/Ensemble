import { arranger, ctx, cb, bb, sb, gb, vizState, storage, midi } from './state.js';
import { ui, createPresetChip, renderSections, renderMeasurePagination, renderGrid } from './ui.js';
import { decompressSections, generateId } from './utils.js';

let saveTimeout;

export function saveCurrentState() {
    if (saveTimeout) clearTimeout(saveTimeout);
    const data = {
        sections: arranger.sections,
        key: arranger.key,
        timeSignature: arranger.timeSignature,
        isMinor: arranger.isMinor,
        notation: arranger.notation,
        lastChordPreset: arranger.lastChordPreset,
        theme: ctx.theme,
        bpm: ctx.bpm,
        metronome: ctx.metronome,
        applyPresetSettings: ctx.applyPresetSettings,
        vizEnabled: vizState.enabled,
        autoIntensity: ctx.autoIntensity,
        cb: { enabled: cb.enabled, style: cb.style, instrument: cb.instrument, octave: cb.octave, density: cb.density, volume: cb.volume, reverb: cb.reverb, practiceMode: cb.practiceMode },
        bb: { enabled: bb.enabled, style: bb.style, octave: bb.octave, volume: bb.volume, reverb: bb.reverb },
        sb: { enabled: sb.enabled, style: sb.style, octave: sb.octave, volume: sb.volume, reverb: sb.reverb, doubleStops: sb.doubleStops },
        gb: { 
            enabled: gb.enabled,
            volume: gb.volume, 
            reverb: gb.reverb, 
            swing: gb.swing, 
                        swingSub: gb.swingSub,
                        followPlayback: gb.followPlayback,
                        humanize: gb.humanize,            lastDrumPreset: gb.lastDrumPreset,
            genreFeel: gb.genreFeel,
            larsMode: gb.larsMode,
            larsIntensity: gb.larsIntensity,
            lastSmartGenre: gb.lastSmartGenre,
            activeTab: gb.activeTab,
            mobileTab: gb.mobileTab,
            pattern: gb.instruments.map(inst => ({ name: inst.name, steps: [...inst.steps] }))
        },
        midi: {
            enabled: midi.enabled,
            selectedOutputId: midi.selectedOutputId,
            chordsChannel: midi.chordsChannel,
            bassChannel: midi.bassChannel,
            soloistChannel: midi.soloistChannel,
            drumsChannel: midi.drumsChannel,
            chordsOctave: midi.chordsOctave,
            bassOctave: midi.bassOctave,
            soloistOctave: midi.soloistOctave,
            drumsOctave: midi.drumsOctave,
            latency: midi.latency,
            muteLocal: midi.muteLocal,
            velocitySensitivity: midi.velocitySensitivity
        }
    };
    storage.save('currentState', data);
}

export function debounceSaveState() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentState, 1000);
}

export function renderUserPresets(onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, togglePlay) {
    const userPresets = storage.get('userPresets');
    ui.userPresetsContainer.innerHTML = '';
    if (userPresets.length === 0) { ui.userPresetsContainer.style.display = 'none'; return; }
    ui.userPresetsContainer.style.display = 'flex';
    userPresets.forEach((p, idx) => {
        const chip = createPresetChip(p.name, () => {
            if (confirm("Delete this preset?")) {
                userPresets.splice(idx, 1);
                storage.save('userPresets', userPresets);
                renderUserPresets(onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, togglePlay);
            }
        }, () => {
            if (ctx.isPlaying && togglePlay) togglePlay();
            arranger.sections = p.sections ? decompressSections(p.sections) : [{ id: generateId(), label: 'Main', value: p.prog }];
            arranger.lastChordPreset = p.name;
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
            validateAndAnalyze();
            document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            saveCurrentState();
        });
        if (p.name === arranger.lastChordPreset) chip.classList.add('active');
        ui.userPresetsContainer.appendChild(chip);
    });
}

export function renderUserDrumPresets(switchMeasure) {
    const userDrumPresets = storage.get('userDrumPresets');
    ui.userDrumPresetsContainer.innerHTML = '';
    if (userDrumPresets.length === 0) { ui.userDrumPresetsContainer.style.display = 'none'; return; }
    ui.userDrumPresetsContainer.style.display = 'flex';
    userDrumPresets.forEach((p, idx) => {
        const chip = createPresetChip(p.name, () => {
            if (confirm("Delete this drum pattern?")) {
                userDrumPresets.splice(idx, 1);
                storage.save('userDrumPresets', userDrumPresets);
                renderUserDrumPresets(switchMeasure);
            }
        }, () => {
            if (p.measures) {
                gb.measures = p.measures;
                gb.currentMeasure = 0;
                ui.drumBarsSelect.value = p.measures;
                renderMeasurePagination(switchMeasure);
                renderGrid();
            }
            p.pattern.forEach(savedInst => {
                const inst = gb.instruments.find(i => i.name === savedInst.name);
                if (inst) {
                    inst.steps.fill(0);
                    savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
                }
            });
            if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
            if (p.swingSub) { gb.swingSub = p.swingSub; ui.swingBase.value = p.swingSub; }
            gb.lastDrumPreset = p.name;
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            saveCurrentState();
        }, 'drum-preset-chip');
        if (p.name === gb.lastDrumPreset) chip.classList.add('active');
        ui.userDrumPresetsContainer.appendChild(chip);
    });
}