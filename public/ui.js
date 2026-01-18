import { arranger, cb, ctx, gb, bb, sb } from './state.js';
import { midiToNote, formatUnicodeSymbols } from './utils.js';
import { saveCurrentState } from './persistence.js';
import { TIME_SIGNATURES, KEY_ORDER } from './config.js';
import { UIStore } from './ui-store.js';

// Import Componentized Logic
import { renderChordVisualizer as internalRenderChordVisualizer } from './ui-chord-visualizer.js';
import { renderGrid as internalRenderGrid, renderGridState as internalRenderGridState } from './ui-sequencer-grid.js';

export const ui = {};

export function initUI() {
    const uiMap = {
        vizPanel: 'panel-visualizer',
        chordVol: 'chordVolume',
        bassVol: 'bassVolume',
        soloistVol: 'soloistVolume',
        drumVol: 'drumVolume',
        bpmLabel: 'bpm-label',
        bpmControlGroup: 'bpmControlGroup',
        larsIndicator: 'larsIndicator',
        clearDrums: 'clearDrumsBtn',
        masterVol: 'masterVolume',
        countIn: 'countInCheck',
        metronome: 'metronomeCheck',
        visualFlash: 'visualFlashCheck',
        haptic: 'hapticCheck',
        sessionTimerCheck: 'sessionTimerCheck',
        sessionTimerInput: 'sessionTimerInput',
        sessionTimerDurationContainer: 'sessionTimerDurationContainer',

    // --- Export ---
        applyPresetSettings: 'applyPresetSettingsCheck',
        swingBase: 'swingBaseSelect',
        closeSettings: 'closeSettingsBtn'
    };

    const uiIds = [
        'playBtn', 'bpmInput', 'timeSigSelect', 'tapBtn', 'keySelect', 'relKeyBtn', 'transUpBtn', 'transDownBtn',
        'maximizeChordBtn', 'chordPowerBtn', 'groovePowerBtn', 'bassPowerBtn', 'soloistPowerBtn',
        'chordPowerBtnDesktop', 'groovePowerBtnDesktop', 'bassPowerBtnDesktop', 'soloistPowerBtnDesktop',
        'vizPowerBtn', 'sectionList', 'addSectionBtn', 'templatesBtn', 'templatesOverlay', 'templateChips', 'closeTemplatesBtn',
        'activeSectionLabel', 'arrangerActionTrigger', 'arrangerActionMenu', 'randomizeBtn', 'mutateBtn', 'undoBtn',
        'clearProgBtn', 'saveBtn', 'shareBtn', 'chordVisualizer', 'chordPresets', 'userPresetsContainer',
        'chordStylePresets', 'bassStylePresets', 'soloistStylePresets', 'groupingToggle', 'groupingLabel',
        'chordReverb', 'bassReverb', 'soloistReverb', 'drumPresets', 'userDrumPresetsContainer',
        'sequencerGrid', 'measurePagination', 'drumBarsSelect', 'cloneMeasureBtn', 'autoFollowCheck',
        'humanizeSlider', 'saveDrumBtn', 'drumReverb', 'smartDrumPresets', 'settingsOverlay', 'settingsBtn',
        'themeSelect', 'notationSelect', 'densitySelect', 'practiceModeCheck', 'swingSlider', 'exportMidiBtn',
        'settingsExportMidiBtn', 'exportOverlay', 'closeExportBtn', 'confirmExportBtn', 'exportChordsCheck',
        'exportBassCheck', 'exportSoloistCheck', 'exportDrumsCheck', 'exportDurationInput', 'exportDurationContainer',
        'exportDurationDec', 'exportDurationInc', 'exportDurationStepper',
        'exportFilenameInput', 'installAppBtn', 'flashOverlay', 'resetSettingsBtn', 'refreshAppBtn', 'editorOverlay',
        'editArrangementBtn', 'closeEditorBtn', 'intensitySlider', 'complexitySlider', 'intensityValue',
        'autoIntensityCheck', 'complexityValue', 'soloistDoubleStops', 'sessionTimerDec', 'sessionTimerInc', 'sessionTimerStepper',
        'midiEnableCheck', 'midiMuteLocalCheck', 'midiOutputSelect', 'midiChordsChannel', 'midiBassChannel', 
        'midiSoloistChannel', 'midiDrumsChannel', 'midiLatencySlider', 'midiLatencyValue', 'midiControls',
        'midiChordsOctave', 'midiBassOctave', 'midiSoloistOctave', 'midiDrumsOctave',
        'midiVelocitySlider', 'midiVelocityValue',
        'larsModeCheck', 'larsIntensitySlider', 'larsIntensityValue', 'larsIntensityContainer'
    ];

    uiIds.forEach(id => ui[id] = document.getElementById(id));
    Object.keys(uiMap).forEach(key => ui[key] = document.getElementById(uiMap[key]));
}

