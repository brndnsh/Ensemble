import { midiToNote } from './utils.js';
import { cb, gb } from './state.js';

export const ui = {
    playBtn: document.getElementById('playBtn'),
    bpmInput: document.getElementById('bpmInput'),
    tapBtn: document.getElementById('tapBtn'),
    keySelect: document.getElementById('keySelect'),
    transUpBtn: document.getElementById('transUpBtn'),
    transDownBtn: document.getElementById('transDownBtn'),
    maximizeChordBtn: document.getElementById('maximizeChordBtn'),
    chordPowerBtn: document.getElementById('chordPowerBtn'),
    groovePowerBtn: document.getElementById('groovePowerBtn'),
    bassPowerBtn: document.getElementById('bassPowerBtn'),
    soloistPowerBtn: document.getElementById('soloistPowerBtn'),
    vizPowerBtn: document.getElementById('vizPowerBtn'),
    progInput: document.getElementById('progressionInput'),
    randomizeBtn: document.getElementById('randomizeBtn'),
    clearProgBtn: document.getElementById('clearProgBtn'),
    saveBtn: document.getElementById('saveBtn'),
    shareBtn: document.getElementById('shareBtn'),
    chordVisualizer: document.getElementById('chordVisualizer'),
    chordPresets: document.getElementById('chordPresets'),
    userPresetsContainer: document.getElementById('userPresetsContainer'),
    chordStylePresets: document.getElementById('chordStylePresets'),
    bassStylePresets: document.getElementById('bassStylePresets'),
    soloistStylePresets: document.getElementById('soloistStylePresets'),
    chordVol: document.getElementById('chordVolume'),
    chordReverb: document.getElementById('chordReverb'),
    bassVol: document.getElementById('bassVolume'),
    bassReverb: document.getElementById('bassReverb'),
    soloistVol: document.getElementById('soloistVolume'),
    soloistReverb: document.getElementById('soloistReverb'),
    drumBarsSelect: document.getElementById('drumBarsSelect'),
    copyMeasureBtn: document.getElementById('copyMeasureBtn'),
    drumPresets: document.getElementById('drumPresets'),
    userDrumPresetsContainer: document.getElementById('userDrumPresetsContainer'),
    sequencerGrid: document.getElementById('sequencerGrid'),
    clearDrums: document.getElementById('clearDrumsBtn'),
    saveDrumBtn: document.getElementById('saveDrumBtn'),
    drumVol: document.getElementById('drumVolume'),
    drumReverb: document.getElementById('drumReverb'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    settingsBtn: document.getElementById('settingsBtn'),
    closeSettings: document.getElementById('closeSettingsBtn'),
    masterVol: document.getElementById('masterVolume'),
    octave: document.getElementById('octaveSlider'),
    octaveLabel: document.getElementById('octaveLabel'),
    bassOctave: document.getElementById('bassOctaveSlider'),
    bassOctaveLabel: document.getElementById('bassOctaveLabel'),
    soloistOctave: document.getElementById('soloistOctaveSlider'),
    soloistOctaveLabel: document.getElementById('soloistOctaveLabel'),
    bassHeaderReg: document.getElementById('bassHeaderReg'),
    soloistHeaderReg: document.getElementById('soloistHeaderReg'),
    notationSelect: document.getElementById('notationSelect'),
    densitySelect: document.getElementById('densitySelect'),
    countIn: document.getElementById('countInCheck'),
    swingSlider: document.getElementById('swingSlider'),
    swingBase: document.getElementById('swingBaseSelect'),
    visualFlash: document.getElementById('visualFlashCheck'),
    haptic: document.getElementById('hapticCheck'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
    flashOverlay: document.getElementById('flashOverlay'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn')
};

export function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    toast.style.opacity = "1";
    toast.style.bottom = "50px";
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.bottom = "30px";
        toast.classList.remove('show');
    }, 2000);
}

