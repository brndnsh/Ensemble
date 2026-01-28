import { ACTIONS } from './types.js';
import { ui, showToast, renderChordVisualizer, renderSections, renderGridState, recalculateScrollOffsets, renderTemplates, updateRelKeyButton, updateKeySelectLabels, switchInstrumentTab } from './ui.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, dispatch, subscribe } from './state.js';
import { saveCurrentState } from './persistence.js';
import { restoreGains, initAudio } from './engine.js';
import { syncWorker } from './worker-client.js';
import { generateId, formatUnicodeSymbols, normalizeKey, escapeHTML } from './utils.js';
import { CHORD_STYLES, SOLOIST_STYLES, BASS_STYLES, HARMONY_STYLES, DRUM_PRESETS, CHORD_PRESETS, SONG_TEMPLATES } from './presets.js';
import { mutateProgression } from './chords.js';
import { generateSong } from './song-generator.js';
import { setBpm } from './app-controller.js';
import { flushBuffers, switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, resetToDefaults, togglePower } from './instrument-controller.js';
import { onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, addSection, transposeKey, switchToRelativeKey, updateGroupingUI, initArrangerHandlers } from './arranger-controller.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { triggerInstall } from './pwa.js';
import { exportToMidi } from './midi-export.js';
import { ModalManager } from './ui-modal-controller.js';
import { applyConductor, updateBpmUI } from './conductor.js';
import { initTransportHandlers } from './ui-transport-controller.js';
import { initMixerHandlers } from './ui-mixer-controller.js';
import { initSettingsHandlers, setupMIDIHandlers } from './ui-settings-controller.js';

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

const SMART_GENRES = {
    'Rock': { swing: 0, sub: '8th', drum: 'Basic Rock', feel: 'Rock', chord: 'smart', bass: 'rock', soloist: 'shred', harmony: 'smart' },
    'Jazz': { swing: 60, sub: '8th', drum: 'Jazz', feel: 'Jazz', chord: 'jazz', bass: 'quarter', soloist: 'bird', harmony: 'horns' },
    'Funk': { swing: 15, sub: '16th', drum: 'Funk', feel: 'Funk', chord: 'funk', bass: 'funk', soloist: 'blues', harmony: 'horns' },
    'Disco': { swing: 0, sub: '16th', drum: 'Disco', feel: 'Disco', chord: 'smart', bass: 'disco', soloist: 'disco', harmony: 'smart' },
    'Hip Hop': { swing: 25, sub: '16th', drum: 'Hip Hop', feel: 'Hip Hop', chord: 'smart', bass: 'neo', soloist: 'neo', harmony: 'smart' },
    'Blues': { swing: 100, sub: '8th', drum: 'Blues Shuffle', feel: 'Blues', chord: 'jazz', bass: 'quarter', soloist: 'blues', harmony: 'horns' },
    'Neo-Soul': { swing: 30, sub: '16th', drum: 'Neo-Soul', feel: 'Neo-Soul', chord: 'smart', bass: 'neo', soloist: 'neo', harmony: 'strings' },
    'Reggae': { swing: 20, sub: '16th', drum: 'Reggae', feel: 'Reggae', chord: 'smart', bass: 'dub', soloist: 'minimal', harmony: 'smart' },
    'Acoustic': { swing: 15, sub: '8th', drum: 'Acoustic', feel: 'Acoustic', chord: 'pad', bass: 'half', soloist: 'minimal', harmony: 'strings' },
    'Bossa': { swing: 0, sub: '16th', drum: 'Bossa Nova', feel: 'Bossa Nova', chord: 'jazz', bass: 'bossa', soloist: 'bossa', harmony: 'strings' },
    'Country': { swing: 55, sub: '16th', drum: 'Country (Two-Step)', feel: 'Country', chord: 'strum-country', bass: 'country', soloist: 'country', harmony: 'smart' },
    'Metal': { swing: 0, sub: '16th', drum: 'Metal (Speed)', feel: 'Metal', chord: 'power-metal', bass: 'metal', soloist: 'metal', harmony: 'smart' }
};

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

    renderCategorized(ui.chordStylePresets, CHORD_STYLES, 'chord-style', chords.style, (item) => updateStyle('chord', item.id));
    renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', soloist.state?.style || soloist.style, (item) => updateStyle('soloist', item.id));
    renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bass.state?.style || bass.style, (item) => updateStyle('bass', item.id));
    renderCategorized(ui.harmonyStylePresets, HARMONY_STYLES, 'harmony-style', harmony.style, (item) => updateStyle('harmony', item.id));

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
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
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

    initTransportHandlers(refs);
    initMixerHandlers();
    initSettingsHandlers();
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
        [ui.transUpBtn, 'click', () => transposeKey(1, updateRelKeyButton)],
        [ui.transDownBtn, 'click', () => transposeKey(-1, updateRelKeyButton)],
        [ui.relKeyBtn, 'click', () => switchToRelativeKey(updateRelKeyButton)],
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
            renderGridState(); 
            saveCurrentState();
        }],
        [ui.maximizeChordBtn, 'click', () => {
            const isMax = document.body.classList.toggle('chord-maximized');
            ui.maximizeChordBtn.textContent = isMax ? '✕' : '⛶';
            ui.maximizeChordBtn.title = isMax ? 'Exit Maximize' : 'Maximize';
            renderChordVisualizer();
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
            if (document.body.classList.contains('chord-maximized')) { document.body.classList.remove('chord-maximized'); ui.maximizeChordBtn.textContent = '⛶'; ui.maximizeChordBtn.title = 'Maximize'; renderChordVisualizer(); }
            if (ModalManager.activeModal) ModalManager.close();
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { if (resizeTimeout) clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => recalculateScrollOffsets(), 150); });

    updateGroupingUI();
    setupMIDIHandlers();
    setupAnalyzerHandlers();
    setupGenerateSongHandlers();
}

