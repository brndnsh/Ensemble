import { ACTIONS } from './types.js';
import { ui, showToast, recalculateScrollOffsets, renderTemplates, updateRelKeyButton, updateKeySelectLabels, switchInstrumentTab } from './ui.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, dispatch, subscribe } from './state.js';
import { saveCurrentState } from './persistence.js';
import { restoreGains } from './engine.js';
import { syncWorker } from './worker-client.js';
import { generateId, formatUnicodeSymbols } from './utils.js';
import { DRUM_PRESETS, CHORD_PRESETS, SONG_TEMPLATES, SMART_GENRES } from './presets.js';
import { mutateProgression } from './chords.js';
import { setBpm } from './app-controller.js';
import { flushBuffers, switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, resetToDefaults, togglePower } from './instrument-controller.js';
import { validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, addSection, transposeKey, switchToRelativeKey, updateGroupingUI, initArrangerHandlers } from './arranger-controller.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { triggerInstall } from './pwa.js';
import { exportToMidi } from './midi-export.js';
import { ModalManager } from './ui-modal-controller.js';
import { applyConductor, updateBpmUI } from './conductor.js';
import { setupGenerateSongHandlers } from './ui-song-generator-controller.js';
import { setupAnalyzerHandlers } from './ui-analyzer-controller.js';

export function updateStyle(type, styleId) {
    const UPDATE_STYLE_CONFIG = {
        chord: { selector: '.chord-style-chip', module: 'chords', panelId: 'chord' },
        bass: { selector: '.bass-style-chip', module: 'bass', panelId: 'bass' },
        soloist: { selector: '.soloist-style-chip', module: 'soloist', panelId: 'soloist' },
        harmony: { selector: '.harmony-style-chip', module: 'harmony', panelId: 'harmony' }
    };
    const c = UPDATE_STYLE_CONFIG[type];
    if (!c) return;
    
    dispatch(ACTIONS.SET_STYLE, { module: c.module, style: styleId });

    // When a manual style is selected, we switch the tab to 'classic' automatically
    if (styleId !== 'smart') {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: c.module, tab: 'classic' });
        switchInstrumentTab(c.module, 'classic');
    }

    document.querySelectorAll(c.selector).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === styleId);
    });

    syncWorker();
    flushBuffers();
    restoreGains();
    saveCurrentState();
}


export function setupPresets(refs = {}) {
    const { togglePlay } = refs;
    const renderCategorized = (container, data, type, activeId, onSelect) => {
        if (!container) return;
        container.innerHTML = '';
        const sorted = [...data].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
        
        sorted.forEach(item => {
            const chip = document.createElement('div');
            const itemId = item.id || item.name;
            chip.className = `preset-chip ${type}-chip`;
            chip.textContent = formatUnicodeSymbols(item.name);
            chip.dataset.id = itemId;
            chip.dataset.category = item.category || 'Other';
            if (itemId === activeId) chip.classList.add('active');
            chip.onclick = () => onSelect(item);
            container.appendChild(chip);
        });
    };

    // [Legacy] Styles now rendered via Preact in ui-root.js
    // renderCategorized(ui.chordStylePresets, CHORD_STYLES, 'chord-style', chords.style, (item) => updateStyle('chord', item.id));
    // renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', soloist.state?.style || soloist.style, (item) => updateStyle('soloist', item.id));
    // renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bass.state?.style || bass.style, (item) => updateStyle('bass', item.id));
    // renderCategorized(ui.harmonyStylePresets, HARMONY_STYLES, 'harmony-style', harmony.style, (item) => updateStyle('harmony', item.id));

    const drumPresetsArray = Object.keys(DRUM_PRESETS).map(name => ({
        name,
        ...DRUM_PRESETS[name]
    }));
    
    const onDrumPresetSelect = (item) => {
        loadDrumPreset(item.name);
        document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll(`.drum-preset-chip[data-id="${item.name}"]`).forEach(c => c.classList.add('active'));
        groove.lastDrumPreset = item.name;
        syncWorker();
        saveCurrentState();
    };

    renderCategorized(ui.drumPresets, drumPresetsArray, 'drum-preset', groove.lastDrumPreset, onDrumPresetSelect);

    if (ui.smartDrumPresets) {
        renderCategorized(ui.smartDrumPresets, drumPresetsArray, 'drum-preset', groove.lastDrumPreset, onDrumPresetSelect);
    }

    renderCategorized(ui.chordPresets, CHORD_PRESETS, 'chord-preset', arranger.lastChordPreset, (item) => {
        if (arranger.isDirty) {
            if (!confirm("Discard your custom arrangement and load this preset?")) return;
        }

        if (playback.isPlaying && togglePlay) togglePlay();
        
        arranger.sections = item.sections.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value,
            repeat: s.repeat || 1,
            key: s.key || '',
            timeSignature: s.timeSignature || '',
            seamless: !!s.seamless
        }));
        
        arranger.isDirty = false;

        if (item.settings) {
            if (playback.applyPresetSettings) {
                if (item.settings.bpm) setBpm(item.settings.bpm, null);
                if (item.settings.style) updateStyle('chord', item.settings.style);
            }
            if (item.settings.timeSignature) {
                arranger.timeSignature = item.settings.timeSignature;
                ui.timeSigSelect.value = item.settings.timeSignature;
            }
        }

        arranger.isMinor = item.isMinor || false;
        updateRelKeyButton();
        updateKeySelectLabels();
        arranger.lastChordPreset = item.name;
        // renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        validateAndAnalyze();
        flushBuffers();
        document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
        // Find the chip we just clicked and add active class
        const targetChip = ui.chordPresets.querySelector(`.chord-preset-chip[data-id="${item.name}"]`);
        if (targetChip) targetChip.classList.add('active');
        saveCurrentState();
    });
}

