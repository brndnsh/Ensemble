import { arranger, chords, playback, groove, bass, soloist, harmony, dispatch } from './state.js';
import { ACTIONS } from './types.js';
import { midiToNote, formatUnicodeSymbols } from './utils.js';
import { saveCurrentState } from './persistence.js';
import { syncWorker } from './worker-client.js';
import { TIME_SIGNATURES, KEY_ORDER } from './config.js';
import { UIStore } from './ui-store.js';

// Import Componentized Logic
import { renderChordVisualizer as internalRenderChordVisualizer } from './ui-chord-visualizer.js';
import { renderGrid as internalRenderGrid, renderGridState as internalRenderGridState, initSequencerHandlers as internalInitSequencerHandlers } from './ui-sequencer-grid.js';

const getEl = (id) => document.getElementById(id);

/**
 * Explicit UI Element References.
 * Replaces the previous Proxy implementation to ensuring all dependencies are searchable.
 */
export const ui = {
    // --- Aliases (formerly ID_ALIASES) ---
    get vizPanel() { return getEl('panel-visualizer'); },
    get chordVol() { return getEl('chordVolume'); },
    get bassVol() { return getEl('bassVolume'); },
    get soloistVol() { return getEl('soloistVolume'); },
    get harmonyVol() { return getEl('harmonyVolume'); },
    get drumVol() { return getEl('drumVolume'); },
    get harmonyComplexity() { return getEl('harmonyComplexity'); },
    get harmonyComplexityValue() { return getEl('harmonyComplexityValue'); },
    get bpmLabel() { return getEl('bpm-label'); },
    get bpmControlGroup() { return getEl('bpmControlGroup'); },
    get larsIndicator() { return getEl('larsIndicator'); },
    get vizToggleBtn() { return getEl('vizToggleBtn'); },
    get clearDrums() { return getEl('clearDrumsBtn'); },
    get masterVol() { return getEl('masterVolume'); },
    get countIn() { return getEl('countInCheck'); },
    get metronome() { return getEl('metronomeCheck'); },
    get visualFlash() { return getEl('visualFlashCheck'); },
    get haptic() { return getEl('hapticCheck'); },
    get sessionTimerCheck() { return getEl('sessionTimerCheck'); },
    get sessionTimerInput() { return getEl('sessionTimerInput'); },
    get sessionTimerDurationContainer() { return getEl('sessionTimerDurationContainer'); },
    get applyPresetSettings() { return getEl('applyPresetSettingsCheck'); },
    get swingBase() { return getEl('swingBaseSelect'); },
    get closeSettings() { return getEl('closeSettingsBtn'); },
    get sessionTimerDec() { return getEl('sessionTimerDec'); },
    get sessionTimerInc() { return getEl('sessionTimerInc'); },
    get sessionTimerStepper() { return getEl('sessionTimerStepper'); },

    // --- Direct IDs (Extracted from usage analysis) ---
    get playBtn() { return getEl('playBtn'); },
    get playBtnText() { return getEl('playBtnText'); },
    get playBtnTimer() { return getEl('playBtnTimer'); },
    get dashboardGrid() { return getEl('dashboardGrid'); },
    get sequencerGrid() { return getEl('sequencerGrid'); },
    get intensitySlider() { return getEl('intensitySlider'); },
    get intensityValue() { return getEl('intensityValue'); },
    get userPresetsContainer() { return getEl('userPresetsContainer'); },
    get userDrumPresetsContainer() { return getEl('userDrumPresetsContainer'); },
    get drumBarsSelect() { return getEl('drumBarsSelect'); },
    get swingSlider() { return getEl('swingSlider'); },
    get chordPowerBtn() { return getEl('chordPowerBtn'); },
    get chordPowerBtnDesktop() { return getEl('chordPowerBtnDesktop'); },
    get groovePowerBtn() { return getEl('groovePowerBtn'); },
    get groovePowerBtnDesktop() { return getEl('groovePowerBtnDesktop'); },
    get bassPowerBtn() { return getEl('bassPowerBtn'); },
    get bassPowerBtnDesktop() { return getEl('bassPowerBtnDesktop'); },
    get soloistPowerBtn() { return getEl('soloistPowerBtn'); },
    get soloistPowerBtnDesktop() { return getEl('soloistPowerBtnDesktop'); },
    get harmonyPowerBtn() { return getEl('harmonyPowerBtn'); },
    get harmonyPowerBtnDesktop() { return getEl('harmonyPowerBtnDesktop'); },
    get vizPowerBtn() { return getEl('vizPowerBtn'); },
    get bpmInput() { return getEl('bpmInput'); },
    get keySelect() { return getEl('keySelect'); },
    get timeSigSelect() { return getEl('timeSigSelect'); },
    get notationSelect() { return getEl('notationSelect'); },
    get densitySelect() { return getEl('densitySelect'); },
    get chordReverb() { return getEl('chordReverb'); },
    get bassReverb() { return getEl('bassReverb'); },
    get soloistReverb() { return getEl('soloistReverb'); },
    get harmonyReverb() { return getEl('harmonyReverb'); },
    get drumReverb() { return getEl('drumReverb'); },
    get humanizeSlider() { return getEl('humanizeSlider'); },
    get autoIntensityCheck() { return getEl('autoIntensityCheck'); },
    get soloistDoubleStops() { return getEl('soloistDoubleStops'); },
    get complexitySlider() { return getEl('complexitySlider'); },
    get complexityValue() { return getEl('complexityValue'); },
    get themeSelect() { return getEl('themeSelect'); },
    get flashOverlay() { return getEl('flashOverlay'); },
    get sectionList() { return getEl('sectionList'); },
    get measurePagination() { return getEl('measurePagination'); },
    get chordVisualizer() { return getEl('chordVisualizer'); },
    get pianoRootsCheck() { return getEl('pianoRootsCheck'); },
    get relKeyBtn() { return getEl('relKeyBtn'); },
    get chordStylePresets() { return getEl('chordStylePresets'); },
    get soloistStylePresets() { return getEl('soloistStylePresets'); },
    get bassStylePresets() { return getEl('bassStylePresets'); },
    get harmonyStylePresets() { return getEl('harmonyStylePresets'); },
    get drumPresets() { return getEl('drumPresets'); },
    get smartDrumPresets() { return getEl('smartDrumPresets'); },
    get chordPresets() { return getEl('chordPresets'); },
    get arrangerActionMenu() { return getEl('arrangerActionMenu'); },
    get arrangerActionTrigger() { return getEl('arrangerActionTrigger'); },
    get settingsOverlay() { return getEl('settingsOverlay'); },
    get exportFilenameInput() { return getEl('exportFilenameInput'); },
    get exportOverlay() { return getEl('exportOverlay'); },
    get tapBtn() { return getEl('tapBtn'); },
    get addSectionBtn() { return getEl('addSectionBtn'); },
    get templatesBtn() { return getEl('templatesBtn'); },
    get templatesOverlay() { return getEl('templatesOverlay'); },
    get closeTemplatesBtn() { return getEl('closeTemplatesBtn'); },
    get undoBtn() { return getEl('undoBtn'); },
    get randomizeBtn() { return getEl('randomizeBtn'); },
    get mutateBtn() { return getEl('mutateBtn'); },
    get clearProgBtn() { return getEl('clearProgBtn'); },
    get saveBtn() { return getEl('saveBtn'); },
    get saveDrumBtn() { return getEl('saveDrumBtn'); },
    get shareBtn() { return getEl('shareBtn'); },
    get transUpBtn() { return getEl('transUpBtn'); },
    get transDownBtn() { return getEl('transDownBtn'); },
    get installAppBtn() { return getEl('installAppBtn'); },
    get settingsBtn() { return getEl('settingsBtn'); },
    get resetSettingsBtn() { return getEl('resetSettingsBtn'); },
    get refreshAppBtn() { return getEl('refreshAppBtn'); },
    get exportMidiBtn() { return getEl('exportMidiBtn'); },
    get settingsExportMidiBtn() { return getEl('settingsExportMidiBtn'); },
    get closeExportBtn() { return getEl('closeExportBtn'); },
    get confirmExportBtn() { return getEl('confirmExportBtn'); },
    get exportChordsCheck() { return getEl('exportChordsCheck'); },
    get exportBassCheck() { return getEl('exportBassCheck'); },
    get exportSoloistCheck() { return getEl('exportSoloistCheck'); },
    get exportHarmoniesCheck() { return getEl('exportHarmoniesCheck'); },
    get exportDrumsCheck() { return getEl('exportDrumsCheck'); },
    get exportDurationInput() { return getEl('exportDurationInput'); },
    get maximizeChordBtn() { return getEl('maximizeChordBtn'); },
    get exportDurationContainer() { return getEl('exportDurationContainer'); },
    get exportDurationStepper() { return getEl('exportDurationStepper'); },
    get exportDurationDec() { return getEl('exportDurationDec'); },
    get exportDurationInc() { return getEl('exportDurationInc'); },
    get editArrangementBtn() { return getEl('editArrangementBtn'); },
    get editorOverlay() { return getEl('editorOverlay'); },
    get closeEditorBtn() { return getEl('closeEditorBtn'); },
    get groupingLabel() { return getEl('groupingLabel'); },
    get cloneMeasureBtn() { return getEl('cloneMeasureBtn'); },
    get larsModeCheck() { return getEl('larsModeCheck'); },
    get larsIntensityContainer() { return getEl('larsIntensityContainer'); },
    get larsIntensitySlider() { return getEl('larsIntensitySlider'); },
    get larsIntensityValue() { return getEl('larsIntensityValue'); },
    get analyzeAudioBtn() { return getEl('analyzeAudioBtn'); },
    get closeAnalyzerBtn() { return getEl('closeAnalyzerBtn'); },
    get analyzerOverlay() { return getEl('analyzerOverlay'); },
    get analyzerDropZone() { return getEl('analyzerDropZone'); },
    get analyzerFileInput() { return getEl('analyzerFileInput'); },
    get liveListenContainer() { return getEl('liveListenContainer'); },
    get analyzerTrimView() { return getEl('analyzerTrimView'); },
    get analyzerProcessing() { return getEl('analyzerProcessing'); },
    get analyzerResults() { return getEl('analyzerResults'); },
    get analyzerProgressBar() { return getEl('analyzerProgressBar'); },
    get analyzerWaveformCanvas() { return getEl('analyzerWaveformCanvas'); },
    get analyzerStartInput() { return getEl('analyzerStartInput'); },
    get analyzerEndInput() { return getEl('analyzerEndInput'); },
    get analyzerSelectionOverlay() { return getEl('analyzerSelectionOverlay'); },
    get analyzerDurationLabel() { return getEl('analyzerDurationLabel'); },
    get bpmChips() { return getEl('bpmChips'); },
    get suggestedSectionsContainer() { return getEl('suggestedSectionsContainer'); },
    get analyzerSummary() { return getEl('analyzerSummary'); },
    get detectedBpmLabel() { return getEl('detectedBpmLabel'); },
    get analyzerSyncBpmCheck() { return getEl('analyzerSyncBpmCheck'); },
    get liveListenBtn() { return getEl('liveListenBtn'); },
    get liveListenView() { return getEl('liveListenView'); },
    get liveHistoryDisplay() { return getEl('liveHistoryDisplay'); },
    get liveChordDisplay() { return getEl('liveChordDisplay'); },
    get stopLiveListenBtn() { return getEl('stopLiveListenBtn'); },
    get startAnalysisBtn() { return getEl('startAnalysisBtn'); },
    get applyAnalysisBtn() { return getEl('applyAnalysisBtn'); },
    get midiEnableCheck() { return getEl('midiEnableCheck'); },
    get midiMuteLocalCheck() { return getEl('midiMuteLocalCheck'); },
    get midiOutputSelect() { return getEl('midiOutputSelect'); },
    get midiLatencySlider() { return getEl('midiLatencySlider'); },
    get midiLatencyValue() { return getEl('midiLatencyValue'); },
    get midiVelocitySlider() { return getEl('midiVelocitySlider'); },
    get midiVelocityValue() { return getEl('midiVelocityValue'); },
    get midiChordsChannel() { return getEl('midiChordsChannel'); },
    get midiBassChannel() { return getEl('midiBassChannel'); },
    get midiSoloistChannel() { return getEl('midiSoloistChannel'); },
    get midiHarmonyChannel() { return getEl('midiHarmonyChannel'); },
    get midiDrumsChannel() { return getEl('midiDrumsChannel'); },
    get midiChordsOctave() { return getEl('midiChordsOctave'); },
    get midiBassOctave() { return getEl('midiBassOctave'); },
    get midiSoloistOctave() { return getEl('midiSoloistOctave'); },
    get midiHarmonyOctave() { return getEl('midiHarmonyOctave'); },
    get midiDrumsOctave() { return getEl('midiDrumsOctave'); },
    get midiControls() { return getEl('midiControls'); },
    get groupingToggle() { return getEl('groupingToggle'); }
};

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

            const symbols = ['|', 'maj7', 'm7', '7', 'ø', 'o', 'aug', 'aug7', 'sus4', 'sus2', '#', 'b', ',', '-'];
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

