import { arranger, chords, playback, groove, bass, soloist, harmony } from './state.js';
import { midiToNote, formatUnicodeSymbols } from './utils.js';
import { UIStore } from './ui-store.js';

const getEl = (id) => document.getElementById(id);

/**
 * Explicit UI Element References.
 * Serves as a registry for DOM elements used by secondary controllers and legacy logic.
 */
export const ui = {
    // --- Layout & Panels ---
    get vizPanel() { return getEl('panel-visualizer'); },
    get dashboardGrid() { return getEl('dashboardGrid'); },
    get larsIndicator() { return getEl('larsIndicator'); },

    // --- Playback & Transport ---
    get playBtn() { return getEl('playBtn'); },
    get playBtnText() { return getEl('playBtnText'); },
    get playBtnTimer() { return getEl('playBtnTimer'); },
    get bpmInput() { return getEl('bpmInput'); },
    get settingsBtn() { return getEl('settingsBtn'); },
    get tapBtn() { return getEl('tapBtn'); },
    
    // --- Mixer / Instrument Controls ---
    get chordVol() { return getEl('chordVolume'); },
    get bassVol() { return getEl('bassVolume'); },
    get soloistVol() { return getEl('soloistVolume'); },
    get harmonyVol() { return getEl('harmonyVolume'); },
    get drumVol() { return getEl('drumVolume'); },
    get masterVol() { return getEl('masterVolume'); },
    get chordReverb() { return getEl('chordReverb'); },
    get bassReverb() { return getEl('bassReverb'); },
    get soloistReverb() { return getEl('soloistReverb'); },
    get harmonyReverb() { return getEl('harmonyReverb'); },
    get drumReverb() { return getEl('drumReverb'); },
    get harmonyComplexity() { return getEl('harmonyComplexity'); },
    get harmonyComplexityValue() { return getEl('harmonyComplexityValue'); },
    get pianoRootsCheck() { return getEl('pianoRootsCheck'); },
    get soloistDoubleStops() { return getEl('soloistDoubleStops'); },
    get countIn() { return getEl('countInCheck'); },
    get metronome() { return getEl('metronomeCheck'); },
    get visualFlash() { return getEl('visualFlashCheck'); },
    get haptic() { return getEl('hapticCheck'); },
    
    // --- Groove / Sequencer ---
    get sequencerGrid() { return getEl('sequencerGrid'); },
    get drumBarsSelect() { return getEl('drumBarsSelect'); },
    get swingSlider() { return getEl('swingSlider'); },
    get swingBase() { return getEl('swingBaseSelect'); },
    get humanizeSlider() { return getEl('humanizeSlider'); },
    get cloneMeasureBtn() { return getEl('cloneMeasureBtn'); },
    get clearDrums() { return getEl('clearDrumsBtn'); },
    get measurePagination() { return getEl('measurePagination'); },
    
    // --- Arranger & Key ---
    get chordVisualizer() { return getEl('chordVisualizer'); },
    get keySelect() { return getEl('keySelect'); },
    get timeSigSelect() { return getEl('timeSigSelect'); },
    get notationSelect() { return getEl('notationSelect'); },
    get densitySelect() { return getEl('densitySelect'); },
    get relKeyBtn() { return getEl('relKeyBtn'); },
    get transUpBtn() { return getEl('transUpBtn'); },
    get transDownBtn() { return getEl('transDownBtn'); },
    get maximizeChordBtn() { return getEl('maximizeChordBtn'); },
    get editArrangementBtn() { return getEl('editArrangementBtn'); },
    get arrangerActionMenu() { return getEl('arrangerActionMenu'); },
    get arrangerActionTrigger() { return getEl('arrangerActionTrigger'); },
    get addSectionBtn() { return getEl('addSectionBtn'); },
    get sectionList() { return getEl('sectionList'); },
    get undoBtn() { return getEl('undoBtn'); },
    get randomizeBtn() { return getEl('randomizeBtn'); },
    get mutateBtn() { return getEl('mutateBtn'); },
    get clearProgBtn() { return getEl('clearProgBtn'); },
    get saveBtn() { return getEl('saveBtn'); },
    get saveDrumBtn() { return getEl('saveDrumBtn'); },
    get shareBtn() { return getEl('shareBtn'); },
    get templatesBtn() { return getEl('templatesBtn'); },
    get groupingToggle() { return getEl('groupingToggle'); },
    get groupingLabel() { return getEl('groupingLabel'); },
    get userPresetsContainer() { return getEl('userPresetsContainer'); },
    get userDrumPresetsContainer() { return getEl('userDrumPresetsContainer'); },
    
    // --- Analyzer ---
    get analyzeAudioBtn() { return getEl('analyzeAudioBtn'); },
    get analyzerOverlay() { return getEl('analyzerOverlay'); },
    get analyzerDropZone() { return getEl('analyzerDropZone'); },
    get analyzerFileInput() { return getEl('analyzerFileInput'); },
    get liveListenBtn() { return getEl('liveListenBtn'); },
    get stopLiveListenBtn() { return getEl('stopLiveListenBtn'); },
    get captureLiveHistoryBtn() { return getEl('captureLiveHistoryBtn'); },
    get liveListenView() { return getEl('liveListenView'); },
    get liveChordDisplay() { return getEl('liveChordDisplay'); },
    get analyzerTrimView() { return getEl('analyzerTrimView'); },
    get analyzerWaveformCanvas() { return getEl('analyzerWaveformCanvas'); },
    get analyzerSelectionOverlay() { return getEl('analyzerSelectionOverlay'); },
    get analyzerStartInput() { return getEl('analyzerStartInput'); },
    get analyzerEndInput() { return getEl('analyzerEndInput'); },
    get analyzerDurationLabel() { return getEl('analyzerDurationLabel'); },
    get startAnalysisBtn() { return getEl('startAnalysisBtn'); },
    get analyzerProcessing() { return getEl('analyzerProcessing'); },
    get analyzerProgressBar() { return getEl('analyzerProgressBar'); },
    get analyzerResults() { return getEl('analyzerResults'); },
    get analyzerSummary() { return getEl('analyzerSummary'); },
    get detectedBpmLabel() { return getEl('detectedBpmLabel'); },
    get analyzerSyncBpmCheck() { return getEl('analyzerSyncBpmCheck'); },
    get suggestedSectionsContainer() { return getEl('suggestedSectionsContainer'); },
    get applyAnalysisBtn() { return getEl('applyAnalysisBtn'); },
    get closeAnalyzerBtn() { return getEl('closeAnalyzerBtn'); },

    // --- Generate Song ---
    get generateSongOverlay() { return getEl('generateSongOverlay'); },
    get confirmGenerateSongBtn() { return getEl('confirmGenerateSongBtn'); },
    get closeGenerateSongBtn() { return getEl('closeGenerateSongBtn'); },
    get genKeySelect() { return getEl('genKeySelect'); },
    get genTimeSigSelect() { return getEl('genTimeSigSelect'); },
    get genStructureSelect() { return getEl('genStructureSelect'); },
    
    // --- Power Buttons ---
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
    
    // --- Smart Controls ---
    get intensitySlider() { return getEl('intensitySlider'); },
    get intensityValue() { return getEl('intensityValue'); },
    get autoIntensityCheck() { return getEl('autoIntensityCheck'); },
    get complexitySlider() { return getEl('complexitySlider'); },
    get complexityValue() { return getEl('complexityValue'); },
    
    // --- MIDI ---
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
    
    // --- Modals & Overlays ---
    get settingsOverlay() { return getEl('settingsOverlay'); },
    get exportOverlay() { return getEl('exportOverlay'); },
    get editorOverlay() { return getEl('editorOverlay'); },
    get templatesOverlay() { return getEl('templatesOverlay'); },
    get flashOverlay() { return getEl('flashOverlay'); },
    get closeSettings() { return getEl('closeSettingsBtn'); },
    get closeEditorBtn() { return getEl('closeEditorBtn'); },
    get closeTemplatesBtn() { return getEl('closeTemplatesBtn'); },
    get closeExportBtn() { return getEl('closeExportBtn'); },
    
    // --- Form Inputs in Modals ---
    get exportFilenameInput() { return getEl('exportFilenameInput'); },
    get exportDurationInput() { return getEl('exportDurationInput'); },
    get exportDurationContainer() { return getEl('exportDurationContainer'); },
    get exportDurationStepper() { return getEl('exportDurationStepper'); },
    get exportDurationDec() { return getEl('exportDurationDec'); },
    get exportDurationInc() { return getEl('exportDurationInc'); },
    get confirmExportBtn() { return getEl('confirmExportBtn'); },
    get exportChordsCheck() { return getEl('exportChordsCheck'); },
    get exportBassCheck() { return getEl('exportBassCheck'); },
    get exportSoloistCheck() { return getEl('exportSoloistCheck'); },
    get exportHarmoniesCheck() { return getEl('exportHarmoniesCheck'); },
    get exportDrumsCheck() { return getEl('exportDrumsCheck'); },
    
    // --- System ---
    get themeSelect() { return getEl('themeSelect'); },
    get sessionTimerCheck() { return getEl('sessionTimerCheck'); },
    get sessionTimerInput() { return getEl('sessionTimerInput'); },
    get sessionTimerDurationContainer() { return getEl('sessionTimerDurationContainer'); },
    get applyPresetSettings() { return getEl('applyPresetSettingsCheck'); },
    get installAppBtn() { return getEl('installAppBtn'); },
    get resetSettingsBtn() { return getEl('resetSettingsBtn'); },
    get refreshAppBtn() { return getEl('refreshAppBtn'); },
    get settingsExportMidiBtn() { return getEl('settingsExportMidiBtn'); }
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

export function triggerFlash(intensity = 0.25) {
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

export function clearActiveVisuals(viz) {
    document.querySelectorAll('.chord-card.active').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
    if (viz) viz.clear();
}

/**
 * Renders measure pagination buttons for the drum sequencer.
 */
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

/**
 * Legacy template chip rendering.
 */
export function renderTemplates(templates, onApply) {
    const container = document.getElementById('templateChips');
    if (!container) return;
    container.innerHTML = '';
    if (!templates || !Array.isArray(templates)) return;
    templates.forEach(t => {
        const chip = document.createElement('button');
        chip.className = 'preset-chip template-chip';
        chip.type = 'button';
        chip.textContent = formatUnicodeSymbols(t.name);
        chip.dataset.category = t.category || 'Basic';
        chip.onclick = (e) => { e.stopPropagation(); onApply(t); };
        container.appendChild(chip);
    });
}

/**
 * Helper to create a user preset chip.
 */
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

/**
 * Highlights the current active chord and handles auto-scrolling.
 */
export function updateActiveChordUI(index) {
    chords.lastActiveChordIndex = index;
    const cards = document.querySelectorAll('.chord-card');
    cards.forEach((c, i) => c.classList.toggle('active', i === index));
    
    if (index !== null && cards[index] && ui.chordVisualizer) {
        const card = cards[index];
        const container = ui.chordVisualizer;
        let actualTop = 0;
        let curr = card;
        while (curr && curr !== container) { actualTop += curr.offsetTop; curr = curr.offsetParent; }
        const cardHeight = card.offsetHeight;
        const containerHeight = container.clientHeight;
        const currentScroll = container.scrollTop;
        const nextChord = cards[index + 1];
        let nextTop = actualTop;
        if (nextChord) {
            let nCurr = nextChord;
            let nTop = 0;
            while (nCurr && nCurr !== container) { nTop += nCurr.offsetTop; nCurr = nCurr.offsetParent; }
            nextTop = nTop;
        }
        const threshold = 80; 
        if (actualTop < currentScroll + threshold || nextTop + cardHeight > currentScroll + containerHeight - threshold) {
            container.scrollTo({ top: actualTop - (containerHeight / 2) + (cardHeight / 2), behavior: 'smooth' });
        }
    }

    if (groove.followPlayback && playback.isPlaying && ui.sequencerGrid) {
        const playingSteps = ui.sequencerGrid.querySelectorAll('.step.playing');
        if (playingSteps.length > 0) {
            const firstStep = playingSteps[0];
            const container = ui.sequencerGrid;
            const stepLeft = firstStep.offsetLeft - container.offsetLeft;
            const stepWidth = firstStep.offsetWidth;
            const containerWidth = container.clientWidth;
            const currentScroll = container.scrollLeft;
            if (stepLeft < currentScroll + 40 || stepLeft + stepWidth > currentScroll + containerWidth - 40) {
                container.scrollTo({ left: stepLeft - (containerWidth / 2) + (stepWidth / 2), behavior: 'smooth' });
            }
        }
    }
}

export function updateKeySelectLabels() {
    if (!ui.keySelect) return;
    const currentValue = ui.keySelect.value;
    Array.from(ui.keySelect.options).forEach(opt => {
        opt.textContent = `${formatUnicodeSymbols(opt.value)}${arranger.isMinor ? 'm' : ''}`;
    });
    ui.keySelect.value = currentValue;
}

export function updateRelKeyButton() {
    if (ui.relKeyBtn) ui.relKeyBtn.textContent = arranger.isMinor ? 'min' : 'maj';
}

export function updateRelKeyButtonState() {
    updateRelKeyButton();
}

/**
 * Updates genre buttons active/pending states.
 */
export function updateGenreUI(stepsUntilNextMeasure = 0, stepsPerBeat = 4) {
    const btns = document.querySelectorAll('.genre-btn');
    const beatsRemaining = Math.ceil(stepsUntilNextMeasure / stepsPerBeat);
    btns.forEach(btn => {
        const isTarget = groove.pendingGenreFeel && btn.dataset.genre === groove.pendingGenreFeel.genreName;
        if (isTarget) {
            btn.classList.add('pending');
            btn.dataset.countdown = beatsRemaining > 0 ? beatsRemaining : '';
        } else {
            btn.classList.remove('pending');
            delete btn.dataset.countdown;
        }
        const isActive = btn.dataset.genre === groove.lastSmartGenre && !btn.classList.contains('pending');
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    if (ui.pianoRootsCheck && ui.pianoRootsCheck.parentElement) {
        ui.pianoRootsCheck.parentElement.style.display = bass.enabled ? 'none' : 'flex';
        ui.pianoRootsCheck.checked = chords.pianoRoots;
    }
}

export function recalculateScrollOffsets() {
    UIStore.cardOffsets = UIStore.cachedCards.map(card => {
        return card.offsetTop - (ui.chordVisualizer ? ui.chordVisualizer.offsetTop : 0);
    });
}

export function switchInstrumentTab(module, target) {
    const panelId = { 
        chords: 'chord', bass: 'bass', soloist: 'soloist', harmony: 'harmony', groove: 'groove',
        cb: 'chord', bb: 'bass', sb: 'soloist', hb: 'harmony', gb: 'groove',
        chord: 'chord', grooves: 'groove', harmonies: 'harmony'
    }[module];
    
    if (!panelId) return;

    const buttons = document.querySelectorAll(`.instrument-tab-btn[data-module="${module}"]`);
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
    
    const classicTab = document.getElementById(`${panelId}-tab-classic`);
    const smartTab = document.getElementById(`${panelId}-tab-smart`);
    
    if (classicTab && smartTab) {
        classicTab.classList.toggle('active', target === 'classic');
        smartTab.classList.toggle('active', target === 'smart');
    }
    
    const stateMap = { chords, bass, soloist, harmony, groove };
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
            import('./worker-client.js').then(({ syncWorker }) => syncWorker());
            import('./persistence.js').then(({ saveCurrentState }) => saveCurrentState());
        };
        
        const btn = item.querySelector('.tab-btn');
        if (btn && btn.dataset.tab === groove.mobileTab) {
            activateMobileTab(item);
        }
    });
}

export function setupPanelMenus() {
    document.querySelectorAll('.panel-menu-btn').forEach(trigger => {
        trigger.onclick = (e) => {
            e.stopPropagation();
            const panel = trigger.closest('.panel');
            const menu = panel.querySelector('.panel-settings-menu');
            if (!menu) return;

            const isOpen = menu.classList.contains('open');
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

UIStore.initLateBounds(null, triggerFlash);
