import { chords, playback, groove, dispatch } from './state.js';
import { ACTIONS } from './types.js';
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
    get closeEditorBtn() { return getEl('closeEditorBtn'); },
    get closeTemplatesBtn() { return getEl('closeTemplatesBtn'); },
    get closeExportBtn() { return getEl('closeExportBtn'); }
};

export function showToast(msg) {
    dispatch(ACTIONS.SHOW_TOAST, msg);
}

export function triggerFlash(intensity = 0.25) {
    dispatch(ACTIONS.TRIGGER_FLASH, intensity);
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

UIStore.initLateBounds(null, triggerFlash);