import { ACTIONS } from './types.js';
import { ui } from './ui.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, dispatch } from './state.js';
import { saveCurrentState } from './persistence.js';
import { syncWorker } from './worker-client.js';
import { generateId } from './utils.js';
import { mutateProgression } from './chords.js';
import { loadDrumPreset, togglePower, switchMeasure, updateMeasures, cloneMeasure, clearDrumPresetHighlight } from './instrument-controller.js';
import { validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, addSection, transposeKey, switchToRelativeKey, updateGroupingUI, initArrangerHandlers } from './arranger-controller.js';
import { undo, pushHistory } from './history.js';
import { shareProgression } from './sharing.js';
import { triggerInstall } from './pwa.js';
import { exportToMidi } from './midi-export.js';
import { ModalManager } from './ui-modal-controller.js';
import { setupGenerateSongHandlers } from './ui-song-generator-controller.js';
import { setupAnalyzerHandlers } from './ui-analyzer-controller.js';

/**
 * Legacy UI Controller - Handles remaining imperative logic and global events.
 * Most UI logic has moved to Preact components in /components.
 */

export function setupUIHandlers(refs) {
    const { togglePlay, saveDrumPattern } = refs;

    initArrangerHandlers();

    const openExportModal = () => {
        ui.arrangerActionMenu?.classList.remove('open');
        ui.arrangerActionTrigger?.classList.remove('active');
        ModalManager.close(ui.settingsOverlay);
        
        let defaultName = arranger.lastChordPreset || "Ensemble Export";
        defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${playback.bpm}bpm`;
        
        ModalManager.open(ui.exportOverlay);
    };

    const listeners = [
        [ui.addSectionBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            addSection();
        }],
        [ui.templatesBtn, 'click', (e) => {
            e.stopPropagation();
            if (window.innerWidth < 900) {
                ui.arrangerActionMenu?.classList.remove('open');
                ui.arrangerActionTrigger?.classList.remove('active');
            }
            ModalManager.open(ui.templatesOverlay);
            // Template rendering logic is still legacy for now
            import('./ui.js').then(({ renderTemplates }) => {
                import('./presets.js').then(({ SONG_TEMPLATES }) => {
                    renderTemplates(SONG_TEMPLATES, (template) => {
                        if (arranger.isDirty) {
                            if (!confirm("Discard your custom arrangement and load this template?")) return;
                        }
                        arranger.sections = template.sections.map(s => ({
                            id: generateId(),
                            label: s.label,
                            value: s.value,
                            repeat: s.repeat || 1,
                            key: s.key || '',
                            timeSignature: s.timeSignature || '',
                            seamless: !!s.seamless
                        }));
                        arranger.isDirty = false;
                        refreshArrangerUI();
                        ModalManager.close(ui.templatesOverlay);
                    });
                });
            });
        }],
        [ui.undoBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            undo(refreshArrangerUI);
            clearChordPresetHighlight();
        }],
        [ui.arrangerActionTrigger, 'click', (e) => {
            e.stopPropagation();
            ui.arrangerActionMenu?.classList.toggle('open');
            ui.arrangerActionTrigger?.classList.toggle('active');
        }],
        [document, 'click', (e) => {
            if (ui.arrangerActionMenu?.classList.contains('open') && !ui.arrangerActionMenu.contains(e.target) && e.target !== ui.arrangerActionTrigger) {
                ui.arrangerActionMenu.classList.remove('open');
                ui.arrangerActionTrigger.classList.remove('active');
            }
        }],
        [document.getElementById('analyzeAudioBtn'), 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            if (window.resetAnalyzer) window.resetAnalyzer();
            ModalManager.open(ui.analyzerOverlay);
        }],
        [ui.randomizeBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            setTimeout(() => ModalManager.open(ui.generateSongOverlay), 10);
        }],
        [ui.mutateBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId);
            if (!section) return;
            pushHistory();
            section.value = mutateProgression(section.value);
            clearChordPresetHighlight();
            refreshArrangerUI();
        }],
        [ui.clearProgBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            pushHistory();
            arranger.sections = [{ id: generateId(), label: 'Intro', value: '' }];
            clearChordPresetHighlight();
            refreshArrangerUI();
        }],
        [ui.saveBtn, 'click', () => {
            saveCurrentState();
            const original = ui.saveBtn.innerHTML;
            ui.saveBtn.innerHTML = '✅ Saved';
            setTimeout(() => ui.saveBtn.innerHTML = original, 2000);
        }],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.shareBtn, 'click', () => {
            ui.arrangerActionMenu?.classList.remove('open');
            ui.arrangerActionTrigger?.classList.remove('active');
            shareProgression();
        }],
        [ui.installAppBtn, 'click', async () => {
            if (await triggerInstall()) ui.installAppBtn.style.display = 'none';
        }],
        [ui.settingsBtn, 'click', () => ModalManager.open(ui.settingsOverlay)],
        [ui.editArrangementBtn, 'click', () => ModalManager.open(ui.editorOverlay)],
        [ui.refreshAppBtn, 'click', () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(reg => reg?.update());
            }
            window.location.reload();
        }],
        [ui.exportMidiBtn, 'click', openExportModal],
        [ui.settingsExportMidiBtn, 'click', openExportModal],
        [ui.confirmExportBtn, 'click', () => {
            const includedTracks = [];
            if (ui.exportChordsCheck.checked) includedTracks.push('chords');
            if (ui.exportBassCheck.checked) includedTracks.push('bass');
            if (ui.exportSoloistCheck.checked) includedTracks.push('soloist');
            if (ui.exportHarmoniesCheck.checked) includedTracks.push('harmonies');
            if (ui.exportDrumsCheck.checked) includedTracks.push('drums');
            const loopMode = document.querySelector('input[name="exportMode"]:checked').value;
            const targetDuration = parseFloat(ui.exportDurationInput.value);
            const filename = ui.exportFilenameInput.value.trim();
            ModalManager.close(ui.exportOverlay);
            exportToMidi({ includedTracks, loopMode, targetDuration, filename });
        }],
        [ui.clearDrums, 'click', () => { 
            groove.instruments.forEach(i => i.steps.fill(0)); 
            clearDrumPresetHighlight();
            saveCurrentState();
        }],
        [ui.densitySelect, 'change', e => { 
            dispatch(ACTIONS.SET_DENSITY, e.target.value); 
            validateAndAnalyze(); 
            flushBuffers(); 
            saveCurrentState();
        }],
        [ui.drumBarsSelect, 'change', e => updateMeasures(e.target.value)],
        [ui.cloneMeasureBtn, 'click', cloneMeasure]
    ];

    listeners.forEach(([el, evt, fn]) => el?.addEventListener(evt, fn));

    // Power Buttons (Desktop)
    Object.keys(refs.POWER_CONFIG || {}).forEach(type => {
        refs.POWER_CONFIG[type].els.forEach(el => el?.addEventListener('click', () => togglePower(type)));
    });

    // Global Keydown
    window.addEventListener('keydown', e => {
        const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
        if (e.key === ' ' && !isTyping && !ModalManager.activeModal) { e.preventDefault(); togglePlay(); }
        if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) { 
            e.preventDefault(); 
            if (ui.editorOverlay.classList.contains('active')) ModalManager.close(ui.editorOverlay); 
            else ModalManager.open(ui.editorOverlay); 
        }
        if (['1', '2', '3', '4'].includes(e.key) && !isTyping) { 
            const tabItem = document.querySelectorAll('.tab-item')[parseInt(e.key) - 1]; 
            tabItem?.click(); 
        }
        if (e.key === '[' && !isTyping) switchMeasure((groove.currentMeasure - 1 + groove.measures) % groove.measures);
        if (e.key === ']' && !isTyping) switchMeasure((groove.currentMeasure + 1) % groove.measures);
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) {
                document.body.classList.remove('chord-maximized');
                const btn = document.getElementById('maximizeChordBtn');
                if (btn) btn.textContent = '⛶';
            }
            if (ModalManager.activeModal) ModalManager.close();
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { 
        if (resizeTimeout) clearTimeout(resizeTimeout); 
        resizeTimeout = setTimeout(() => {
            // Future UI recalculations if needed
        }, 150); 
    });

    setupAnalyzerHandlers();
    setupGenerateSongHandlers();

    // Global event for opening the editor from Preact components
    document.addEventListener('open-editor', (e) => {
        const { sectionId } = e.detail || {};
        if (sectionId) {
            arranger.lastInteractedSectionId = sectionId;
        }
        ModalManager.open(ui.editorOverlay);
    });
}
