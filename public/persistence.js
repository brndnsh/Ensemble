import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi } from './state.js';
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
        theme: playback.theme,
        bpm: playback.bpm,
        metronome: playback.metronome,
        applyPresetSettings: playback.applyPresetSettings,
        sessionTimer: playback.sessionTimer,
        vizEnabled: vizState.enabled,
        autoIntensity: playback.autoIntensity,
        chords: { enabled: chords.enabled, style: chords.style, instrument: chords.instrument, octave: chords.octave, density: chords.density, volume: chords.volume, reverb: chords.reverb, pianoRoots: chords.pianoRoots },
        bass: { enabled: bass.enabled, style: bass.style, octave: bass.octave, volume: bass.volume, reverb: bass.reverb },
        soloist: { enabled: soloist.enabled, style: soloist.style, octave: soloist.octave, volume: soloist.volume, reverb: soloist.reverb, doubleStops: soloist.doubleStops },
        harmony: { enabled: harmony.enabled, style: harmony.style, octave: harmony.octave, volume: harmony.volume, reverb: harmony.reverb, complexity: harmony.complexity },
        groove: {
            enabled: groove.enabled,
            volume: groove.volume,
            reverb: groove.reverb,
            swing: groove.swing,
                        swingSub: groove.swingSub,
                        followPlayback: groove.followPlayback,
                        humanize: groove.humanize,            lastDrumPreset: groove.lastDrumPreset,
            genreFeel: groove.genreFeel,
            larsMode: groove.larsMode,
            larsIntensity: groove.larsIntensity,
            lastSmartGenre: groove.lastSmartGenre,
            activeTab: groove.activeTab,
            mobileTab: groove.mobileTab,
            pattern: groove.instruments.map(inst => ({ name: inst.name, steps: [...inst.steps] }))
        },
        midi: {
            enabled: midi.enabled,
            selectedOutputId: midi.selectedOutputId,
            chordsChannel: midi.chordsChannel,
            bassChannel: midi.bassChannel,
            soloistChannel: midi.soloistChannel,
            harmonyChannel: midi.harmonyChannel,
            drumsChannel: midi.drumsChannel,
            chordsOctave: midi.chordsOctave,
            bassOctave: midi.bassOctave,
            soloistOctave: midi.soloistOctave,
            harmonyOctave: midi.harmonyOctave,
            drumsOctave: midi.drumsOctave,
            latency: midi.latency,
            muteLocal: midi.muteLocal,
            velocitySensitivity: midi.velocitySensitivity
        }    };
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
            if (playback.isPlaying && togglePlay) togglePlay();
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
                groove.measures = p.measures;
                groove.currentMeasure = 0;
                ui.drumBarsSelect.value = p.measures;
                renderMeasurePagination(switchMeasure);
                renderGrid();
            }
            p.pattern.forEach(savedInst => {
                const inst = groove.instruments.find(i => i.name === savedInst.name);
                if (inst) {
                    inst.steps.fill(0);
                    savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
                }
            });
            if (p.swing !== undefined) { groove.swing = p.swing; ui.swingSlider.value = p.swing; }
            if (p.swingSub) { groove.swingSub = p.swingSub; ui.swingBase.value = p.swingSub; }
            groove.lastDrumPreset = p.name;
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            saveCurrentState();
        }, 'drum-preset-chip');
        if (p.name === groove.lastDrumPreset) chip.classList.add('active');
        ui.userDrumPresetsContainer.appendChild(chip);
    });
}