export function setupGenerateSongHandlers() {
    if (!ui.generateSongOverlay) return;

    ui.confirmGenerateSongBtn.addEventListener('click', () => {
        const key = ui.genKeySelect.value;
        const timeSignature = ui.genTimeSigSelect.value;
        const structure = ui.genStructureSelect.value;

        // Seeding logic
        let seed = null;
        if (ui.genSeedCheck && ui.genSeedCheck.checked) {
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId) || arranger.sections[0];
            if (section && section.value) {
                seed = {
                    type: ui.genSeedTypeSelect.value,
                    value: section.value
                };
            } else {
                showToast("No section found to seed from.");
            }
        }

        const newSections = generateSong({ key, timeSignature, structure, seed });

        pushHistory();

        if (arranger.isDirty && arranger.sections.length > 1) {
            if (!confirm("Replace current arrangement with generated song?")) return;
        }

        arranger.sections = newSections;
        
        // Update global arranger state to match the generated song's first section details
        // (Since generateSong returns uniform key/ts for the whole song usually)
        if (newSections.length > 0) {
            const first = newSections[0];
            if (first.key && first.key !== 'Random') {
                arranger.key = first.key;
                ui.keySelect.value = normalizeKey(first.key);
                updateKeySelectLabels();
                updateRelKeyButton();
            }
            if (first.timeSignature && first.timeSignature !== 'Random') {
                arranger.timeSignature = first.timeSignature;
                ui.timeSigSelect.value = first.timeSignature;
                updateGroupingUI();
            }
        }

        arranger.isMinor = false; // Reset to Major if not specified

        arranger.isDirty = true; // generated content is "dirty" vs a saved preset
        clearChordPresetHighlight();
        refreshArrangerUI();
        validateAndAnalyze(); // Ensure playback engine is updated
        
        ModalManager.close(ui.generateSongOverlay);
        showToast("Generated new song!");
    });
}

