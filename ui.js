import { midiToNote } from './utils.js';
import { cb, gb, arranger } from './state.js';
import { clearDrumPresetHighlight } from './main.js';

export const ui = {
    playBtn: document.getElementById('playBtn'),
    bpmInput: document.getElementById('bpmInput'),
    tapBtn: document.getElementById('tapBtn'),
    keySelect: document.getElementById('keySelect'),
    relKeyBtn: document.getElementById('relKeyBtn'),
    transUpBtn: document.getElementById('transUpBtn'),
    transDownBtn: document.getElementById('transDownBtn'),
    maximizeChordBtn: document.getElementById('maximizeChordBtn'),
    chordPowerBtn: document.getElementById('chordPowerBtn'),
    groovePowerBtn: document.getElementById('groovePowerBtn'),
    bassPowerBtn: document.getElementById('bassPowerBtn'),
    soloistPowerBtn: document.getElementById('soloistPowerBtn'),
    chordPowerBtnDesktop: document.getElementById('chordPowerBtnDesktop'),
    groovePowerBtnDesktop: document.getElementById('groovePowerBtnDesktop'),
    bassPowerBtnDesktop: document.getElementById('bassPowerBtnDesktop'),
    soloistPowerBtnDesktop: document.getElementById('soloistPowerBtnDesktop'),
    vizPowerBtn: document.getElementById('vizPowerBtn'),
    vizPanel: document.getElementById('panel-visualizer'),
    sectionList: document.getElementById('sectionList'),
    addSectionBtn: document.getElementById('addSectionBtn'),
    templatesBtn: document.getElementById('templatesBtn'),
    templatesContainer: document.getElementById('templatesContainer'),
    templateChips: document.getElementById('templateChips'),
    activeSectionLabel: document.getElementById('activeSectionLabel'),
    arrangerActionTrigger: document.getElementById('arrangerActionTrigger'),
    arrangerActionMenu: document.getElementById('arrangerActionMenu'),
    randomizeBtn: document.getElementById('randomizeBtn'),
    mutateBtn: document.getElementById('mutateBtn'),
    undoBtn: document.getElementById('undoBtn'),
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
    measurePagination: document.getElementById('measurePagination'),
    drumBarsSelect: document.getElementById('drumBarsSelect'),
    cloneMeasureBtn: document.getElementById('cloneMeasureBtn'),
    autoFollowCheck: document.getElementById('autoFollowCheck'),
    humanizeSlider: document.getElementById('humanizeSlider'),
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
    themeSelect: document.getElementById('themeSelect'),
    notationSelect: document.getElementById('notationSelect'),
    densitySelect: document.getElementById('densitySelect'),
    countIn: document.getElementById('countInCheck'),
    metronome: document.getElementById('metronomeCheck'),
    swingSlider: document.getElementById('swingSlider'),
    swingBase: document.getElementById('swingBaseSelect'),
    visualFlash: document.getElementById('visualFlashCheck'),
    haptic: document.getElementById('hapticCheck'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
    flashOverlay: document.getElementById('flashOverlay'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    editorOverlay: document.getElementById('editorOverlay'),
    editArrangementBtn: document.getElementById('editArrangementBtn'),
    closeEditorBtn: document.getElementById('closeEditorBtn')
};

export function setupPanelMenus() {
    document.querySelectorAll('.panel-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = btn.closest('.dashboard-panel');
            const menu = panel.querySelector('.panel-settings-menu');
            
            // Close other open menus first
            document.querySelectorAll('.panel-settings-menu.open').forEach(m => {
                if (m !== menu) {
                    m.classList.remove('open');
                    const otherBtn = m.closest('.dashboard-panel').querySelector('.panel-menu-btn');
                    if (otherBtn) otherBtn.classList.remove('active');
                }
            });

            menu.classList.toggle('open');
            btn.classList.toggle('active');
        });
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.panel-settings-menu') && !e.target.closest('.panel-menu-btn')) {
            document.querySelectorAll('.panel-settings-menu.open').forEach(menu => {
                menu.classList.remove('open');
                const btn = menu.closest('.dashboard-panel').querySelector('.panel-menu-btn');
                if (btn) btn.classList.remove('active');
            });
        }
    });
}