export function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

export function triggerFlash(intensity) {
    if (!ui.flashOverlay) return;
    ui.flashOverlay.style.opacity = intensity;
    setTimeout(() => ui.flashOverlay.style.opacity = 0, 50);
}

export function updateOctaveLabel(labelEl, octave, headerEl) {
    if (!labelEl) return;
    const { name, octave: octNum } = midiToNote(octave);
    labelEl.textContent = `${formatUnicodeSymbols(name)}${octNum}`;
    if (headerEl) headerEl.textContent = `(C${octNum})`;
}

export function renderChordVisualizer() {
    internalRenderChordVisualizer(ui);
}

export function renderSections(sections, onUpdate, onDelete, onDuplicate) {
    if (!ui.sectionList) return;
    ui.sectionList.innerHTML = '';
    sections.forEach((s) => {
        const card = document.createElement('div');
        card.className = `section-card ${s.seamless ? 'linked' : ''}`;
        card.dataset.id = s.id;
        card.draggable = true;
        
        card.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', s.id);
            card.classList.add('dragging');
        };
        card.ondragend = () => card.classList.remove('dragging');
        card.ondragover = (e) => e.preventDefault();
        card.ondrop = (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId !== s.id) {
                const draggedIdx = sections.findIndex(sec => sec.id === draggedId);
                const targetIdx = sections.findIndex(sec => sec.id === s.id);
                const newOrder = [...sections.map(sec => sec.id)];
                newOrder.splice(draggedIdx, 1);
                newOrder.splice(targetIdx, 0, draggedId);
                onUpdate(null, 'reorder', newOrder);
            }
        };

        const header = document.createElement('div');
        header.className = 'section-header';
        
        const titleRow = document.createElement('div');
        titleRow.className = 'section-title-row';

        const label = document.createElement('input');
        label.className = 'section-label-input';
        label.value = s.label;
        label.onchange = (e) => onUpdate(s.id, 'label', e.target.value);
        titleRow.appendChild(label);
        
        const controlsRow = document.createElement('div');
        controlsRow.className = 'section-controls-row';

        const sectionSettings = document.createElement('div');
        sectionSettings.className = 'section-settings-row';

        // Repeat Control
        const repeatContainer = document.createElement('div');
        repeatContainer.className = 'section-setting-item';
        repeatContainer.innerHTML = `<span class="setting-label">x</span>`;
        const repeatInput = document.createElement('input');
        repeatInput.type = 'number';
        repeatInput.className = 'section-repeat-input';
        repeatInput.value = s.repeat || 1;
        repeatInput.min = 1;
        repeatInput.max = 8;
        repeatInput.onchange = (e) => onUpdate(s.id, 'repeat', parseInt(e.target.value));
        repeatContainer.appendChild(repeatInput);

        // Key Control
        const keySelect = document.createElement('select');
        keySelect.className = 'section-key-select';
        ['Default', ...KEY_ORDER].forEach(k => {
            const opt = document.createElement('option');
            opt.value = k === 'Default' ? '' : k;
            opt.textContent = k === 'Default' ? 'Key: Auto' : `Key: ${formatUnicodeSymbols(k)}${arranger.isMinor ? 'm' : ''}`;
            if (opt.value === (s.key || '')) opt.selected = true;
            keySelect.appendChild(opt);
        });
        keySelect.onchange = (e) => onUpdate(s.id, 'key', e.target.value);

        // Time Signature Control
        const tsSelect = document.createElement('select');
        tsSelect.className = 'section-ts-select';
        ['Default', ...Object.keys(TIME_SIGNATURES)].forEach(ts => {
            const opt = document.createElement('option');
            opt.value = ts === 'Default' ? '' : ts;
            opt.textContent = ts === 'Default' ? 'TS: Auto' : `TS: ${ts}`;
            if (opt.value === (s.timeSignature || '')) opt.selected = true;
            tsSelect.appendChild(opt);
        });
        tsSelect.onchange = (e) => onUpdate(s.id, 'timeSignature', e.target.value);

        sectionSettings.appendChild(repeatContainer);
        sectionSettings.appendChild(keySelect);
        sectionSettings.appendChild(tsSelect);

        const actions = document.createElement('div');
        actions.className = 'section-actions';

        // Seamless Toggle (Link)
        const linkBtn = document.createElement('button');
        linkBtn.className = `section-link-btn ${s.seamless ? 'active' : ''}`;
        linkBtn.innerHTML = '🔗'; // Link icon
        linkBtn.title = s.seamless ? 'Unlink from previous (Enable Fills)' : 'Link to previous (Seamless Transition)';
        linkBtn.onclick = (e) => { 
            e.stopPropagation(); 
            onUpdate(s.id, 'seamless', !s.seamless); 
        };

        // Move Up/Down Buttons
        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'section-move-btn';
        moveUpBtn.innerHTML = '▴';
        moveUpBtn.title = 'Move Up';
        moveUpBtn.onclick = (e) => { e.stopPropagation(); onUpdate(s.id, 'move', -1); };

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'section-move-btn';
        moveDownBtn.innerHTML = '▾';
        moveDownBtn.title = 'Move Down';
        moveDownBtn.onclick = (e) => { e.stopPropagation(); onUpdate(s.id, 'move', 1); };
        
        const dupBtn = document.createElement('button');
        dupBtn.className = 'section-duplicate-btn';
        dupBtn.innerHTML = '⎘';
        dupBtn.title = 'Duplicate';
        dupBtn.onclick = () => onDuplicate(s.id);

        const kebabBtn = document.createElement('button');
        kebabBtn.className = 'section-kebab-btn';
        kebabBtn.innerHTML = '⋮';
        kebabBtn.title = 'Insert Symbol';
        
        const delBtn = document.createElement('button');
        delBtn.className = 'section-delete-btn';
        delBtn.innerHTML = '✕';
        delBtn.title = 'Delete';
        delBtn.onclick = () => onDelete(s.id);
        
        actions.appendChild(linkBtn); // Add the Link button
        actions.appendChild(moveUpBtn);
        actions.appendChild(moveDownBtn);
        actions.appendChild(dupBtn);
        actions.appendChild(kebabBtn);
        actions.appendChild(delBtn);

        controlsRow.appendChild(sectionSettings);
        controlsRow.appendChild(actions);

        header.appendChild(titleRow);
        header.appendChild(controlsRow);
        
        const input = document.createElement('textarea');
        input.className = 'section-prog-input';
        input.value = s.value;
        input.placeholder = 'Enter chords (e.g. C Am F G)';
        input.onchange = (e) => onUpdate(s.id, 'value', e.target.value);
        input.onfocus = () => arranger.lastInteractedSectionId = s.id;

        kebabBtn.onclick = (e) => {
            e.stopPropagation();
            
            const isAlreadyOpen = card.classList.contains('menu-active');

            // Close any existing menus and reset z-indexes
            document.querySelectorAll('.symbol-dropdown').forEach(m => m.remove());
            document.querySelectorAll('.section-card').forEach(c => c.classList.remove('menu-active'));
            
            if (isAlreadyOpen) return;

            card.classList.add('menu-active');
            const menu = document.createElement('div');
            menu.className = 'symbol-dropdown';
            
            const closeMenu = () => {
                menu.remove();
                card.classList.remove('menu-active');
                document.removeEventListener('click', closeMenu);
            };
            document.addEventListener('click', closeMenu);

            const symbols = ['|', 'maj7', 'm7', '7', 'ø', 'o', 'sus4', 'sus2', '#', 'b', ',', '-'];
            symbols.forEach(sym => {
                const btn = document.createElement('button');
                btn.className = 'symbol-btn';
                btn.textContent = sym;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const text = input.value;
                    const before = text.substring(0, start);
                    const after = text.substring(end);
                    input.value = before + sym + after;
                    input.selectionStart = input.selectionEnd = start + sym.length;
                    input.focus();
                    onUpdate(s.id, 'value', input.value);
                    closeMenu();
                };
                menu.appendChild(btn);
            });
            actions.appendChild(menu);
        };
        
        card.appendChild(header);
        card.appendChild(input);
        ui.sectionList.appendChild(card);
    });
}

