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
    progInput: document.getElementById('progressionInput'),
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
    bassNoteName: document.getElementById('bassNoteName'),
    bassNoteOctave: document.getElementById('bassNoteOctave'),
    soloistNoteName: document.getElementById('soloistNoteName'),
    soloistNoteOctave: document.getElementById('soloistNoteOctave'),
    bassPolyline: document.getElementById('bassPolyline'),
    bassChordTones: document.getElementById('bassChordTones'),
    soloistPath: document.getElementById('soloistPath'),
    soloistChordTones: document.getElementById('soloistChordTones'),
    notationSelect: document.getElementById('notationSelect'),
    countIn: document.getElementById('countInCheck'),
    swingSlider: document.getElementById('swingSlider'),
    swingBase: document.getElementById('swingBaseSelect'),
    visualFlash: document.getElementById('visualFlashCheck'),
    haptic: document.getElementById('hapticCheck'),
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
        
        if (cb.notation === 'name') div.innerHTML = chord.absName;
        else if (cb.notation === 'nns') div.innerHTML = chord.nnsName;
        else div.innerHTML = chord.romanName;
        
        measureBox.appendChild(div);
        cb.cachedCards.push(div);
        currentBeatsInBar += chord.beats;
    });
}

/**
 * Renders the drum sequencer grid.
 */
export function renderGrid() {
    ui.sequencerGrid.innerHTML = '';
    gb.cachedSteps = [];
    const fragment = document.createDocumentFragment();

    gb.instruments.forEach((inst, tIdx) => {
        const row = document.createElement('div');
        row.className = 'track';
        const header = document.createElement('div');
        header.className = 'track-header';
        header.innerHTML = `<span>${inst.symbol} <span>${inst.name}</span></span>`;
        header.style.cursor = "pointer"; if (inst.muted) header.style.opacity = 0.5;
        header.onclick = () => { inst.muted = !inst.muted; header.style.opacity = inst.muted ? 0.5 : 1; };
        row.appendChild(header);
        const stepsWrapper = document.createElement('div');
        stepsWrapper.className = 'steps-wrapper';
        for (let m = 0; m < gb.measures; m++) {
            const measureDiv = document.createElement('div'); measureDiv.className = 'steps';
            for (let b = 0; b < 16; b++) {
                const globalIdx = m * 16 + b, step = document.createElement('div');
                const active = inst.steps[globalIdx];
                step.className = `step ${active ? 'active' : ''}`; step.dataset.step = globalIdx;
                step.onclick = () => { inst.steps[globalIdx] = inst.steps[globalIdx] ? 0 : 1; renderGridState(); };
                measureDiv.appendChild(step);
                if (!gb.cachedSteps[globalIdx]) gb.cachedSteps[globalIdx] = [];
                gb.cachedSteps[globalIdx].push(step);
            }
            stepsWrapper.appendChild(measureDiv);
        }
        row.appendChild(stepsWrapper); 
        fragment.appendChild(row);
    });

    // Add beat labels row
    const labelRow = document.createElement('div');
    labelRow.className = 'track label-row';
    const labelHeader = document.createElement('div');
    labelHeader.className = 'track-header label-header';
    labelHeader.innerHTML = '<span></span>';
    labelRow.appendChild(labelHeader);

    const labelsWrapper = document.createElement('div');
    labelsWrapper.className = 'steps-wrapper';
    
    const beatLabels = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
    
    for (let m = 0; m < gb.measures; m++) {
        const measureDiv = document.createElement('div');
        measureDiv.className = 'steps label-steps';
        beatLabels.forEach((text, i) => {
            const label = document.createElement('div');
            label.className = 'step-label';
            label.textContent = text;
            if (i % 4 === 0) label.classList.add('beat-start');
            measureDiv.appendChild(label);
            
            const globalIdx = m * 16 + i;
            if (!gb.cachedSteps[globalIdx]) gb.cachedSteps[globalIdx] = [];
            gb.cachedSteps[globalIdx].push(label);
        });
        labelsWrapper.appendChild(measureDiv);
    }
    labelRow.appendChild(labelsWrapper);
    fragment.appendChild(labelRow);
    ui.sequencerGrid.appendChild(fragment);
}

/**
 * Updates only the 'active' classes in the drum grid without re-rendering the full DOM.
 */
export function renderGridState() {
    const totalSteps = gb.measures * 16;
    for (let i = 0; i < totalSteps; i++) {
        const elements = gb.cachedSteps[i];
        if (elements) {
            gb.instruments.forEach((inst, tIdx) => {
                if (elements[tIdx]) {
                    elements[tIdx].classList.toggle('active', !!inst.steps[i]);
                }
            });
        }
    }
}