export function setupAnalyzerHandlers() {
    if (!ui.analyzeAudioBtn) {
        console.warn("[Analyzer] analyzeAudioBtn not found in UI registry.");
        return;
    }

    // --- Mode Toggle Logic ---
    const updateModeUI = () => {
        document.querySelectorAll('.mode-option').forEach(l => {
            const input = l.querySelector('input');
            if (input.checked) {
                l.style.background = 'var(--accent-color)';
                l.style.color = 'white';
                l.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            } else {
                l.style.background = 'transparent';
                l.style.color = 'var(--text-secondary)';
                l.style.boxShadow = 'none';
            }
        });
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;
        const liveTitle = document.querySelector('#liveListenView h4');
        if (liveTitle) liveTitle.textContent = mode === 'melody' ? 'Listening for Melody...' : 'Listening for Chords...';
        
        // Update Title
        const modalTitle = document.querySelector('.analyzer-body h3');
        if (modalTitle) modalTitle.textContent = mode === 'melody' ? 'Melody Harmonizer' : 'Audio Chord Analyzer';
    };
    
    document.querySelectorAll('input[name="analyzerMode"]').forEach(radio => {
        radio.addEventListener('change', updateModeUI);
    });
    // Init state
    updateModeUI();

    ui.analyzerOverlay.addEventListener('modal-closed', () => {
        stopLiveListen();
    });

    let detectedChords = [];
    let currentAudioBuffer = null;
    let currentFileName = "";

    const resetAnalyzer = () => {
        ui.analyzerDropZone.style.display = 'block';
        if (ui.liveListenContainer) ui.liveListenContainer.style.display = 'flex';
        ui.analyzerTrimView.style.display = 'none';
        ui.analyzerProcessing.style.display = 'none';
        ui.analyzerResults.style.display = 'none';
        ui.analyzerProgressBar.style.width = '0%';
        ui.analyzerFileInput.value = '';
        currentAudioBuffer = null;
        detectedChords = [];

        if (ui.liveKeyLabel) ui.liveKeyLabel.textContent = "Key: --";
        if (ui.liveForceKeyCheck) ui.liveForceKeyCheck.checked = false;
        if (ui.analyzerCurrentKeyLabel) ui.analyzerCurrentKeyLabel.textContent = formatUnicodeSymbols(arranger.key || 'C');
        if (ui.analyzerForceKeyCheck) ui.analyzerForceKeyCheck.checked = false;
    };
    window.resetAnalyzer = resetAnalyzer;

    const drawWaveform = (buffer) => {
        // console.log("[Analyzer] Drawing waveform...");
        const canvas = ui.analyzerWaveformCanvas;
        const canvasCtx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.warn("[Analyzer] Canvas dimensions are zero, skipping draw.");
            return;
        }

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        const width = canvas.width;
        const height = canvas.height;
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        canvasCtx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        canvasCtx.clearRect(0, 0, width, height);
        
        // Draw baseline
        canvasCtx.strokeStyle = 'rgba(255,255,255,0.1)';
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, amp);
        canvasCtx.lineTo(width, amp);
        canvasCtx.stroke();

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            canvasCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
        
        drawSelectionOverlay();
        // console.log("[Analyzer] Waveform draw complete.");
    };

    const drawSelectionOverlay = () => {

    };

    const updateSelectionUI = () => {
        if (!currentAudioBuffer) return;
        const duration = currentAudioBuffer.duration;
        const start = parseFloat(ui.analyzerStartInput.value) || 0;
        const end = parseFloat(ui.analyzerEndInput.value) || duration;
        
        const leftPct = (start / duration) * 100;
        const widthPct = ((end - start) / duration) * 100;
        
        ui.analyzerSelectionOverlay.style.left = `${leftPct}%`;
        ui.analyzerSelectionOverlay.style.width = `${widthPct}%`;
    };

    const handleFile = async (file) => {
        // console.log(`[Analyzer] Handling file: ${file.name} (${file.size} bytes)`);
        ui.analyzerDropZone.style.display = 'none';
        if (ui.liveListenContainer) ui.liveListenContainer.style.display = 'none';
        ui.analyzerProcessing.style.display = 'block'; 
        currentFileName = file.name;
        
        try {
            // console.log("[Analyzer] Reading arrayBuffer...");
            const arrayBuffer = await file.arrayBuffer();
            
            // console.log("[Analyzer] Decoding audio data...");
            // Use the global audio context to decode
            if (!playback.audio) {
                initAudio();
            }

            currentAudioBuffer = await playback.audio.decodeAudioData(arrayBuffer);
            // console.log(`[Analyzer] Decoded: ${currentAudioBuffer.duration.toFixed(2)}s`);
            
            ui.analyzerProcessing.style.display = 'none';
            ui.analyzerTrimView.style.display = 'block';
            
            // Initialize trim inputs
            ui.analyzerStartInput.value = 0;
            ui.analyzerEndInput.value = Math.floor(currentAudioBuffer.duration);
            ui.analyzerDurationLabel.textContent = `Total Duration: ${currentAudioBuffer.duration.toFixed(1)}s`;
            
            drawWaveform(currentAudioBuffer);
            updateSelectionUI();
            
        } catch (err) {
            console.error("[Analyzer] Loading Error:", err);
            showToast("Loading failed: " + err.message);
            resetAnalyzer();
        }
    };

    const performAnalysis = async (customBpm = 0) => {
        if (!currentAudioBuffer) return;
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;
        const targetBpm = typeof customBpm === 'number' ? customBpm : 0;

        ui.analyzerTrimView.style.display = 'none';
        ui.analyzerProcessing.style.display = 'block';
        ui.analyzerResults.style.display = 'none';
        ui.analyzerProgressBar.style.width = '0%';

        try {
            const { ChordAnalyzerLite } = await import('./audio-analyzer-lite.js');
            const { extractForm, extractMelodyForm } = await import('./form-extractor.js');
            const analyzer = new ChordAnalyzerLite();

            const startTime = parseFloat(ui.analyzerStartInput.value) || 0;
            const endTime = parseFloat(ui.analyzerEndInput.value) || currentAudioBuffer.duration;
            
            // Common Pulse Analysis
            const pulse = await analyzer.identifyPulse(currentAudioBuffer, {
                startTime, endTime, bpm: targetBpm, 
                onProgress: (pct) => ui.analyzerProgressBar.style.width = `${pct * 0.4}%` 
            });

            const bpm = pulse.bpm;
            
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                const { HarmonizerTrainer } = await import('./harmonizer-trainer.js');
                
                // --- Key Detection (Pre-pass for Melody Bias) ---
                const signal = currentAudioBuffer.getChannelData(0);
                const globalChroma = analyzer.calculateChromagram(signal, currentAudioBuffer.sampleRate, {
                        minMidi: 48, maxMidi: 84, skipSharpening: true, step: Math.max(4, Math.floor(signal.length / 500000))
                });
                const detectedKeyObj = analyzer.identifyGlobalKey(globalChroma);
                const rootName = analyzer.notes[detectedKeyObj.root];
                const key = rootName + (detectedKeyObj.type === 'minor' ? 'm' : '');

                // Update UI Key if force key is off
                if (ui.analyzerForceKeyCheck && !ui.analyzerForceKeyCheck.checked) {
                    if (ui.keySelect && key !== arranger.key) {
                        ui.keySelect.value = normalizeKey(key);
                        arranger.key = key;
                        updateKeySelectLabels();
                        updateRelKeyButton();
                    }
                }

                const harmonizer = new Harmonizer();
                
                // 1. Train the engine on current Band logic
                const kb = await HarmonizerTrainer.train();
                harmonizer.setKnowledgeBase(kb);
                
                // 2. Extract melody with Key Bias
                let melodyLine = await analyzer.extractMelody(currentAudioBuffer, pulse, {
                    keyBias: detectedKeyObj
                });

                // 2.5 Heal Melody (Top-Down structural check)
                const beatsPerMeasure = pulse.beatsPerMeasure || 4;
                melodyLine = extractMelodyForm(melodyLine, beatsPerMeasure);

                ui.analyzerProgressBar.style.width = '80%';

                const options = harmonizer.generateOptions(melodyLine, key);
                
                ui.analyzerProgressBar.style.width = '100%';
                ui.analyzerProcessing.style.display = 'none';
                ui.analyzerResults.style.display = 'block';

                const container = ui.suggestedSectionsContainer;
                container.innerHTML = '<h4>Harmonization Options</h4>';

                const renderOptionContent = (opt, targetContainer) => {
                    targetContainer.innerHTML = '';

                    const desc = document.createElement('p');
                    desc.className = 'harmony-desc';
                    desc.textContent = opt.description;
                    targetContainer.appendChild(desc);

                    const grid = document.createElement('div');
                    grid.className = 'harmony-grid';

                    const detailsPanel = document.createElement('div');
                    detailsPanel.className = 'harmony-details-panel';
                    detailsPanel.innerHTML = '<span class="text-muted">Tap a chord to see why it was chosen.</span>';

                    opt.chords.forEach((c, i) => {
                        const cell = document.createElement('button'); // Button for accessibility
                        cell.className = 'harmony-cell';
                        cell.setAttribute('aria-label', `Measure ${i+1}: ${c.roman} ${c.quality}`);

                        const romanDiv = document.createElement('div');
                        romanDiv.className = 'hc-roman';
                        romanDiv.textContent = formatUnicodeSymbols(c.roman);
                        cell.appendChild(romanDiv);

                        const qualityDiv = document.createElement('div');
                        qualityDiv.className = 'hc-quality';
                        qualityDiv.textContent = c.quality;
                        cell.appendChild(qualityDiv);

                        cell.onclick = () => {
                            // Highlight selection
                            targetContainer.querySelectorAll('.harmony-cell').forEach(el => el.classList.remove('selected'));
                            cell.classList.add('selected');

                            // Show details
                            if (c.reasons && c.reasons.length > 0) {
                                detailsPanel.textContent = '';

                                const strong = document.createElement('strong');
                                strong.textContent = `Measure ${i+1}: ${formatUnicodeSymbols(c.roman)}`;
                                detailsPanel.appendChild(strong);

                                const ul = document.createElement('ul');
                                ul.className = 'reason-list';
                                c.reasons.forEach(r => {
                                    const li = document.createElement('li');
                                    li.textContent = r;
                                    ul.appendChild(li);
                                });
                                detailsPanel.appendChild(ul);
                            } else {
                                detailsPanel.innerHTML = `<strong>Measure ${i+1}:</strong> <span class="text-muted">No specific notes.</span>`;
                            }
                        };

                        grid.appendChild(cell);
                    });

                    targetContainer.appendChild(grid);
                    targetContainer.appendChild(detailsPanel);
                };

                // Helper to set the active selection
                const setActiveOption = (opt) => {
                    detectedChords = [{
                         label: `Harmonized Melody (${opt.type})`,
                         value: opt.progression,
                         repeat: 1,
                         startBeat: 0,
                         endBeat: melodyLine.length,
                         isLoop: false
                    }];
                };

                // Render Tabs
                const tabContainer = document.createElement('div');
                tabContainer.className = 'harmony-tabs';

                const contentContainer = document.createElement('div');
                contentContainer.className = 'harmony-content';

                options.forEach((opt, idx) => {
                    const tab = document.createElement('button');
                    tab.className = `harmony-tab-btn ${idx === 0 ? 'active' : ''}`;
                    tab.textContent = opt.type;

                    tab.onclick = () => {
                        document.querySelectorAll('.harmony-tab-btn').forEach(b => b.classList.remove('active'));
                        tab.classList.add('active');
                        renderOptionContent(opt, contentContainer);
                        setActiveOption(opt);
                    };
                    tabContainer.appendChild(tab);
                });

                container.appendChild(tabContainer);
                container.appendChild(contentContainer);

                // Initial render
                if (options.length > 0) {
                    renderOptionContent(options[0], contentContainer);
                    setActiveOption(options[0]);
                }

            } else {
                // Chord Mode
                const analysis = await analyzer.analyze(currentAudioBuffer, { 
                    bpm: bpm, 
                    startTime,
                    endTime,
                    onProgress: (pct) => {
                        ui.analyzerProgressBar.style.width = `${pct}%`;
                    }
                });
                detectedChords = extractForm(analysis.results, analysis.beatsPerMeasure);

                ui.analyzerProgressBar.style.width = '100%';
                ui.analyzerProcessing.style.display = 'none';
                ui.analyzerResults.style.display = 'block';

                const container = ui.suggestedSectionsContainer;
                container.innerHTML = '<h4>Suggested Structure</h4>';

                detectedChords.forEach(s => {
                    const item = document.createElement('div');
                    item.className = 'suggested-section-item';
                    if (s.isLoop) item.classList.add('is-loop');

                    const loopBadge = s.isLoop ? '<span class="loop-badge" title="Good Loop Candidate">∞</span>' : '';

                    item.innerHTML = `
                        <div class="ss-header">
                            <strong>${escapeHTML(s.label)}</strong>
                            <span class="ss-repeat">x${escapeHTML(String(s.repeat))}</span>
                            ${loopBadge}
                        </div>
                        <div class="ss-value">${escapeHTML(formatUnicodeSymbols(s.value))}</div>
                    `;

                    item.onclick = () => {
                        const secondsPerBeat = 60 / bpm;
                        const startT = (s.startBeat || 0) * secondsPerBeat;
                        const endT = (s.endBeat || (currentAudioBuffer.duration / secondsPerBeat)) * secondsPerBeat;

                        ui.analyzerStartInput.value = startT.toFixed(3);
                        ui.analyzerEndInput.value = endT.toFixed(3);

                        const event = new Event('input');
                        ui.analyzerStartInput.dispatchEvent(event);
                        ui.analyzerEndInput.dispatchEvent(event);

                        document.querySelectorAll('.suggested-section-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                    };

                    container.appendChild(item);
                });
            }
            
            // Render BPM Candidates (Only useful for Detection, but harmless for Melody)
            if (ui.bpmChips && pulse.candidates) {
                ui.bpmChips.innerHTML = '';
                pulse.candidates.forEach(c => {
                    const chip = document.createElement('div');
                    chip.className = `preset-chip ${c.bpm === bpm ? 'active' : ''}`;
                    chip.textContent = `${c.bpm} BPM`;
                    chip.onclick = () => performAnalysis(c.bpm);
                    ui.bpmChips.appendChild(chip);
                });
            }

            ui.analyzerSummary.textContent = mode === 'melody' 
                ? `Harmonized melody in ${arranger.key} at ${bpm} BPM.`
                : `Analyzed "${currentFileName}" at ${bpm} BPM. Detected ${detectedChords.length} sections.`;
            
            ui.detectedBpmLabel.textContent = bpm;
            ui.analyzerSyncBpmCheck.checked = true; 
            
        } catch (err) {
            console.error("[Analyzer] Analysis Error:", err);
            showToast("Analysis failed: " + err.message);
            ui.analyzerTrimView.style.display = 'block';
            ui.analyzerProcessing.style.display = 'none';
        }
    };

    // --- Live Listen Logic ---
    let liveAudioCtx = null;
    let liveStream = null;
    let liveAnalyzer = null;

    // New State for Live Builder
    let stagedChords = [];
    let currentStableChord = null;
    let lastDetectedChord = null;
    let stabilityCounter = 0;
    let autoAddTimer = null;
    const STABILITY_THRESHOLD = 3; // Frames to be considered stable
    const AUTO_ADD_DELAY = 2000; // ms

    const renderStagedChords = () => {
        const el = document.getElementById('liveStagedDisplay');
        const btn = document.getElementById('captureLiveHistoryBtn');
        if (!el) return;

        if (stagedChords.length === 0) {
            el.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Start playing to build a sequence...</span>';
            if (btn) {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
                btn.textContent = 'Import Sequence';
            }
        } else {
            // Format: "C | F | G | "
            el.textContent = stagedChords.join('');
            if (btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.textContent = `Import Sequence (${stagedChords.length} chords)`;
            }
        }

        // Auto-scroll to end
        el.scrollLeft = el.scrollWidth;
    };

    const addCurrentChord = () => {
        if (!currentStableChord || currentStableChord === 'Rest') return;

        // Add with pipe for measure separation
        stagedChords.push(`${formatUnicodeSymbols(currentStableChord)} | `);
        renderStagedChords();

        // Visual Feedback on the Add Button
        const btn = document.getElementById('liveAddBtn');
        if (btn) {
            const originalBg = btn.style.background;
            btn.style.background = 'var(--accent-color)';
            setTimeout(() => btn.style.background = originalBg, 200);
        }
    };

    const captureLiveHistory = () => {
        if (stagedChords.length === 0) return;
        
        pushHistory();
        
        // Join valid string (already formatted with pipes)
        const progressionStr = stagedChords.join('').trim();
        // Remove trailing pipe if exists
        const cleanProgression = progressionStr.endsWith('|') ? progressionStr.slice(0, -1).trim() : progressionStr;

        const newSection = {
            id: generateId(),
            label: 'Live Input',
            value: cleanProgression,
            repeat: 1,
            key: '',
            timeSignature: '',
            seamless: false
        };

        const replaceAll = document.getElementById('analyzerReplaceCheck').checked;

        if (replaceAll) {
            arranger.sections = [newSection];
        } else {
            arranger.sections.push(newSection);
        }

        arranger.isDirty = true;
        refreshArrangerUI();
        ModalManager.close(ui.analyzerOverlay);
        showToast(`Imported sequence.`);
    };

    const startLiveListen = async () => {
        if (liveStream) stopLiveListen();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Live Listen requires a Secure Context (HTTPS or localhost).");
            console.error("[LiveListen] navigator.mediaDevices is undefined. Check HTTPS/localhost.");
            return;
        }
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;

        // Reset Builder State
        stagedChords = [];
        currentStableChord = null;
        lastDetectedChord = null;
        renderStagedChords();

        // Setup Buttons
        const addBtn = document.getElementById('liveAddBtn');
        const undoBtn = document.getElementById('liveUndoBtn');
        const clearBtn = document.getElementById('liveClearBtn');
        const autoCheck = document.getElementById('liveAutoAddCheck');

        if (addBtn) addBtn.onclick = addCurrentChord;
        if (undoBtn) undoBtn.onclick = () => {
            stagedChords.pop();
            renderStagedChords();
        };
        if (clearBtn) clearBtn.onclick = () => {
            stagedChords = [];
            renderStagedChords();
        };

        // Keyboard Shortcut
        const keyHandler = (e) => {
            if (e.code === 'Space' && ui.analyzerOverlay.classList.contains('active')) {
                e.preventDefault();
                addCurrentChord();
            }
        };
        window.addEventListener('keydown', keyHandler);

        // Store handler to remove later
        ui.analyzerOverlay._liveKeyHandler = keyHandler;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true
            }});

            liveStream = stream;
            liveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = liveAudioCtx.createMediaStreamSource(stream);
            
            const { ChordAnalyzerLite } = await import('./audio-analyzer-lite.js');
            liveAnalyzer = new ChordAnalyzerLite();
            
            let harmonizer = null;
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                harmonizer = new Harmonizer();
            }

            ui.analyzerDropZone.style.display = 'none';
            ui.liveListenBtn.parentElement.style.display = 'none';
            ui.liveListenView.style.display = 'block';
            
            const chordEl = ui.liveChordDisplay;
            const statusEl = document.getElementById('liveStatusLabel');
            if (statusEl) statusEl.textContent = "Play a chord...";

            // Process audio in 4096 sample chunks
            const processor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(liveAudioCtx.destination);

            let chunks = [];
            let totalChunkLen = 0;
            const targetSamples = Math.floor(liveAudioCtx.sampleRate * 0.5); // 0.5s window for responsiveness

            // Pre-allocate buffers
            const step = 8;
            const numSteps = Math.ceil(targetSamples / step);
            const reusableBuffers = {
                chroma: new Float32Array(12),
                pitchEnergy: new Float32Array(128),
                windowValues: new Float32Array(numSteps)
            };

            for (let i = 0, idx = 0; i < targetSamples; i += step, idx++) {
                reusableBuffers.windowValues[idx] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (targetSamples - 1)));
            }

            // Key History
            const keyHistory = [];

            processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const chunk = new Float32Array(input);
                chunks.push(chunk);
                totalChunkLen += chunk.length;

                if (totalChunkLen >= targetSamples) {
                    // Flatten chunks only when needed
                    const fullBuffer = new Float32Array(totalChunkLen);
                    let offset = 0;
                    for (const c of chunks) {
                        fullBuffer.set(c, offset);
                        offset += c.length;
                    }

                    const analysisBuffer = fullBuffer.slice(-targetSamples);

                    // Retain overlap for next cycle
                    const overlapBuffer = fullBuffer.slice(-Math.floor(targetSamples / 2));
                    chunks = [overlapBuffer];
                    totalChunkLen = overlapBuffer.length;

                    let detected = null;

                    if (mode === 'melody') {
                        // ... Melody Logic ...
                         const rms = Math.sqrt(analysisBuffer.reduce((s, x) => s + x * x, 0) / analysisBuffer.length);
                         if (rms > 0.02) {
                             const chroma = liveAnalyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                                 step, buffers: reusableBuffers, minMidi: 48, maxMidi: 84
                             });
                             // Key Detection Logic
                             const keyRes = liveAnalyzer.identifySimpleKey(chroma);
                             const keyStr = liveAnalyzer.notes[keyRes.root] + (keyRes.type === 'minor' ? 'm' : '');
                             keyHistory.push(keyStr);
                             if (keyHistory.length > 30) keyHistory.shift();
                             // Consensus
                             const counts = {};
                             let consensusKey = keyStr;
                             let maxCount = 0;
                             keyHistory.forEach(k => { counts[k] = (counts[k] || 0) + 1; if (counts[k] > maxCount) { maxCount = counts[k]; consensusKey = k; } });
                             if (maxCount > keyHistory.length * 0.5) {
                                if (ui.liveKeyLabel) ui.liveKeyLabel.textContent = `Key: ${formatUnicodeSymbols(consensusKey)}`;
                                if (ui.liveForceKeyCheck && !ui.liveForceKeyCheck.checked && consensusKey !== arranger.key) arranger.key = consensusKey;
                             }
                             // Pitch
                             let maxE = 0;
                             let bestMidi = -1;
                             for(let m = 48; m <= 84; m++) {
                                 const e = reusableBuffers.pitchEnergy[m];
                                 if (e > maxE) { maxE = e; bestMidi = m; }
                             }
                             if (bestMidi > 0) {
                                 const melodyBit = [{beat: 0, midi: bestMidi, energy: 1.0}];
                                 detected = harmonizer.generateProgression(melodyBit, arranger.key || 'C', 0.5);
                             }
                        }
                    } else {
                        // Chord Logic
                        const chroma = liveAnalyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                            step: 8, minMidi: 32, maxMidi: 80
                        });
                        detected = liveAnalyzer.identifyChord(chroma);
                    }

                    // Stability & Display Logic
                    if (detected && detected !== 'Rest') {
                        if (detected === lastDetectedChord) {
                            stabilityCounter++;
                        } else {
                            stabilityCounter = 0;
                            lastDetectedChord = detected;
                        }

                        if (stabilityCounter >= STABILITY_THRESHOLD) {
                             // Stable Chord Found
                             if (currentStableChord !== detected) {
                                 currentStableChord = detected;
                                 chordEl.textContent = formatUnicodeSymbols(detected);
                                 chordEl.style.color = 'var(--accent-color)';

                                 // Reset Auto-Add Timer
                                 if (autoAddTimer) clearTimeout(autoAddTimer);
                                 if (autoCheck && autoCheck.checked) {
                                     // Provide visual hint that timer started?
                                     autoAddTimer = setTimeout(() => {
                                         addCurrentChord();
                                         // Flash display to show added
                                         chordEl.style.transform = 'scale(1.2)';
                                         setTimeout(() => chordEl.style.transform = 'scale(1)', 200);
                                     }, AUTO_ADD_DELAY);
                                 }
                             }
                        }
                    } else {
                        // Silence / Rest
                        stabilityCounter = 0;
                        lastDetectedChord = null;
                        if (autoAddTimer) {
                            clearTimeout(autoAddTimer);
                            autoAddTimer = null;
                        }
                    }
                }
            };

        } catch (err) {
            console.error("[LiveListen] Error:", err);
            showToast("Microphone access denied or error: " + err.message);
        }
    };

    const stopLiveListen = () => {
        if (liveStream) {
            liveStream.getTracks().forEach(t => t.stop());
            liveStream = null;
        }
        if (liveAudioCtx) {
            liveAudioCtx.close();
            liveAudioCtx = null;
        }
        if (liveAnalyzer) {
            liveAnalyzer.dispose();
            liveAnalyzer = null;
        }
        if (autoAddTimer) clearTimeout(autoAddTimer);

        // Remove Key Handler
        if (ui.analyzerOverlay._liveKeyHandler) {
            window.removeEventListener('keydown', ui.analyzerOverlay._liveKeyHandler);
            delete ui.analyzerOverlay._liveKeyHandler;
        }

        ui.analyzerDropZone.style.display = 'block';
        ui.liveListenBtn.parentElement.style.display = 'flex';
        ui.liveListenView.style.display = 'none';

        // Don't hide capture btn here as it's now "Import Sequence" and part of the view being hidden anyway
    };

    ui.liveListenBtn.addEventListener('click', startLiveListen);
    ui.stopLiveListenBtn.addEventListener('click', stopLiveListen);
    ui.captureLiveHistoryBtn.addEventListener('click', captureLiveHistory);

    ui.analyzerStartInput.addEventListener('input', updateSelectionUI);
    ui.analyzerEndInput.addEventListener('input', updateSelectionUI);
    ui.startAnalysisBtn.addEventListener('click', () => performAnalysis());

    ui.analyzerFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    ui.analyzerDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.add('drag-over');
    });

    ui.analyzerDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.remove('drag-over');
    });

    ui.analyzerDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.analyzerDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    ui.applyAnalysisBtn.addEventListener('click', () => {
        if (detectedChords.length === 0) return;
        
        pushHistory();
        
        const newSections = detectedChords.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value,
            repeat: s.repeat,
            key: '',
            timeSignature: '',
            seamless: false
        }));

        const replaceAll = document.getElementById('analyzerReplaceCheck').checked;

        if (replaceAll) {
            arranger.sections = newSections;
        } else {
            arranger.sections.push(...newSections);
        }

        // Apply BPM Sync if checked
        if (ui.analyzerSyncBpmCheck && ui.analyzerSyncBpmCheck.checked) {
            const detectedBpm = parseInt(ui.detectedBpmLabel.textContent);
            if (detectedBpm && detectedBpm !== playback.bpm) {
                setBpm(detectedBpm, playback.viz);
            }
        }

        arranger.isDirty = true;
        refreshArrangerUI();
        ModalManager.close(ui.analyzerOverlay);
        showToast(`Imported ${newSections.length} sections.`);
    });
}