let flashTimeout = null;
export function triggerFlash(intensity = 0.2) {
    if (ui.visualFlash.checked) {
        if (flashTimeout) clearTimeout(flashTimeout);
        ui.flashOverlay.style.transition = 'none';
        ui.flashOverlay.style.opacity = intensity;
        flashTimeout = setTimeout(() => {
            ui.flashOverlay.style.transition = 'opacity 0.15s ease-out';
            ui.flashOverlay.style.opacity = 0;
            flashTimeout = null;
        }, 50);
    }
    if (ui.haptic.checked && navigator.vibrate) {
        navigator.vibrate(intensity > 0.15 ? 20 : 10);
    }
}

/**
 * Updates an octave label element with formatted note and octave text.
 * @param {HTMLElement} element - The label element to update.
 * @param {number} midi - The MIDI note number.
 * @param {HTMLElement|null} headerElement - Optional additional header element to update.
 */
export function updateOctaveLabel(element, midi, headerElement = null) {
    const { name, octave } = midiToNote(midi);
    const label = `${name}${octave}`;
    if (element) element.textContent = label;
    if (headerElement) headerElement.textContent = label;
}

function createChordLabel(data) {
    const container = document.createElement('span');
    container.textContent = data.root;
    if (data.suffix) {
        const sup = document.createElement('span');
        sup.className = 'suffix';
        sup.textContent = data.suffix;
        container.appendChild(sup);
    }
    if (data.bass) {
        container.appendChild(document.createTextNode('/' + data.bass));
    }
    return container;
}

/**
 * Renders the visual chord progression cards in the DOM.
 */
export function renderChordVisualizer() {
    ui.chordVisualizer.innerHTML = '';
    cb.cachedCards = [];
    if (cb.progression.length === 0) return;

    let measureBox = document.createElement('div');
    measureBox.className = 'measure-box';
    ui.chordVisualizer.appendChild(measureBox);
    
    let currentBeatsInBar = 0;

    cb.progression.forEach((chord, i) => {
        if (currentBeatsInBar >= 4) {
            measureBox = document.createElement('div');
            measureBox.className = 'measure-box';
            ui.chordVisualizer.appendChild(measureBox);
            currentBeatsInBar = 0;
        }

        const div = document.createElement('div');
        div.className = 'chord-card';
        if (chord.beats < 4) div.classList.add('small');
        if (chord.isMinor) div.classList.add('minor');
        
        let displayData;
        if (cb.notation === 'name') displayData = chord.display.abs;
        else if (cb.notation === 'nns') displayData = chord.display.nns;
        else displayData = chord.display.rom;

        div.appendChild(createChordLabel(displayData));
        
        div.onclick = () => window.previewChord(i);
        
        measureBox.appendChild(div);
        cb.cachedCards.push(div);
        currentBeatsInBar += chord.beats;
    });

    // Cache dimensions for efficient scrolling without reflows
    setTimeout(() => {
        cb.cardOffsets = cb.cachedCards.map(card => card.offsetTop - ui.chordVisualizer.offsetTop);
        cb.cardHeights = cb.cachedCards.map(card => card.clientHeight);
    }, 100);
}

/**
 * Helper to create a user preset chip with delete functionality.
 */
export function createPresetChip(name, onDelete, onSelect, className = 'user-preset-chip') {
    const chip = document.createElement('div');
    chip.className = `preset-chip ${className}`;
    chip.dataset.category = 'User';
    chip.innerHTML = `<span>${name}</span> <span style="margin-left: 8px; opacity: 0.5; cursor: pointer;" class="delete-btn">×</span>`;
    chip.querySelector('.delete-btn').onclick = (e) => {
        e.stopPropagation();
        onDelete();
    };
    chip.onclick = onSelect;
    return chip;
}