export function setupUIHandlers(refs) {
    const { 
        togglePlay, saveDrumPattern
    } = refs;

    initArrangerHandlers();

    const openExportModal = () => {
        ui.arrangerActionMenu.classList.remove('open');
        ui.arrangerActionTrigger.classList.remove('active');
        ModalManager.close(ui.settingsOverlay);
        
        let defaultName = arranger.lastChordPreset || "Ensemble Export";
        defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${playback.bpm}bpm`;
        
        ModalManager.open(ui.exportOverlay);
    };

    if (ui.intensitySlider) {
        ui.intensitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_BAND_INTENSITY, val / 100);
            if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
            applyConductor();
        });

        // Reactive UI update for intensity (replaces polling)
        subscribe((action) => {
            if (action === ACTIONS.SET_BAND_INTENSITY) {
                const val = Math.round(playback.bandIntensity * 100);
                // Avoid redundant updates if the value matches (prevents UI fighting during drag)
                if (parseInt(ui.intensitySlider.value) !== val) {
                    ui.intensitySlider.value = val;
                    if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
                }
            }
        });
    }

    if (ui.complexitySlider) {
        ui.complexitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_COMPLEXITY, val / 100);
            if (ui.complexityValue) {
                let label = 'Low';
                if (val > 33) label = 'Medium';
                if (val > 66) label = 'High';
                ui.complexityValue.textContent = label;
            }
            applyConductor();
        });
    }

    if (ui.autoIntensityCheck) {
        ui.autoIntensityCheck.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_AUTO_INTENSITY, e.target.checked);
            ui.intensitySlider.disabled = playback.autoIntensity;
            if (playback.autoIntensity) {
                ui.intensitySlider.style.opacity = 0.5;
            } else {
                ui.intensitySlider.style.opacity = 1;
            }
            saveCurrentState();
        });
    }

    document.querySelectorAll('.genre-btn').forEach(btn => {
        if (btn.dataset.genre === groove.lastSmartGenre) btn.classList.add('active');
        btn.addEventListener('click', () => {
            const genre = btn.dataset.genre;
            
            if (playback.isPlaying) {
                document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('pending'));
                btn.classList.add('pending');
                showToast(`Queued ${genre} for next measure...`);
            } else {
                document.querySelectorAll('.genre-btn').forEach(b => {
                    b.classList.remove('active', 'pending');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                groove.lastSmartGenre = genre;
            }
            
            const config = SMART_GENRES[genre];
            if (config) {
                dispatch(ACTIONS.SET_GENRE_FEEL, {
                    genreName: genre,
                    feel: config.feel,
                    swing: config.swing,
                    sub: config.sub,
                    drum: config.drum,
                    chord: config.chord,
                    bass: config.bass,
                    soloist: config.soloist
                });
                
                if (!playback.isPlaying) {
                    ui.swingSlider.value = config.swing;
                    if (config.sub) ui.swingBase.value = config.sub;
                    loadDrumPreset(config.drum);
                    
                    const modules = [
                        { id: 'chord', state: chords, configKey: 'chord' },
                        { id: 'bass', state: bass, configKey: 'bass' },
                        { id: 'soloist', state: soloist, configKey: 'soloist' },
                        { id: 'harmony', state: harmony, configKey: 'harmony' }
                    ];

                    modules.forEach(m => {
                        if (m.state.activeTab === 'smart') {
                            const moduleKey = m.state === chords ? 'chords' : (m.state === bass ? 'bass' : (m.state === soloist ? 'soloist' : 'harmony'));
                            dispatch(ACTIONS.SET_STYLE, { module: moduleKey, style: 'smart' });
                            const chipSelector = { 'chord': '.chord-style-chip', 'bass': '.bass-style-chip', 'soloist': '.soloist-style-chip', 'harmony': '.harmony-style-chip' }[m.id];
                            if (chipSelector) document.querySelectorAll(chipSelector).forEach(c => c.classList.remove('active'));
                        }
                    });
                }

                saveCurrentState();
            }
        });
    });

    const listeners = [
        [ui.addSectionBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            addSection();
        }],
        [ui.templatesBtn, 'click', (e) => {
            e.stopPropagation();
            if (window.innerWidth < 900) {
                ui.arrangerActionMenu.classList.remove('open');
                ui.arrangerActionTrigger.classList.remove('active');
            }
            
            ModalManager.open(ui.templatesOverlay);
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
                showToast(`Applied template: ${template.name}`);
            });
        }],
        [ui.closeTemplatesBtn, 'click', () => {
            ModalManager.close(ui.templatesOverlay);
        }],
        [ui.undoBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            undo(refreshArrangerUI);
            clearChordPresetHighlight();
        }],
        [ui.arrangerActionTrigger, 'click', (e) => {
            e.stopPropagation();
            ui.arrangerActionMenu.classList.toggle('open');
            ui.arrangerActionTrigger.classList.toggle('active');
        }],
        [document, 'click', (e) => {
            if (ui.arrangerActionMenu.classList.contains('open') && !ui.arrangerActionMenu.contains(e.target) && e.target !== ui.arrangerActionTrigger) {
                ui.arrangerActionMenu.classList.remove('open');
                ui.arrangerActionTrigger.classList.remove('active');
            }
        }],
        [document.getElementById('analyzeAudioBtn'), 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            if (window.resetAnalyzer) window.resetAnalyzer();
            ModalManager.open(ui.analyzerOverlay);
        }],
        [ui.randomizeBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            
            setTimeout(() => {
                if (ui.generateSongOverlay) {
                    ModalManager.open(ui.generateSongOverlay);
                } else {
                    showToast("Error: Modal missing. Please refresh.");
                }
            }, 10);
        }],
        [ui.mutateBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId);
            if (!section) {
                showToast("Select a section to mutate");
                return;
            }
            pushHistory();
            section.value = mutateProgression(section.value, chords.style);
            showToast(`Mutated ${section.label}`);
            clearChordPresetHighlight();
            refreshArrangerUI();
        }],
        [ui.clearProgBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            pushHistory();
            arranger.sections = [{ id: generateId(), label: 'Intro', value: '' }];
            clearChordPresetHighlight();
            refreshArrangerUI();
        }],
        [ui.saveBtn, 'click', () => {
            saveCurrentState();
            ui.saveBtn.innerHTML = '✅ Saved';
            setTimeout(() => {
                ui.saveBtn.innerHTML = '<span>💾 Save Arrangement</span>';
            }, 2000);
        }],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.shareBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            shareProgression();
        }],
        [ui.transUpBtn, 'click', () => transposeKey(1)],
        [ui.transDownBtn, 'click', () => transposeKey(-1)],
        [ui.relKeyBtn, 'click', () => switchToRelativeKey()],
        [ui.installAppBtn, 'click', async () => {
            if (await triggerInstall()) {
                ui.installAppBtn.style.display = 'none';
            }
        }],
        [ui.settingsBtn, 'click', () => ModalManager.open(ui.settingsOverlay)],
        [ui.closeSettings, 'click', () => ModalManager.close(ui.settingsOverlay)],
        [ui.resetSettingsBtn, 'click', () => confirm("Reset all settings?") && resetToDefaults()],
        [ui.refreshAppBtn, 'click', () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(reg => {
                    if (reg) reg.update();
                });
            }
            window.location.reload();
        }],
        [ui.exportMidiBtn, 'click', openExportModal],
        [ui.settingsExportMidiBtn, 'click', openExportModal],
        [ui.closeExportBtn, 'click', () => ModalManager.close(ui.exportOverlay)],
        [ui.exportOverlay, 'click', (e) => {
            if (e.target === ui.exportOverlay) ModalManager.close(ui.exportOverlay);
        }],
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
            // renderGridState(); 
            saveCurrentState();
        }],
        [ui.maximizeChordBtn, 'click', () => {
            const isMax = document.body.classList.toggle('chord-maximized');
            ui.maximizeChordBtn.textContent = isMax ? '✕' : '⛶';
            ui.maximizeChordBtn.title = isMax ? 'Exit Maximize' : 'Maximize';
            // renderChordVisualizer();
        }]
    ];
    listeners.forEach(([el, evt, fn]) => el?.addEventListener(evt, fn));

    // --- Modal Initialization ---
    const overlays = [
        { overlay: ui.settingsOverlay, closeBtn: ui.closeSettings },
        { overlay: ui.editorOverlay, closeBtn: ui.closeEditorBtn },
        { overlay: ui.exportOverlay, closeBtn: ui.closeExportBtn },
        { overlay: ui.templatesOverlay, closeBtn: ui.closeTemplatesBtn },
        { overlay: ui.analyzerOverlay, closeBtn: ui.closeAnalyzerBtn },
        { overlay: ui.generateSongOverlay, closeBtn: ui.closeGenerateSongBtn }
    ];
    
    overlays.forEach(({ overlay, closeBtn }) => {
        ModalManager.bind(overlay, closeBtn);
        // Set initial state
        if (overlay) {
            overlay.setAttribute('aria-hidden', !overlay.classList.contains('active'));
        }
    });

    document.querySelectorAll('input[name="exportMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
             const isTime = e.target.value === 'time';
             ui.exportDurationContainer.style.opacity = isTime ? '1' : '0.5';
             ui.exportDurationContainer.style.pointerEvents = isTime ? 'auto' : 'none';
             if (ui.exportDurationStepper) {
                 ui.exportDurationStepper.style.borderColor = isTime ? 'var(--accent-color)' : 'var(--border-color)';
                 ui.exportDurationStepper.style.backgroundColor = isTime ? 'var(--card-bg)' : 'var(--input-bg)';
             }
        });
    });

    const adjustExportDuration = (delta) => {
        const current = parseInt(ui.exportDurationInput.value);
        const next = Math.max(1, Math.min(20, current + delta));
        ui.exportDurationInput.value = next;
    };

    ui.exportDurationDec.addEventListener('click', () => adjustExportDuration(-1));
    ui.exportDurationInc.addEventListener('click', () => adjustExportDuration(1));

    if (ui.editArrangementBtn) {
        ui.editArrangementBtn.addEventListener('click', () => {
            ModalManager.open(ui.editorOverlay);
        });
    }

    ui.keySelect.addEventListener('change', () => {
        arranger.key = ui.keySelect.value;
        updateRelKeyButton();
        updateKeySelectLabels();
        validateAndAnalyze();
        saveCurrentState();
    });

    ui.timeSigSelect.addEventListener('change', () => {
        arranger.timeSignature = ui.timeSigSelect.value;
        arranger.grouping = null; 
        
        if (groove.lastDrumPreset) {
            loadDrumPreset(groove.lastDrumPreset);
        }
        
        updateGroupingUI();
        validateAndAnalyze();
        saveCurrentState();
    });

    ui.notationSelect.addEventListener('change', () => {
        arranger.notation = ui.notationSelect.value;
        validateAndAnalyze();
        saveCurrentState();
    });

    if (ui.pianoRootsCheck) {
        ui.pianoRootsCheck.addEventListener('change', e => {
            dispatch(ACTIONS.SET_PIANO_ROOTS, e.target.checked);
            validateAndAnalyze();
            saveCurrentState();
        });
    }

    ui.densitySelect.addEventListener('change', e => { 
        dispatch(ACTIONS.SET_DENSITY, e.target.value); 
        validateAndAnalyze(); 
        flushBuffers(); 
        saveCurrentState();
    });

    ui.humanizeSlider.addEventListener('input', e => { groove.humanize = parseInt(e.target.value); saveCurrentState(); });
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

    if (ui.harmonyComplexity) {
        ui.harmonyComplexity.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            harmony.complexity = val;
            if (ui.harmonyComplexityValue) ui.harmonyComplexityValue.textContent = `${Math.round(val * 100)}%`;
            syncWorker();
        });
        ui.harmonyComplexity.addEventListener('change', () => saveCurrentState());
    }

    if (ui.soloistDoubleStops) {
        ui.soloistDoubleStops.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_DOUBLE_STOPS, e.target.checked);
            flushBuffers();
            syncWorker();
            saveCurrentState();
        });
    }

    if (ui.larsModeCheck) {
        const updateLarsUI = (enabled) => {
            if (ui.larsIntensityContainer) {
                ui.larsIntensityContainer.style.opacity = enabled ? '1' : '0.5';
                ui.larsIntensityContainer.style.pointerEvents = enabled ? 'auto' : 'none';
            }
        };

        ui.larsModeCheck.checked = groove.larsMode;
        updateLarsUI(groove.larsMode);
        
        ui.larsModeCheck.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_LARS_MODE, e.target.checked);
            updateLarsUI(e.target.checked);
            updateBpmUI();
            saveCurrentState();
        });
    }

    if (ui.larsIntensitySlider) {
        ui.larsIntensitySlider.value = Math.round(groove.larsIntensity * 100);
        if (ui.larsIntensityValue) ui.larsIntensityValue.textContent = `${ui.larsIntensitySlider.value}%`;

        ui.larsIntensitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_LARS_INTENSITY, val / 100);
            if (ui.larsIntensityValue) ui.larsIntensityValue.textContent = `${val}%`;
        });
        ui.larsIntensitySlider.addEventListener('change', () => saveCurrentState());
    }

    Object.keys(refs.POWER_CONFIG || {}).forEach(type => {
        const c = refs.POWER_CONFIG[type];
        c.els.forEach(el => {
            if (el) el.addEventListener('click', () => togglePower(type));
        });
    });

    document.querySelectorAll('.instrument-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const module = btn.dataset.module;
            const tab = btn.dataset.tab;
            if (tab === 'smart' && module !== 'groove') {
                dispatch(ACTIONS.SET_STYLE, { module, style: 'smart' });
                const chipSelector = { 'chords': '.chord-style-chip', 'bass': '.bass-style-chip', 'soloist': '.soloist-style-chip' }[module];
                if (chipSelector) document.querySelectorAll(chipSelector).forEach(c => c.classList.remove('active'));
                
                flushBuffers();
                syncWorker();
                saveCurrentState();
            }
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (playback.audio?.state === 'suspended' || playback.audio?.state === 'interrupted') playback.audio.resume();
        }
    });

    window.addEventListener('ensemble_state_change', saveCurrentState);

    document.addEventListener('open-editor', (e) => {
        ModalManager.open(ui.editorOverlay);
        const sectionId = e.detail?.sectionId;
        if (sectionId) {
            setTimeout(() => {
                const card = ui.sectionList.querySelector(`.section-card[data-id="${sectionId}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.borderColor = 'var(--accent-color)';
                    setTimeout(() => card.style.borderColor = '', 1000);
                }
            }, 100);
        }
    });

    window.addEventListener('keydown', e => {
        const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
        const isAnalyzerActive = ui.analyzerOverlay && ui.analyzerOverlay.classList.contains('active');
        if (e.key === ' ' && !isTyping && !isAnalyzerActive) { e.preventDefault(); togglePlay(); }
        if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) { 
            e.preventDefault(); 
            if (ui.editorOverlay.classList.contains('active')) ModalManager.close(ui.editorOverlay); 
            else ModalManager.open(ui.editorOverlay); 
        }
        if (['1', '2', '3', '4'].includes(e.key) && !isTyping) { const index = parseInt(e.key) - 1; const tabItem = document.querySelectorAll('.tab-item')[index]; if (tabItem) tabItem.click(); }
        if (e.key === '[' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (groove.currentMeasure - 1 + groove.measures) % groove.measures; switchMeasure(next); }
        if (e.key === ']' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (groove.currentMeasure + 1) % groove.measures; switchMeasure(next); }
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) { document.body.classList.remove('chord-maximized'); ui.maximizeChordBtn.textContent = '⛶'; ui.maximizeChordBtn.title = 'Maximize'; /* renderChordVisualizer(); */ }
            if (ModalManager.activeModal) ModalManager.close();
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { if (resizeTimeout) clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => recalculateScrollOffsets(), 150); });

    updateGroupingUI();
    // setupMIDIHandlers();
    setupAnalyzerHandlers();
    setupGenerateSongHandlers();
}