export function initSequencerHandlers() {
    internalInitSequencerHandlers(ui);
}

export function clearActiveVisuals(viz) {
    UIStore.cachedCards.forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
    if (viz) viz.clear();
}

export function recalculateScrollOffsets() {
    UIStore.cardOffsets = UIStore.cachedCards.map(card => {
        // Measure offset relative to the chordVisualizer container
        return card.offsetTop - (ui.chordVisualizer ? ui.chordVisualizer.offsetTop : 0);
    });
}

export function switchInstrumentTab(module, target) {
    const panelId = { 
        chords: 'chord', bass: 'bass', soloist: 'soloist', harmony: 'harmony', groove: 'groove',
        cb: 'chord', bb: 'bass', sb: 'soloist', hb: 'harmony', gb: 'groove',
        chord: 'chord', grooves: 'groove', harmonies: 'harmony'
    }[module];
    
    if (!panelId) {
        return;
    }

    // Update Buttons
    const buttons = document.querySelectorAll(`.instrument-tab-btn[data-module="${module}"]`);
    buttons.forEach(b => {
        b.classList.toggle('active', b.dataset.tab === target);
    });
    
    // Update Content
    const classicId = `${panelId}-tab-classic`;
    const smartId = `${panelId}-tab-smart`;
    const classicTab = document.getElementById(classicId);
    const smartTab = document.getElementById(smartId);
    
    if (classicTab && smartTab) {
        classicTab.classList.toggle('active', target === 'classic');
        smartTab.classList.toggle('active', target === 'smart');
    }
    
    // Update State
    const stateMap = { 
        chords, bass, soloist, harmony, groove, 
        cb: chords, bb: bass, sb: soloist, hb: harmony, gb: groove,
        grooves: groove, harmonies: harmony
    };
    if (stateMap[module]) stateMap[module].activeTab = target;
}

