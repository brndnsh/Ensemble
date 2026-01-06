import { midiToNote } from './utils.js';
import { cb, gb, arranger } from './state.js';

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
    arrangerPanel: document.getElementById('arrangerPanel'),
    accompanistPanel: document.getElementById('accompanistPanel'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    sectionList: document.getElementById('sectionList'),
    addSectionBtn: document.getElementById('addSectionBtn'),
    activeSectionLabel: document.getElementById('activeSectionLabel'),
    dupMeasureChordBtn: document.getElementById('dupMeasureChordBtn'),
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

export function initTabs() {
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't switch tabs if the power button was clicked
            if (e.target.classList.contains('power-btn')) return;

            const btn = item.querySelector('.tab-btn');
            if (!btn) return;

            ui.tabBtns.forEach(b => b.classList.remove('active'));
            ui.tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const target = document.getElementById(`tab-${btn.dataset.tab}`);
            if (target) target.classList.add('active');
        });
    });
}

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
 * Renders the list of section inputs.
 * @param {Array} sections - The sections data.
 * @param {Function} onUpdate - Callback when a section is updated (id, field, value).
 * @param {Function} onDelete - Callback when a section is deleted (id).
 * @param {Function} onDuplicate - Callback when a section is duplicated (id).
 */
export function renderSections(sections, onUpdate, onDelete, onDuplicate) {
    ui.sectionList.innerHTML = '';
    sections.forEach(section => {
        const card = document.createElement('div');
        card.className = 'section-card';
        card.dataset.id = section.id;
        
        const header = document.createElement('div');
        header.className = 'section-header';
        
        const labelInput = document.createElement('input');
        labelInput.className = 'section-label-input';
        labelInput.value = section.label;
        labelInput.placeholder = 'Section Name';
        labelInput.oninput = (e) => onUpdate(section.id, 'label', e.target.value);
        
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '0.5rem';

        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'section-duplicate-btn';
        duplicateBtn.innerHTML = '⧉';
        duplicateBtn.title = 'Duplicate Section';
        duplicateBtn.onclick = () => onDuplicate(section.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'section-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete Section';
        deleteBtn.onclick = () => onDelete(section.id);
        
        header.appendChild(labelInput);
        actions.appendChild(duplicateBtn);
        if (sections.length > 1) actions.appendChild(deleteBtn);
        header.appendChild(actions);
        
        const progInput = document.createElement('textarea');
        progInput.className = 'section-prog-input';
        progInput.value = section.value;
        progInput.placeholder = 'I | IV | V...';
        progInput.spellcheck = false;
        progInput.oninput = (e) => onUpdate(section.id, 'value', e.target.value);
        
        card.appendChild(header);
        card.appendChild(progInput);
        ui.sectionList.appendChild(card);
    });
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
    arranger.cachedCards = [];
    if (arranger.progression.length === 0) return;

    let measureBox = document.createElement('div');
    measureBox.className = 'measure-box';
    ui.chordVisualizer.appendChild(measureBox);
    
    let currentBeatsInBar = 0;

    arranger.progression.forEach((chord, i) => {
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
        if (arranger.notation === 'name') displayData = chord.display.abs;
        else if (arranger.notation === 'nns') displayData = chord.display.nns;
        else displayData = chord.display.rom;

        div.appendChild(createChordLabel(displayData));
        
        div.onclick = () => window.previewChord(i);
        
        measureBox.appendChild(div);
        arranger.cachedCards.push(div);
        currentBeatsInBar += chord.beats;
    });

    // Cache dimensions for efficient scrolling without reflows
    setTimeout(() => {
        arranger.cardOffsets = arranger.cachedCards.map(card => card.offsetTop - ui.chordVisualizer.offsetTop);
        arranger.cardHeights = arranger.cachedCards.map(card => card.clientHeight);
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

function createTrackRow(inst, cachedSteps) {
    const row = document.createElement('div');
    row.className = 'track';
    
    const header = document.createElement('div');
    header.className = 'track-header';
    header.innerHTML = `<span>${inst.symbol} <span>${inst.name}</span></span>`;
    header.style.cursor = "pointer"; 
    if (inst.muted) header.style.opacity = 0.5;
    header.onclick = () => { inst.muted = !inst.muted; header.style.opacity = inst.muted ? 0.5 : 1; };
    row.appendChild(header);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'steps';
    
    for (let b = 0; b < 16; b++) {
        const step = document.createElement('div');
        const val = inst.steps[b];
        step.className = `step ${val === 2 ? 'accented' : (val === 1 ? 'active' : '')}`; 
        if (b % 4 === 0) step.classList.add('beat-marker');
        step.onclick = () => { 
            inst.steps[b] = (inst.steps[b] + 1) % 3; 
            renderGridState(); 
        };
        stepsContainer.appendChild(step);
        
        if (!cachedSteps[b]) cachedSteps[b] = [];
        cachedSteps[b].push(step);
    }
    row.appendChild(stepsContainer);
    return row;
}

function createLabelRow(cachedSteps) {
    const labelRow = document.createElement('div');
    labelRow.className = 'track label-row';
    
    const labelHeader = document.createElement('div');
    labelHeader.className = 'track-header label-header';
    labelHeader.innerHTML = '<span></span>';
    labelRow.appendChild(labelHeader);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'steps label-steps';
    
    const beatLabels = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
    
    beatLabels.forEach((text, i) => {
        const label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = text;
        if (i % 4 === 0) label.classList.add('beat-start');
        stepsContainer.appendChild(label);
        
        if (!cachedSteps[i]) cachedSteps[i] = [];
        cachedSteps[i].push(label);
    });
    labelRow.appendChild(stepsContainer);
    return labelRow;
}

/**
 * Renders the drum sequencer grid.
 */
export function renderGrid() {
    ui.sequencerGrid.innerHTML = '';
    gb.cachedSteps = [];
    const fragment = document.createDocumentFragment();

    gb.instruments.forEach((inst) => {
        fragment.appendChild(createTrackRow(inst, gb.cachedSteps));
    });

    fragment.appendChild(createLabelRow(gb.cachedSteps));
    ui.sequencerGrid.appendChild(fragment);
}

/**
 * Updates only the 'active' and 'accented' classes in the drum grid without re-rendering the full DOM.
 */
export function renderGridState() {
    for (let i = 0; i < 16; i++) {
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
    document.querySelectorAll('.section-card.active').forEach(s => s.classList.remove('active'));
    if (viz) viz.clear();
}