export function initTabs() {
    const tabItems = document.querySelectorAll('.mobile-tabs-nav .tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't switch tabs if the power button was clicked
            if (e.target.classList.contains('power-btn')) return;

            const btn = item.querySelector('.tab-btn');
            if (!btn) return;

            // Remove active state from all buttons in mobile nav
            document.querySelectorAll('.mobile-tabs-nav .tab-btn').forEach(b => b.classList.remove('active'));
            // Hide all instrument panels on mobile
            document.querySelectorAll('.instrument-panel').forEach(c => c.classList.remove('active-mobile'));
            
            // Activate clicked button
            btn.classList.add('active');
            
            // Show target panel
            const targetId = btn.dataset.target;
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active-mobile');
        });
    });
}

let toastTimeout = null;
export function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = msg;
    toast.classList.add('show');
    
    if (toastTimeout) clearTimeout(toastTimeout);
    
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toastTimeout = null;
    }, 2500);
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
 * Smoothly animates an element's height when its content changes.
 * @param {HTMLElement} el - The element to animate.
 * @param {Function} updateCallback - The function that updates the element's content.
 */
function animateHeight(el, updateCallback) {
    const beforeHeight = el.offsetHeight;
    // Temporarily disable any transitions to get an accurate "after" height
    const originalTransition = el.style.transition;
    el.style.transition = 'none';
    
    updateCallback();
    
    const afterHeight = el.offsetHeight;
    if (beforeHeight === afterHeight) {
        el.style.transition = originalTransition;
        return;
    }

    // Reset to start height
    el.style.height = beforeHeight + 'px';
    el.style.overflow = 'hidden';
    
    // Force reflow
    el.offsetHeight; 
    
    // Animate to end height
    el.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.height = afterHeight + 'px';
    
    const onEnd = (e) => {
        if (e.propertyName === 'height') {
            el.style.height = '';
            el.style.overflow = '';
            el.style.transition = originalTransition;
            el.removeEventListener('transitionend', onEnd);
        }
    };
    el.addEventListener('transitionend', onEnd);
}

/**
 * Renders the song structure templates as clickable chips.
 * @param {Array} templates 
 * @param {Function} onSelect 
 */
export function renderTemplates(templates, onSelect) {
    ui.templateChips.innerHTML = '';
    templates.forEach(t => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip';
        chip.style.borderColor = 'var(--accent-color)';
        chip.textContent = t.name;
        chip.onclick = () => onSelect(t);
        ui.templateChips.appendChild(chip);
    });
}

/**
 * Renders the list of section inputs.
 * @param {Array} sections - The sections data.
 * @param {Function} onUpdate - Callback when a section is updated (id, field, value).
 * @param {Function} onDelete - Callback when a section is deleted (id).
 * @param {Function} onDuplicate - Callback when a section is duplicated (id).
 */