export function initTabs() {
    const mobileTabItems = document.querySelectorAll('.tab-item');
    
    const activateMobileTab = (item) => {
        const btn = item.querySelector('.tab-btn');
        if (!btn) return;
        const target = btn.dataset.tab;
        
        document.querySelectorAll('.tab-item .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.instrument-panel').forEach(c => c.classList.remove('active-mobile'));
        
        const content = document.getElementById(`panel-${target}`);
        if (content) content.classList.add('active-mobile');
        btn.classList.add('active');
        groove.mobileTab = target;
    };

    mobileTabItems.forEach(item => {
        item.onclick = () => {
            activateMobileTab(item);
            syncWorker();
            saveCurrentState();
        };
        
        const btn = item.querySelector('.tab-btn');
        if (btn && btn.dataset.tab === groove.mobileTab) {
            activateMobileTab(item);
        }
    });

    if (ui.dashboardGrid) {
        ui.dashboardGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.instrument-tab-btn');
            if (!btn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const module = btn.dataset.module;
            const target = btn.dataset.tab;
            dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab: target });
            switchInstrumentTab(module, target);
            syncWorker();
            saveCurrentState();
        });
    }

    // Initial Sync for all buttons
    document.querySelectorAll('.instrument-tab-btn').forEach(btn => {
        const module = btn.dataset.module;
        const stateMap = { 
            chords, bass, soloist, harmony, groove, 
            cb: chords, bb: bass, sb: soloist, hb: harmony, gb: groove,
            grooves: groove, harmonies: harmony
        };
        if (stateMap[module] && btn.dataset.tab === stateMap[module].activeTab) {
            switchInstrumentTab(module, btn.dataset.tab);
        }
    });
}

