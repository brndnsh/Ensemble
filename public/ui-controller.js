import { ACTIONS } from './types.js';
import { ui, showToast, renderChordVisualizer, renderSections, renderGridState, recalculateScrollOffsets, renderTemplates, updateRelKeyButton, updateKeySelectLabels, switchInstrumentTab } from './ui.js';
import { playback, chords, bass, soloist, harmony, groove, arranger, dispatch, subscribe } from './state.js';
import { saveCurrentState } from './persistence.js';
import { restoreGains, initAudio } from './engine.js';
import { syncWorker } from './worker-client.js';
import { generateId, formatUnicodeSymbols, normalizeKey } from './utils.js';
import { CHORD_STYLES, SOLOIST_STYLES, BASS_STYLES, HARMONY_STYLES, DRUM_PRESETS, CHORD_PRESETS, SONG_TEMPLATES } from './presets.js';
import { MIXER_GAIN_MULTIPLIERS, TIME_SIGNATURES } from './config.js';
import { generateRandomProgression, mutateProgression } from './chords.js';
import { applyTheme, setBpm } from './app-controller.js';
import { flushBuffers, switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, handleTap, resetToDefaults, togglePower } from './instrument-controller.js';
import { onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, addSection, transposeKey, switchToRelativeKey } from './arranger-controller.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { triggerInstall } from './pwa.js';
import { exportToMidi } from './midi-export.js';
import { applyConductor, updateBpmUI } from './conductor.js';
import { initMIDI, panic } from './midi-controller.js';
import { midi as midiState } from './state.js';

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

    const openExportModal = () => {
        ui.arrangerActionMenu.classList.remove('open');
        ui.arrangerActionTrigger.classList.remove('active');
        ui.settingsOverlay.classList.remove('active');
        
        let defaultName = arranger.lastChordPreset || "Ensemble Export";
        defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${playback.bpm}bpm`;
        
        ui.exportOverlay.classList.add('active');
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
        [ui.playBtn, 'click', togglePlay],
        [ui.bpmInput, 'input', e => setBpm(e.target.value, refs.viz)],
        [ui.tapBtn, 'click', () => handleTap((val) => setBpm(val, refs.viz))],
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
            
            ui.templatesOverlay.classList.add('active');
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
                ui.templatesOverlay.classList.remove('active');
                showToast(`Applied template: ${template.name}`);
            });
        }],
        [ui.closeTemplatesBtn, 'click', () => {
            ui.templatesOverlay.classList.remove('active');
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
            document.getElementById('analyzerOverlay').classList.add('active');
        }],
        [ui.randomizeBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            pushHistory();
            const newProg = generateRandomProgression(chords.style);
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId);
            if (section) {
                section.value = newProg;
                showToast(`Randomized ${section.label}`);
            } else {
                arranger.sections = [{ id: generateId(), label: 'Random', value: newProg }];
            }
            clearChordPresetHighlight();
            refreshArrangerUI();
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
        [ui.vizToggleBtn, 'click', () => {
             const vizPanel = document.getElementById('panel-visualizer');
             if (vizPanel) {
                 const isHidden = getComputedStyle(vizPanel).display === 'none';
                 vizPanel.style.display = isHidden ? 'flex' : 'none';
                 // Update icon state? Optional.
                 ui.vizToggleBtn.style.opacity = isHidden ? '1' : '0.5';
             }
        }],
        [ui.settingsBtn, 'click', () => ui.settingsOverlay.classList.add('active')],
        [ui.closeSettings, 'click', () => ui.settingsOverlay.classList.remove('active')],
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
        [ui.closeExportBtn, 'click', () => ui.exportOverlay.classList.remove('active')],
        [ui.exportOverlay, 'click', (e) => {
            if (e.target === ui.exportOverlay) ui.exportOverlay.classList.remove('active');
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

            ui.exportOverlay.classList.remove('active');
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

    // --- Modal Accessibility Observer ---
    const overlays = [
        ui.settingsOverlay, ui.editorOverlay, ui.exportOverlay, 
        ui.templatesOverlay, ui.analyzerOverlay
    ];
    
    overlays.forEach(overlay => {
        if (!overlay) return;
        // Set initial state
        overlay.setAttribute('aria-hidden', !overlay.classList.contains('active'));
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isActive = overlay.classList.contains('active');
                    overlay.setAttribute('aria-hidden', !isActive);
                    // When opening, we might want to ensure it's "inert" false, but we rely on visibility/display CSS for that now.
                }
            });
        });
        
        observer.observe(overlay, { attributes: true });
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
            ui.editorOverlay.classList.add('active');
        });
    }
    if (ui.closeEditorBtn) {
        ui.closeEditorBtn.addEventListener('click', () => {
            ui.editorOverlay.classList.remove('active');
        });
    }
    if (ui.editorOverlay) {
        ui.editorOverlay.addEventListener('click', e => {
            if (e.target === ui.editorOverlay) {
                ui.editorOverlay.classList.remove('active');
            }
        });
    }

    ui.settingsOverlay.addEventListener('click', e => e.target === ui.settingsOverlay && ui.settingsOverlay.classList.remove('active'));
    ui.templatesOverlay.addEventListener('click', e => e.target === ui.templatesOverlay && ui.templatesOverlay.classList.remove('active'));
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

    if (ui.groupingLabel) {
        ui.groupingLabel.addEventListener('click', () => {
            const ts = arranger.timeSignature;
            const options = GROUPING_OPTIONS[ts];
            if (!options) return;

            const current = arranger.grouping || TIME_SIGNATURES[ts].grouping;
            const currentIndex = options.findIndex(opt => opt.join('+') === current.join('+'));
            const nextIndex = (currentIndex + 1) % options.length;
            
            arranger.grouping = options[nextIndex];
            updateGroupingUI();
            flushBuffers();
            syncWorker();
            saveCurrentState();
        });
    }

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

    ui.themeSelect.addEventListener('change', e => {
        applyTheme(e.target.value);
        saveCurrentState();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (playback.theme === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    ui.densitySelect.addEventListener('change', e => { 
        dispatch(ACTIONS.SET_DENSITY, e.target.value); 
        validateAndAnalyze(); 
        flushBuffers(); 
        saveCurrentState();
    });

    const volumeNodes = [
        { el: ui.chordVol, state: chords, gain: 'chordsGain', mult: MIXER_GAIN_MULTIPLIERS.chords },
        { el: ui.bassVol, state: bass, gain: 'bassGain', mult: MIXER_GAIN_MULTIPLIERS.bass },
        { el: ui.soloistVol, state: soloist, gain: 'soloistGain', mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { el: ui.harmonyVol, state: harmony, gain: 'harmoniesGain', mult: MIXER_GAIN_MULTIPLIERS.harmonies },
        { el: ui.drumVol, state: groove, gain: 'drumsGain', mult: MIXER_GAIN_MULTIPLIERS.drums },
        { el: ui.masterVol, state: playback, gain: 'masterGain', mult: MIXER_GAIN_MULTIPLIERS.master }
    ];
    volumeNodes.forEach(({ el, state, gain, mult }) => {
        el.addEventListener('input', e => {
            const val = parseFloat(e.target.value);
            if (state !== playback) state.volume = val;
            if (playback[gain]) {
                const target = Math.max(0.0001, val * mult);
                playback[gain].gain.setValueAtTime(playback[gain].gain.value, playback.audio.currentTime);
                playback[gain].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    const reverbNodes = [
        { el: ui.chordReverb, state: chords, gain: 'chordsReverb' },
        { el: ui.bassReverb, state: bass, gain: 'bassReverb' },
        { el: ui.soloistReverb, state: soloist, gain: 'soloistReverb' },
        { el: ui.harmonyReverb, state: harmony, gain: 'harmoniesReverb' },
        { el: ui.drumReverb, state: groove, gain: 'drumsReverb' }
    ];
    reverbNodes.forEach(({ el, state, gain }) => {
        el.addEventListener('input', e => {
            state.reverb = parseFloat(e.target.value);
            if (playback[gain]) {
                const target = Math.max(0.0001, state.reverb);
                playback[gain].gain.setValueAtTime(playback[gain].gain.value, playback.audio.currentTime);
                playback[gain].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    ui.swingSlider.addEventListener('input', e => { groove.swing = parseInt(e.target.value); saveCurrentState(); });
    ui.swingBase.addEventListener('change', e => { groove.swingSub = e.target.value; saveCurrentState(); });
    ui.humanizeSlider.addEventListener('input', e => { groove.humanize = parseInt(e.target.value); saveCurrentState(); });
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

    ui.haptic.addEventListener('change', () => {
        dispatch(ACTIONS.SET_PARAM, { module: 'ctx', param: 'haptic', value: ui.haptic.checked });
    });

    if (ui.harmonyComplexity) {
        ui.harmonyComplexity.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            harmony.complexity = val;
            if (ui.harmonyComplexityValue) ui.harmonyComplexityValue.textContent = `${Math.round(val * 100)}%`;
            syncWorker();
        });
        ui.harmonyComplexity.addEventListener('change', () => saveCurrentState());
    }

    if (ui.sessionTimerCheck && ui.sessionTimerInput) {
        const updateTimerUI = (isChecked) => {
            if (ui.sessionTimerDurationContainer) {
                ui.sessionTimerDurationContainer.style.opacity = isChecked ? '1' : '0.4';
                ui.sessionTimerDurationContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
            }
            if (ui.sessionTimerStepper) {
                ui.sessionTimerStepper.style.borderColor = isChecked ? 'var(--accent-color)' : 'var(--border-color)';
                ui.sessionTimerStepper.style.backgroundColor = isChecked ? 'var(--card-bg)' : 'var(--input-bg)';
            }
        };

        // Sync initial UI from potentially hydrated state
        ui.sessionTimerCheck.checked = playback.sessionTimer > 0;
        ui.sessionTimerInput.value = playback.sessionTimer > 0 ? playback.sessionTimer : 5;
        updateTimerUI(playback.sessionTimer > 0);

        ui.sessionTimerCheck.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const duration = isChecked ? parseFloat(ui.sessionTimerInput.value) : 0;
            updateTimerUI(isChecked);
            dispatch(ACTIONS.SET_SESSION_TIMER, duration);
            saveCurrentState();
        });

        ui.sessionTimerInput.addEventListener('change', (e) => {
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, parseFloat(e.target.value));
                saveCurrentState();
            }
        });

        const adjustTimer = (delta) => {
            const current = parseInt(ui.sessionTimerInput.value);
            const next = Math.max(1, Math.min(20, current + delta));
            ui.sessionTimerInput.value = next;
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, next);
                saveCurrentState();
            }
        };

        ui.sessionTimerDec.addEventListener('click', () => adjustTimer(-1));
        ui.sessionTimerInc.addEventListener('click', () => adjustTimer(1));
    }

    ui.applyPresetSettings.addEventListener('change', () => {
        dispatch(ACTIONS.SET_PRESET_SETTINGS_MODE, ui.applyPresetSettings.checked);
    });

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
        ui.editorOverlay.classList.add('active');
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
        if (e.key === ' ' && !isTyping) { e.preventDefault(); togglePlay(); }
        if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (ui.editorOverlay.classList.contains('active')) ui.editorOverlay.classList.remove('active'); else ui.editorOverlay.classList.add('active'); }
        if (['1', '2', '3', '4'].includes(e.key) && !isTyping) { const index = parseInt(e.key) - 1; const tabItem = document.querySelectorAll('.tab-item')[index]; if (tabItem) tabItem.click(); }
        if (e.key === '[' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (groove.currentMeasure - 1 + groove.measures) % groove.measures; switchMeasure(next); }
        if (e.key === ']' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (groove.currentMeasure + 1) % groove.measures; switchMeasure(next); }
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) { document.body.classList.remove('chord-maximized'); ui.maximizeChordBtn.textContent = '⛶'; ui.maximizeChordBtn.title = 'Maximize'; renderChordVisualizer(); }
            if (ui.settingsOverlay.classList.contains('active')) ui.settingsOverlay.classList.remove('active');
            if (ui.templatesOverlay.classList.contains('active')) ui.templatesOverlay.classList.remove('active');
            if (ui.editorOverlay.classList.contains('active')) ui.editorOverlay.classList.remove('active');
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { if (resizeTimeout) clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => recalculateScrollOffsets(), 150); });

    updateGroupingUI();
    setupMIDIHandlers();
    setupAnalyzerHandlers();
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


    ui.closeAnalyzerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.analyzerOverlay.classList.remove('active');
        stopLiveListen();
    });

    ui.analyzerDropZone.addEventListener('click', () => ui.analyzerFileInput.click());

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
            const { extractForm } = await import('./form-extractor.js');
            const analyzer = new ChordAnalyzerLite();

            const startTime = parseFloat(ui.analyzerStartInput.value) || 0;
            const endTime = parseFloat(ui.analyzerEndInput.value) || currentAudioBuffer.duration;
            
            // Common Pulse Analysis
            const pulse = await analyzer.identifyPulse(currentAudioBuffer, {
                startTime, endTime, bpm: targetBpm, 
                onProgress: (pct) => ui.analyzerProgressBar.style.width = `${pct * 0.5}%` 
            });

            const bpm = pulse.bpm;
            
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                const { HarmonizerTrainer } = await import('./harmonizer-trainer.js');
                
                const harmonizer = new Harmonizer();
                
                // 1. Train the engine on current Band logic
                const kb = await HarmonizerTrainer.train();
                harmonizer.setKnowledgeBase(kb);
                
                // 2. Extract melody and generate
                const melodyLine = await analyzer.extractMelody(currentAudioBuffer, pulse);
                ui.analyzerProgressBar.style.width = '80%';
                
                // Key Detection
                let key = arranger.key || 'C';
                if (ui.analyzerForceKeyCheck && !ui.analyzerForceKeyCheck.checked) {
                    // Use the already calculated globalChroma from step 1 logic?
                    // Wait, performAnalysis doesn't do globalChroma yet here. We need to calculate it.
                    // We can reuse the buffers or just do a quick one.
                    // Actually, audio-analyzer-lite calculateChromagram is fast.
                    const signal = currentAudioBuffer.getChannelData(0);
                    const globalChroma = analyzer.calculateChromagram(signal, currentAudioBuffer.sampleRate, {
                         minMidi: 48, maxMidi: 84, skipSharpening: true, step: Math.max(4, Math.floor(signal.length / 500000))
                    });
                    const detectedKeyObj = analyzer.identifyGlobalKey(globalChroma);
                    const rootName = analyzer.notes[detectedKeyObj.root];
                    key = rootName + (detectedKeyObj.type === 'minor' ? 'm' : '');

                    // Update Global Key
                    if (ui.keySelect && key !== arranger.key) {
                        ui.keySelect.value = normalizeKey(key);
                        // If exact match not found (enharmonics), try best effort or just set arranger.key directly
                        // But setting ui.keySelect.value triggers change event which updates state.
                        // Let's force update state to be safe.
                        arranger.key = key;
                        updateKeySelectLabels();
                        updateRelKeyButton();
                    }
                }

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
                        cell.innerHTML = `
                            <div class="hc-roman">${formatUnicodeSymbols(c.roman)}</div>
                            <div class="hc-quality">${c.quality}</div>
                        `;

                        cell.onclick = () => {
                            // Highlight selection
                            targetContainer.querySelectorAll('.harmony-cell').forEach(el => el.classList.remove('selected'));
                            cell.classList.add('selected');

                            // Show details
                            if (c.reasons && c.reasons.length > 0) {
                                detailsPanel.innerHTML = `
                                    <strong>Measure ${i+1}: ${formatUnicodeSymbols(c.roman)}</strong>
                                    <ul class="reason-list">
                                        ${c.reasons.map(r => `<li>${r}</li>`).join('')}
                                    </ul>
                                `;
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
                            <strong>${s.label}</strong>
                            <span class="ss-repeat">x${s.repeat}</span>
                            ${loopBadge}
                        </div>
                        <div class="ss-value">${formatUnicodeSymbols(s.value)}</div>
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

    const startLiveListen = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Live Listen requires a Secure Context (HTTPS or localhost).");
            console.error("[LiveListen] navigator.mediaDevices is undefined. Check HTTPS/localhost.");
            return;
        }
        
        const mode = document.querySelector('input[name="analyzerMode"]:checked').value;

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
            const analyzer = new ChordAnalyzerLite();
            
            // Only import Harmonizer if in melody mode
            let harmonizer = null;
            if (mode === 'melody') {
                const { Harmonizer } = await import('./melody-harmonizer.js');
                harmonizer = new Harmonizer();
            }

            ui.analyzerDropZone.style.display = 'none';
            ui.liveListenBtn.parentElement.style.display = 'none';
            ui.liveListenView.style.display = 'block';
            
            const history = [];
            const keyHistory = []; // Buffer for key stability
            const historyEl = ui.liveHistoryDisplay;
            const chordEl = ui.liveChordDisplay;

            // Process audio in 4096 sample chunks
            const processor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(liveAudioCtx.destination);

            let buffer = new Float32Array(0);
            const targetSamples = Math.floor(liveAudioCtx.sampleRate * 1.0); // 1.0s window

            // Pre-allocate buffers for reuse to avoid GC
            const step = 8;
            const numSteps = Math.ceil(targetSamples / step);
            const reusableBuffers = {
                chroma: new Float32Array(12),
                pitchEnergy: new Float32Array(128),
                windowValues: new Float32Array(numSteps)
            };

            // Pre-calculate window values
            for (let i = 0, idx = 0; i < targetSamples; i += step, idx++) {
                reusableBuffers.windowValues[idx] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (targetSamples - 1)));
            }

            processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const newBuffer = new Float32Array(buffer.length + input.length);
                newBuffer.set(buffer);
                newBuffer.set(input, buffer.length);
                buffer = newBuffer;

                if (buffer.length >= targetSamples) {
                    const analysisBuffer = buffer.slice(-targetSamples);
                    // Shift buffer (keep last 50% for overlap)
                    buffer = buffer.slice(-Math.floor(targetSamples / 2));

                    if (mode === 'melody') {
                        // Melody Live Mode: Use optimized analyzer with reusable buffers
                        const rms = Math.sqrt(analysisBuffer.reduce((s, x) => s + x * x, 0) / analysisBuffer.length);

                        if (rms > 0.02) {
                             const chroma = analyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                                 step,
                                 buffers: reusableBuffers,
                                 minMidi: 48,
                                 maxMidi: 84
                             });

                             // --- Live Key Detection ---
                             const keyRes = analyzer.identifySimpleKey(chroma); // { root, type, score }
                             const keyStr = analyzer.notes[keyRes.root] + (keyRes.type === 'minor' ? 'm' : '');

                             keyHistory.push(keyStr);
                             if (keyHistory.length > 30) keyHistory.shift(); // ~1.5s history

                             // Find consensus key
                             const counts = {};
                             let consensusKey = keyStr;
                             let maxCount = 0;
                             keyHistory.forEach(k => {
                                 counts[k] = (counts[k] || 0) + 1;
                                 if (counts[k] > maxCount) {
                                     maxCount = counts[k];
                                     consensusKey = k;
                                 }
                             });

                             // Update UI if consensus is strong (>50% confidence)
                             if (maxCount > keyHistory.length * 0.5) {
                                if (ui.liveKeyLabel) ui.liveKeyLabel.textContent = `Key: ${formatUnicodeSymbols(consensusKey)}`;

                                // Auto-update arranger key if not locked
                                if (ui.liveForceKeyCheck && !ui.liveForceKeyCheck.checked && consensusKey !== arranger.key) {
                                    // Throttle updates to avoid state thrashing?
                                    // Actually, let's just update it. The harmonizer uses `arranger.key` in the next step.
                                    if (playback.isPlaying) {
                                        // Be careful during playback not to cause glitches, but this is analysis mode.
                                    }
                                    arranger.key = consensusKey;
                                    // Visual feedback in main UI? Maybe too distracting.
                                    // But user asked to override.
                                }
                             }

                             // Find strongest pitch in vocal range (48-84)
                             let maxE = 0;
                             let bestMidi = -1;
                             for(let m = 48; m <= 84; m++) {
                                 const e = reusableBuffers.pitchEnergy[m];
                                 if (e > maxE) {
                                     maxE = e;
                                     bestMidi = m;
                                 }
                             }
                             
                             if (bestMidi > 0) {
                                 // Single note harmonization
                                 const melodyBit = [{beat: 0, midi: bestMidi, energy: 1.0}];
                                 // Use the EFFECTIVE key (which might have just been updated)
                                 const prog = harmonizer.generateProgression(melodyBit, arranger.key || 'C', 0.5);
                                 chordEl.textContent = formatUnicodeSymbols(prog);
                             }
                        }
                    } else {
                        // Chord Live Mode (Existing)
                        const chroma = analyzer.calculateChromagram(analysisBuffer, liveAudioCtx.sampleRate, {
                            step: 8, // Faster for real-time
                            minMidi: 32,
                            maxMidi: 80
                        });
                        
                        const chord = analyzer.identifyChord(chroma);
                        if (chord !== 'Rest') {
                            chordEl.textContent = formatUnicodeSymbols(chord);
                            
                            if (history.length === 0 || history[history.length - 1] !== chord) {
                                history.push(chord);
                                if (history.length > 8) history.shift();
                                
                                historyEl.innerHTML = history.map((c, i) => 
                                    `<span class="${i === history.length - 1 ? 'current' : ''}">${formatUnicodeSymbols(c)}</span>`
                                ).join('');
                            }
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
        ui.analyzerDropZone.style.display = 'block';
        ui.liveListenBtn.parentElement.style.display = 'flex';
        ui.liveListenView.style.display = 'none';
    };

    ui.liveListenBtn.addEventListener('click', startLiveListen);
    ui.stopLiveListenBtn.addEventListener('click', stopLiveListen);

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
        ui.analyzerOverlay.classList.remove('active');
        showToast(`Imported ${newSections.length} sections.`);
    });
}

export function setupMIDIHandlers() {
    if (!ui.midiEnableCheck) return;

    ui.midiEnableCheck.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (enabled) {
            const success = await initMIDI();
            if (!success) {
                ui.midiEnableCheck.checked = false;
                showToast("MIDI Access Denied or Not Supported");
                return;
            }
        } else {
            panic();
        }
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
        updateMIDIControlsUI(enabled);
        restoreGains();
        saveCurrentState();
    });

    if (ui.midiMuteLocalCheck) {
        ui.midiMuteLocalCheck.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_MIDI_CONFIG, { muteLocal: e.target.checked });
            restoreGains();
            saveCurrentState();
        });
    }

    ui.midiOutputSelect.addEventListener('change', (e) => {
        dispatch(ACTIONS.SET_MIDI_CONFIG, { selectedOutputId: e.target.value });
        saveCurrentState();
    });

    const channels = ['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'];
    channels.forEach(ch => {
        const el = ui[`midi${ch}Channel`];
        if (el) {
            el.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Channel`]: val });
                saveCurrentState();
            });
        }
        
        const octEl = ui[`midi${ch}Octave`];
        if (octEl) {
            octEl.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                dispatch(ACTIONS.SET_MIDI_CONFIG, { [`${ch.toLowerCase()}Octave`]: val });
                saveCurrentState();
            });
        }
    });

    if (ui.midiLatencySlider) {
        ui.midiLatencySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_MIDI_CONFIG, { latency: val });
            if (ui.midiLatencyValue) ui.midiLatencyValue.textContent = `${val > 0 ? '+' : ''}${val}ms`;
        });
        ui.midiLatencySlider.addEventListener('change', () => saveCurrentState());
    }

    if (ui.midiVelocitySlider) {
        ui.midiVelocitySlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            dispatch(ACTIONS.SET_MIDI_CONFIG, { velocitySensitivity: val });
            if (ui.midiVelocityValue) ui.midiVelocityValue.textContent = val.toFixed(1);
        });
        ui.midiVelocitySlider.addEventListener('change', () => saveCurrentState());
    }

    ui.midiEnableCheck.checked = midiState.enabled;
    if (ui.midiChordsChannel) ui.midiChordsChannel.value = midiState.chordsChannel;
    if (ui.midiBassChannel) ui.midiBassChannel.value = midiState.bassChannel;
    if (ui.midiSoloistChannel) ui.midiSoloistChannel.value = midiState.soloistChannel;
    if (ui.midiHarmonyChannel) ui.midiHarmonyChannel.value = midiState.harmonyChannel;
    if (ui.midiDrumsChannel) ui.midiDrumsChannel.value = midiState.drumsChannel;
    if (ui.midiChordsOctave) ui.midiChordsOctave.value = midiState.chordsOctave;
    if (ui.midiBassOctave) ui.midiBassOctave.value = midiState.bassOctave;
    if (ui.midiSoloistOctave) ui.midiSoloistOctave.value = midiState.soloistOctave;
    if (ui.midiHarmonyOctave) ui.midiHarmonyOctave.value = midiState.harmonyOctave;
    if (ui.midiDrumsOctave) ui.midiDrumsOctave.value = midiState.drumsOctave;
    if (ui.midiVelocitySlider) ui.midiVelocitySlider.value = midiState.velocitySensitivity || 1.0;
    if (ui.midiVelocityValue) ui.midiVelocityValue.textContent = (midiState.velocitySensitivity || 1.0).toFixed(1);
    if (ui.midiLatencySlider) ui.midiLatencySlider.value = midiState.latency;
    if (ui.midiLatencyValue) ui.midiLatencyValue.textContent = `${midiState.latency > 0 ? '+' : ''}${midiState.latency}ms`;
    
    updateMIDIControlsUI(midiState.enabled);
    renderMIDIOutputs();

    import('./state.js').then(({ subscribe }) => {
        subscribe((action, payload) => {
            if (action === ACTIONS.SET_MIDI_CONFIG && payload.outputs) {
                renderMIDIOutputs();
            }
        });
    });
}