export function renderSections(sections, onUpdate, onDelete, onDuplicate) {
    const panel = document.getElementById('panel-arranger');
    
    const updateLogic = () => {
        ui.sectionList.innerHTML = '';
        sections.forEach((section, index) => {
            const card = document.createElement('div');
            card.className = 'section-card';
            card.dataset.id = section.id;
            card.dataset.index = index;
            // Removed card.draggable = true;
            if (section.color) card.style.borderLeft = `4px solid ${section.color}`;

            const header = document.createElement('div');
            header.className = 'section-header';
            
            // Drag Handle
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = '⠿';
            dragHandle.draggable = true;
            dragHandle.title = 'Drag to reorder';
            
            // Drag and Drop Listeners on Handle
            dragHandle.addEventListener('dragstart', (e) => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', index);
                e.dataTransfer.effectAllowed = 'move';
            });

            // Allow dropping on the card itself (the drop target is usually the container/card)
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const draggingEl = document.querySelector('.dragging');
                if (draggingEl && draggingEl !== card) {
                    const rect = card.getBoundingClientRect();
                    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                    ui.sectionList.insertBefore(draggingEl, next ? card.nextSibling : card);
                }
            });

            dragHandle.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                // Calculate new order and notify main.js
                const newOrder = Array.from(ui.sectionList.querySelectorAll('.section-card'))
                    .map(el => el.dataset.id);
                onUpdate(null, 'reorder', newOrder);
            });

            const labelGroup = document.createElement('div');
            labelGroup.style.display = 'flex';
            labelGroup.style.alignItems = 'center';
            labelGroup.style.gap = '0.5rem';
            labelGroup.style.flexGrow = '1';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = section.color || '#3b82f6';
            colorInput.style.width = '24px';
            colorInput.style.height = '24px';
            colorInput.style.padding = '0';
            colorInput.style.border = 'none';
            colorInput.style.background = 'transparent';
            colorInput.style.cursor = 'pointer';
            colorInput.oninput = (e) => onUpdate(section.id, 'color', e.target.value);

            const labelInput = document.createElement('input');
            labelInput.className = 'section-label-input';
            labelInput.value = section.label;
            labelInput.placeholder = 'Section Name';
            labelInput.oninput = (e) => {
                arranger.lastInteractedSectionId = section.id;
                onUpdate(section.id, 'label', e.target.value);
            };
            labelInput.onfocus = () => arranger.lastInteractedSectionId = section.id;
            
            labelGroup.appendChild(colorInput);
            labelGroup.appendChild(labelInput);

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '0.5rem';

            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'section-move-btn';
            moveUpBtn.innerHTML = '↑';
            moveUpBtn.title = 'Move Up';
            moveUpBtn.onclick = () => onUpdate(section.id, 'move', -1);

            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'section-move-btn';
            moveDownBtn.innerHTML = '↓';
            moveDownBtn.title = 'Move Down';
            moveDownBtn.onclick = () => onUpdate(section.id, 'move', 1);

            const duplicateBtn = document.createElement('button');
            duplicateBtn.className = 'section-duplicate-btn';
            duplicateBtn.innerHTML = '⧉';
            duplicateBtn.title = 'Duplicate Section';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'section-delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Delete Section';
            deleteBtn.onclick = () => onDelete(section.id);

            const kebabBtn = document.createElement('button');
            kebabBtn.className = 'section-kebab-btn';
            kebabBtn.innerHTML = '&#8942;'; // Vertical ellipsis
            kebabBtn.title = 'Insert Symbols';

            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            dropdown.style.display = 'none';
            
            const symbols = [
                { s: '|', t: 'Bar' }, { s: 'maj7', t: 'maj7' }, { s: 'm7', t: 'm7' }, { s: '7', t: '7' },
                { s: 'ø', t: 'Half-Dim' }, { s: 'o', t: 'Dim' }, { s: 'sus4', t: 'sus4' }, { s: 'add9', t: 'add9' },
                { s: 'b', t: 'Flat' }, { s: '#', t: 'Sharp' }, { s: 'maj9', t: 'maj9' }, { s: 'm9', t: 'm9' }
            ];

            symbols.forEach(sym => {
                const btn = document.createElement('button');
                btn.className = 'symbol-btn';
                btn.textContent = sym.s;
                btn.title = sym.t;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const input = card.querySelector('.section-prog-input');
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const scrollTop = input.scrollTop; // Save scroll
                    const text = input.value;
                    const before = text.substring(0, start);
                    const after = text.substring(end, text.length);
                    // Add space for bar lines
                    const insert = sym.s === '|' ? ' | ' : sym.s;
                    input.value = before + insert + after;
                    
                    const newPos = start + insert.length;
                    input.focus();
                    input.setSelectionRange(newPos, newPos);
                    input.scrollTop = scrollTop; // Restore scroll
                    
                    onUpdate(section.id, 'value', input.value);
                };
                dropdown.appendChild(btn);
            });

            kebabBtn.onclick = (e) => {
                e.stopPropagation();
                const isVisible = dropdown.style.display === 'grid';
                // Close all other dropdowns
                document.querySelectorAll('.symbol-dropdown').forEach(d => d.style.display = 'none');
                dropdown.style.display = isVisible ? 'none' : 'grid';
            };

            // Close on outside click
            window.addEventListener('click', () => dropdown.style.display = 'none', { once: true });
            
            header.appendChild(dragHandle); // Add drag handle first
            header.appendChild(labelGroup);
            actions.appendChild(moveUpBtn);
            actions.appendChild(moveDownBtn);
            actions.appendChild(duplicateBtn);
            actions.appendChild(kebabBtn);
            if (sections.length > 1) actions.appendChild(deleteBtn);
            actions.appendChild(dropdown); // Move dropdown inside relative container
            header.appendChild(actions);
            
            const progInput = document.createElement('textarea');
            progInput.className = 'section-prog-input';
            progInput.value = section.value;
            progInput.placeholder = 'I | IV | V...';
            progInput.spellcheck = false;
            progInput.oninput = (e) => {
                arranger.lastInteractedSectionId = section.id;
                onUpdate(section.id, 'value', e.target.value);
            };
            progInput.onfocus = () => arranger.lastInteractedSectionId = section.id;
            
            card.appendChild(header);
            card.appendChild(progInput);

            const progressContainer = document.createElement('div');
            progressContainer.className = 'section-progress-container';
            const progressFill = document.createElement('div');
            progressFill.className = 'section-progress-fill';
            progressContainer.appendChild(progressFill);
            card.appendChild(progressContainer);

            ui.sectionList.appendChild(card);
        });
    };
    
    // updateLogic handles the actual rendering of the section list
    updateLogic();
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
    const panel = document.getElementById('panel-arranger');
    
    const updateLogic = () => {
        ui.chordVisualizer.innerHTML = '';
        arranger.cachedCards = [];
        if (arranger.progression.length === 0) return;

        let currentSectionId = null;
        let sectionBlock = null;
        let sectionContent = null;
        let measureBox = null;
        let currentBeatsInBar = 0;

        arranger.progression.forEach((chord, i) => {
            // New Section Handling
            if (chord.sectionId !== currentSectionId) {
                currentSectionId = chord.sectionId;
                
                sectionBlock = document.createElement('div');
                sectionBlock.className = 'section-block';
                sectionBlock.onclick = () => {
                    document.dispatchEvent(new CustomEvent('open-editor', { detail: { sectionId: currentSectionId } }));
                };
                
                // Use section color for subtle background
                const section = arranger.sections.find(s => s.id === chord.sectionId);
                if (section && section.color) {
                    sectionBlock.style.background = `${section.color}10`; // Very low opacity
                    sectionBlock.style.borderColor = `${section.color}20`;
                }

                const header = document.createElement('div');
                header.className = 'section-block-header';
                if (section && section.color) header.style.color = section.color;
                header.textContent = chord.sectionLabel || "Untitled Section";
                sectionBlock.appendChild(header);

                sectionContent = document.createElement('div');
                sectionContent.className = 'section-block-content';
                sectionBlock.appendChild(sectionContent);

                ui.chordVisualizer.appendChild(sectionBlock);
                
                // Force new measure box at start of section
                measureBox = document.createElement('div');
                measureBox.className = 'measure-box';
                sectionContent.appendChild(measureBox);
                currentBeatsInBar = 0;
            }

            // Standard Measure Handling
            if (currentBeatsInBar >= 4) {
                measureBox = document.createElement('div');
                measureBox.className = 'measure-box';
                sectionContent.appendChild(measureBox);
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
            div.onclick = (e) => {
                e.stopPropagation();
                window.previewChord(i);
            };
            
            measureBox.appendChild(div);
            arranger.cachedCards.push(div);
            currentBeatsInBar += chord.beats;
        });

        // Cache dimensions
        setTimeout(() => {
            const container = ui.chordVisualizer;
            arranger.cardOffsets = arranger.cachedCards.map(card => card.offsetTop - container.offsetTop);
            arranger.cardHeights = arranger.cachedCards.map(card => card.clientHeight);
        }, 100);
    };

    if (panel) {
        animateHeight(panel, updateLogic);
    } else {
        updateLogic();
    }
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
    header.title = inst.name;
    header.innerHTML = `<span>${inst.symbol}</span>`;
    header.style.cursor = "pointer"; 
    if (inst.muted) header.style.opacity = 0.5;
    header.onclick = () => { inst.muted = !inst.muted; header.style.opacity = inst.muted ? 0.5 : 1; };
    row.appendChild(header);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'steps';
    
    const offset = gb.currentMeasure * 16;
    for (let b = 0; b < 16; b++) {
        const globalIdx = offset + b;
        const step = document.createElement('div');
        const val = inst.steps[globalIdx];
        step.className = `step ${val === 2 ? 'accented' : (val === 1 ? 'active' : '')}`; 
        if (b % 4 === 0) step.classList.add('beat-marker');
        step.onclick = () => { 
            inst.steps[globalIdx] = (inst.steps[globalIdx] + 1) % 3; 
            clearDrumPresetHighlight();
            renderGridState(); 
            // Trigger persistence
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('ensemble_state_change'));
            }
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
 * Renders the pagination controls for drum measures.
 */
export function renderMeasurePagination(onSwitch) {
    ui.measurePagination.innerHTML = '';
    for (let i = 0; i < gb.measures; i++) {
        const btn = document.createElement('button');
        btn.className = `measure-btn ${gb.currentMeasure === i ? 'active' : ''}`;
        btn.textContent = i + 1;
        btn.onclick = () => onSwitch(i);
        ui.measurePagination.appendChild(btn);
    }
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
    const offset = gb.currentMeasure * 16;
    for (let i = 0; i < 16; i++) {
        const globalIdx = offset + i;
        const elements = gb.cachedSteps[i];
        if (elements) {
            gb.instruments.forEach((inst, tIdx) => {
                const stepEl = elements[tIdx];
                if (stepEl) {
                    const val = inst.steps[globalIdx];
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