export function renderMeasurePagination(onSwitch) {
    if (!ui.measurePagination) return;
    ui.measurePagination.innerHTML = '';
    for (let i = 0; i < groove.measures; i++) {
        const btn = document.createElement('button');
        btn.className = 'measure-btn';
        btn.textContent = i + 1;
        if (i === groove.currentMeasure) btn.classList.add('active');
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
    chords.lastActiveChordIndex = index;
    const cards = UIStore.cachedCards;
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
    if (groove.followPlayback && playback.isPlaying && ui.sequencerGrid) {
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
        opt.textContent = `${formatUnicodeSymbols(root)}${arranger.isMinor ? 'm' : ''}`;
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
        const isTarget = groove.pendingGenreFeel && btn.dataset.genre === (groove.pendingGenreFeel.genreName || getGenreNameFromFeel(groove.pendingGenreFeel.feel));
        
        if (isTarget) {
            btn.classList.add('pending');
            btn.dataset.countdown = beatsRemaining > 0 ? beatsRemaining : '';
        } else {
            btn.classList.remove('pending');
            delete btn.dataset.countdown;
        }

        // Active state should reflect ACTUAL current feel
        const isActive = btn.dataset.genre === groove.lastSmartGenre && !btn.classList.contains('pending');
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // --- Lane Protection: Toggle Visibility ---
    // If Virtual Bass is ON, Piano Roots should be hidden or disabled to prevent clutter.
    if (ui.pianoRootsCheck && ui.pianoRootsCheck.parentElement) {
        const isBassOn = bass.enabled;
        const container = ui.pianoRootsCheck.parentElement;
        container.style.display = isBassOn ? 'none' : 'flex';
        ui.pianoRootsCheck.checked = chords.pianoRoots;
    }
}

function getGenreNameFromFeel(feel) {
    // Reverse lookup or mapping helper
    const map = { 'Rock': 'Rock', 'Jazz': 'Jazz', 'Funk': 'Funk', 'Disco': 'Disco', 'Blues': 'Blues', 'Neo-Soul': 'Neo-Soul', 'Reggae': 'Reggae', 'Acoustic': 'Acoustic', 'Bossa Nova': 'Bossa' };
    return map[feel] || feel;
}