function createTrackRow(inst, measures, cachedSteps) {
    const row = document.createElement('div');
    row.className = 'track';
    
    const header = document.createElement('div');
    header.className = 'track-header';
    header.innerHTML = `<span>${inst.symbol} <span>${inst.name}</span></span>`;
    header.style.cursor = "pointer"; 
    if (inst.muted) header.style.opacity = 0.5;
    header.onclick = () => { inst.muted = !inst.muted; header.style.opacity = inst.muted ? 0.5 : 1; };
    row.appendChild(header);

    const stepsWrapper = document.createElement('div');
    stepsWrapper.className = 'steps-wrapper';
    
    for (let m = 0; m < measures; m++) {
        const measureDiv = document.createElement('div'); 
        measureDiv.className = 'steps';
        for (let b = 0; b < 16; b++) {
            const globalIdx = m * 16 + b;
            const step = document.createElement('div');
            const val = inst.steps[globalIdx];
            step.className = `step ${val === 2 ? 'accented' : (val === 1 ? 'active' : '')}`; 
            step.dataset.step = globalIdx;
            step.onclick = () => { 
                inst.steps[globalIdx] = (inst.steps[globalIdx] + 1) % 3; 
                renderGridState(); 
            };
            measureDiv.appendChild(step);
            
            if (!cachedSteps[globalIdx]) cachedSteps[globalIdx] = [];
            cachedSteps[globalIdx].push(step);
        }
        stepsWrapper.appendChild(measureDiv);
    }
    row.appendChild(stepsWrapper);
    return row;
}

function createLabelRow(measures, cachedSteps) {
    const labelRow = document.createElement('div');
    labelRow.className = 'track label-row';
    
    const labelHeader = document.createElement('div');
    labelHeader.className = 'track-header label-header';
    labelHeader.innerHTML = '<span></span>';
    labelRow.appendChild(labelHeader);

    const labelsWrapper = document.createElement('div');
    labelsWrapper.className = 'steps-wrapper';
    
    const beatLabels = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
    
    for (let m = 0; m < measures; m++) {
        const measureDiv = document.createElement('div');
        measureDiv.className = 'steps label-steps';
        beatLabels.forEach((text, i) => {
            const label = document.createElement('div');
            label.className = 'step-label';
            label.textContent = text;
            if (i % 4 === 0) label.classList.add('beat-start');
            measureDiv.appendChild(label);
            
            const globalIdx = m * 16 + i;
            if (!cachedSteps[globalIdx]) cachedSteps[globalIdx] = [];
            cachedSteps[globalIdx].push(label);
        });
        labelsWrapper.appendChild(measureDiv);
    }
    labelRow.appendChild(labelsWrapper);
    return labelRow;
}

/**
 * Renders the drum sequencer grid.
 */
export function renderGrid() {
    ui.sequencerGrid.innerHTML = '';
    gb.cachedSteps = [];
    const fragment = document.createDocumentFragment();

    gb.instruments.forEach((inst, tIdx) => {
        fragment.appendChild(createTrackRow(inst, gb.measures, gb.cachedSteps));
    });

    fragment.appendChild(createLabelRow(gb.measures, gb.cachedSteps));
    ui.sequencerGrid.appendChild(fragment);

    // Cache step offsets for efficient scrolling during playback
    setTimeout(() => {
        gb.stepOffsets = [];
        const containerRect = ui.sequencerGrid.getBoundingClientRect();
        for (let i = 0; i < gb.measures * 16; i++) {
            const steps = gb.cachedSteps[i];
            if (steps && steps[0]) {
                const rect = steps[0].getBoundingClientRect();
                gb.stepOffsets[i] = rect.left - containerRect.left + ui.sequencerGrid.scrollLeft - 100;
            }
        }
    }, 100);
}

/**
 * Updates only the 'active' and 'accented' classes in the drum grid without re-rendering the full DOM.
 */
export function renderGridState() {
    const totalSteps = gb.measures * 16;
    for (let i = 0; i < totalSteps; i++) {
        const elements = gb.cachedSteps[i];
        if (elements) {
            gb.instruments.forEach((inst, tIdx) => {
                const stepEl = elements[tIdx];
                if (stepEl) {
                    const val = inst.steps[i];
                    stepEl.classList.toggle('active', val === 1);
                    stepEl.classList.toggle('accented', val === 2);
                }
            });
        }
    }
}

/**
 * Clears all active/playing visual indicators from the DOM.
 * @param {UnifiedVisualizer|null} viz - The visualizer instance to clear.
 */
export function clearActiveVisuals(viz) {
    document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
    document.querySelectorAll('.chord-card.active').forEach(c => c.classList.remove('active'));
    if (viz) viz.clear();
}