function updateMIDIControlsUI(enabled) {
    if (!ui.midiControls) return;
    ui.midiControls.style.opacity = enabled ? '1' : '0.5';
    ui.midiControls.style.pointerEvents = enabled ? 'auto' : 'none';
}

function renderMIDIOutputs() {
    if (!ui.midiOutputSelect) return;
    const select = ui.midiOutputSelect;
    const currentId = midiState.selectedOutputId;
    
    select.innerHTML = midiState.outputs.length > 0 ? '' : '<option value="">No outputs found</option>';
    
    midiState.outputs.forEach(out => {
        const opt = document.createElement('option');
        opt.value = out.id;
        opt.textContent = out.name;
        if (out.id === currentId) opt.selected = true;
        select.appendChild(opt);
    });

    if (!currentId && midiState.outputs.length > 0) {
        dispatch(ACTIONS.SET_MIDI_CONFIG, { selectedOutputId: midiState.outputs[0].id });
    }
}

const GROUPING_OPTIONS = {
    '5/4': [[3, 2], [2, 3]],
    '7/8': [[2, 2, 3], [3, 2, 2], [2, 3, 2]],
    '7/4': [[4, 3], [3, 4]]
};

export function updateGroupingUI() {
    if (!ui.groupingToggle || !ui.groupingLabel) return;
    
    const ts = arranger.timeSignature;
    const hasOptions = GROUPING_OPTIONS[ts] !== undefined;
    
    ui.groupingToggle.style.display = hasOptions ? 'flex' : 'none';
    
    if (hasOptions) {
        const current = arranger.grouping || TIME_SIGNATURES[ts].grouping;
        ui.groupingLabel.textContent = current.join('+');
    }
}