export function renderGrid(skipScroll = false) {
    internalRenderGrid(ui, skipScroll);
}

export function renderGridState() {
    internalRenderGridState(ui);
}

export function clearActiveVisuals(viz) {
    document.querySelectorAll('.chord-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
    if (viz) viz.clear();
}

export function recalculateScrollOffsets() {
    const cards = document.querySelectorAll('.chord-card');
    UIStore.cardOffsets = Array.from(cards).map(card => {
        // Measure offset relative to the chordVisualizer container
        return card.offsetTop - (ui.chordVisualizer ? ui.chordVisualizer.offsetTop : 0);
    });
}

export function initTabs() {
    const mobileTabItems = document.querySelectorAll('.tab-item');
    const instrumentTabBtns = document.querySelectorAll('.instrument-tab-btn');
    
    const activateMobileTab = (item) => {
        const btn = item.querySelector('.tab-btn');
        if (!btn) return;
        const target = btn.dataset.tab;
        
        document.querySelectorAll('.tab-item .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.instrument-panel').forEach(c => c.classList.remove('active-mobile'));
        
        const content = document.getElementById(`panel-${target}`);
        if (content) content.classList.add('active-mobile');
        btn.classList.add('active');
        gb.mobileTab = target;
    };

    const activateInstrumentTab = (btn) => {
        const module = btn.dataset.module;
        const target = btn.dataset.tab;
        
        // Find panel context to scope button/content queries
        const panelId = { cb: 'chord', bb: 'bass', sb: 'soloist', gb: 'groove' }[module];
        
        // Update Buttons within the same panel
        document.querySelectorAll(`.instrument-tab-btn[data-module="${module}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update Content within the same panel
        document.querySelectorAll(`[id^="${panelId}-tab-"]`).forEach(c => c.classList.remove('active'));
        const content = document.getElementById(`${panelId}-tab-${target}`);
        if (content) content.classList.add('active');
        
        // Update State
        const stateMap = { cb, bb, sb, gb };
        if (stateMap[module]) stateMap[module].activeTab = target;
    };

    mobileTabItems.forEach(item => {
        item.onclick = () => {
            activateMobileTab(item);
            saveCurrentState();
        };
        
        const btn = item.querySelector('.tab-btn');
        if (btn && btn.dataset.tab === gb.mobileTab) {
            activateMobileTab(item);
        }
    });

    instrumentTabBtns.forEach(btn => {
        btn.onclick = () => {
            activateInstrumentTab(btn);
            saveCurrentState();
        };
        
        const module = btn.dataset.module;
        const stateMap = { cb, bb, sb, gb };
        if (btn.dataset.tab === stateMap[module].activeTab) {
            activateInstrumentTab(btn);
        }
    });
}

export function renderMeasurePagination(onSwitch) {
    if (!ui.measurePagination) return;
    ui.measurePagination.innerHTML = '';
    for (let i = 0; i < gb.measures; i++) {
        const btn = document.createElement('button');
        btn.className = 'measure-btn';
        btn.textContent = i + 1;
        if (i === gb.currentMeasure) btn.classList.add('active');
        btn.onclick = () => onSwitch(i);
        ui.measurePagination.appendChild(btn);
    }
}

export function setupPanelMenus() {
    document.querySelectorAll('.panel-menu-btn').forEach(trigger => {
        trigger.onclick = (e) => {
            e.stopPropagation();
            const panel = trigger.closest('.panel');
            const menu = panel.querySelector('.panel-settings-menu');
            if (!menu) return;

            const isOpen = menu.classList.contains('open');
            
            // Close all other menus
            document.querySelectorAll('.panel-settings-menu').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.panel-menu-btn').forEach(b => b.classList.remove('active'));

            if (!isOpen) {
                menu.classList.add('open');
                trigger.classList.add('active');
            }
        };
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.panel-settings-menu')) {
            document.querySelectorAll('.panel-settings-menu').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.panel-menu-btn').forEach(b => b.classList.remove('active'));
        }
    });
}

export function renderTemplates(templates, onApply) {
    const container = document.getElementById('templateChips');
    if (!container) return;
    
    container.innerHTML = '';
    if (!templates || !Array.isArray(templates)) return;

    templates.forEach(t => {
        const chip = document.createElement('button');
        chip.className = 'preset-chip template-chip';
        chip.type = 'button';
        chip.textContent = t.name;
        chip.dataset.category = t.category || 'Basic';
        chip.onclick = (e) => {
            e.stopPropagation();
            onApply(t);
        };
        container.appendChild(chip);
    });
}

export function createPresetChip(name, onDelete, onSelect, extraClass = '') {
    const chip = document.createElement('div');
    chip.className = `preset-chip user-preset-chip ${extraClass}`;
    
    const label = document.createElement('span');
    label.textContent = formatUnicodeSymbols(name);
    label.onclick = (e) => { e.stopPropagation(); onSelect(); };
    
    const del = document.createElement('button');
    del.className = 'delete-preset';
    del.innerHTML = '✕';
    del.onclick = (e) => { e.stopPropagation(); onDelete(); };
    
    chip.appendChild(label);
    chip.appendChild(del);
    return chip;
}

export function updateActiveChordUI(index) {
    cb.lastActiveChordIndex = index;
    const cards = document.querySelectorAll('.chord-card');
    cards.forEach((c, i) => c.classList.toggle('active', i === index));
    
    // --- 1. Arranger Scrolling ---
    if (index !== null && cards[index] && ui.chordVisualizer) {
        const card = cards[index];
        const container = ui.chordVisualizer;
        
        // Find true offset relative to container (handles nested hierarchy)
        let actualTop = 0;
        let curr = card;
        while (curr && curr !== container) {
            actualTop += curr.offsetTop;
            curr = curr.offsetParent;
        }

        const cardHeight = card.offsetHeight;
        const containerHeight = container.clientHeight;
        const currentScroll = container.scrollTop;
        
        // LOOK-AHEAD: Check if the *next* row/measure is visible
        const nextChord = cards[index + 1];
        let nextTop = actualTop;
        if (nextChord) {
            let nCurr = nextChord;
            let nTop = 0;
            while (nCurr && nCurr !== container) {
                nTop += nCurr.offsetTop;
                nCurr = nCurr.offsetParent;
            }
            nextTop = nTop;
        }

        // If the current card OR the next chord is getting close to the bottom, scroll down
        const threshold = 80; // pixels from edge
        if (actualTop < currentScroll + threshold || nextTop + cardHeight > currentScroll + containerHeight - threshold) {
            container.scrollTo({
                top: actualTop - (containerHeight / 2) + (cardHeight / 2),
                behavior: 'smooth'
            });
        }
    }

    // --- 2. Sequencer Grid Scrolling (Auto-Follow) ---
    if (gb.followPlayback && ctx.isPlaying && ui.sequencerGrid) {
        const playingSteps = ui.sequencerGrid.querySelectorAll('.step.playing');
        if (playingSteps.length > 0) {
            const firstStep = playingSteps[0];
            const container = ui.sequencerGrid;
            
            // Check horizontal bounds
            const stepLeft = firstStep.offsetLeft - container.offsetLeft;
            const stepWidth = firstStep.offsetWidth;
            const containerWidth = container.clientWidth;
            const currentScroll = container.scrollLeft;

            if (stepLeft < currentScroll + 40 || stepLeft + stepWidth > currentScroll + containerWidth - 40) {
                container.scrollTo({
                    left: stepLeft - (containerWidth / 2) + (stepWidth / 2),
                    behavior: 'smooth'
                });
            }
        }
    }
}

export function updateKeySelectLabels() {
    if (!ui.keySelect) {
        console.warn("[UI] keySelect not found");
        return;
    }
    const currentValue = ui.keySelect.value;
    Array.from(ui.keySelect.options).forEach(opt => {
        const root = opt.value;
        opt.textContent = `Key: ${formatUnicodeSymbols(root)}${arranger.isMinor ? 'm' : ''}`;
    });
    // Force browser to update the displayed label of the select
    ui.keySelect.value = currentValue;
}

export function updateRelKeyButton() {
    if (!ui.relKeyBtn) {
        console.warn("[UI] relKeyBtn not found");
        return;
    }
    const label = arranger.isMinor ? 'min' : 'maj';
    ui.relKeyBtn.textContent = label;
}

/**
 * Updates genre button classes and countdowns for pending changes.
 */
export function updateGenreUI(stepsUntilNextMeasure = 0, stepsPerBeat = 4) {
    const btns = document.querySelectorAll('.genre-btn');
    const beatsRemaining = Math.ceil(stepsUntilNextMeasure / stepsPerBeat);
    
    btns.forEach(btn => {
        const isTarget = gb.pendingGenreFeel && btn.dataset.genre === (gb.pendingGenreFeel.genreName || getGenreNameFromFeel(gb.pendingGenreFeel.feel));
        
        if (isTarget) {
            btn.classList.add('pending');
            btn.dataset.countdown = beatsRemaining > 0 ? beatsRemaining : '';
        } else {
            btn.classList.remove('pending');
            delete btn.dataset.countdown;
        }

        // Active state should reflect ACTUAL current feel
        const isActive = btn.dataset.genre === gb.lastSmartGenre && !btn.classList.contains('pending');
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function getGenreNameFromFeel(feel) {
    // Reverse lookup or mapping helper
    const map = { 'Rock': 'Rock', 'Jazz': 'Jazz', 'Funk': 'Funk', 'Disco': 'Disco', 'Blues': 'Blues', 'Neo-Soul': 'Neo-Soul', 'Reggae': 'Reggae', 'Acoustic': 'Acoustic', 'Bossa Nova': 'Bossa' };
    return map[feel] || feel;
}



