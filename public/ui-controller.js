import { ui, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderSections, renderGridState, clearActiveVisuals, recalculateScrollOffsets, renderMeasurePagination, setupPanelMenus, renderTemplates, createPresetChip, updateRelKeyButton, updateKeySelectLabels } from './ui.js';
import { ctx, cb, bb, sb, gb, arranger, vizState, storage, dispatch } from './state.js';
import { saveCurrentState, renderUserPresets, renderUserDrumPresets } from './persistence.js';
import { restoreGains } from './engine.js';
import { syncWorker } from './worker-client.js';
import { generateId, compressSections, normalizeKey, decompressSections, getStepsPerMeasure } from './utils.js';
import { CHORD_STYLES, SOLOIST_STYLES, BASS_STYLES, DRUM_PRESETS, CHORD_PRESETS, SONG_TEMPLATES } from './presets.js';
import { MIXER_GAIN_MULTIPLIERS, TIME_SIGNATURES, KEY_ORDER } from './config.js';
import { generateRandomProgression, mutateProgression, transformRelativeProgression } from './chords.js';
import { applyTheme, setBpm } from './app-controller.js';
import { flushBuffers, switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, handleTap, resetToDefaults, togglePower } from './instrument-controller.js';
import { onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, addSection, analyzeFormUI, transposeKey, switchToRelativeKey } from './arranger-controller.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { triggerInstall } from './pwa.js';
import { exportToMidi } from './midi-export.js';
import { applyConductor } from './conductor.js';

export function updateStyle(type, styleId) {
    const UPDATE_STYLE_CONFIG = {
        chord: { selector: '.chord-style-chip', module: 'cb', panelId: 'chord' },
        bass: { selector: '.bass-style-chip', module: 'bb', panelId: 'bass' },
        soloist: { selector: '.soloist-style-chip', module: 'sb', panelId: 'soloist' }
    };
    const c = UPDATE_STYLE_CONFIG[type];
    if (!c) return;
    
    dispatch('SET_STYLE', { module: c.module, style: styleId });

    // When a manual style is selected, we switch the tab to 'classic' automatically
    // unless the style being set is 'smart' (though usually smart is set via tabs)
    if (styleId !== 'smart') {
        dispatch('SET_ACTIVE_TAB', { module: c.module, tab: 'classic' });
        // Update UI Tabs
        document.querySelectorAll(`.instrument-tab-btn[data-module="${c.module}"]`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === 'classic');
        });
        document.querySelectorAll(`[id^="${c.panelId}-tab-"]`).forEach(panel => {
            panel.classList.toggle('active', panel.id === `${c.panelId}-tab-classic`);
        });
    }

    document.querySelectorAll(c.selector).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === styleId);
    });

    flushBuffers();
    restoreGains();
    saveCurrentState();
}

const SMART_GENRES = {
    'Rock': { swing: 0, sub: '8th', drum: 'Basic Rock', feel: 'Rock', chord: 'smart', bass: 'rock', soloist: 'shred' },
    'Jazz': { swing: 60, sub: '8th', drum: 'Jazz', feel: 'Jazz', chord: 'jazz', bass: 'quarter', soloist: 'bird' },
    'Funk': { swing: 15, sub: '16th', drum: 'Funk', feel: 'Funk', chord: 'funk', bass: 'funk', soloist: 'blues' },
    'Disco': { swing: 0, sub: '16th', drum: 'Disco', feel: 'Disco', chord: 'smart', bass: 'disco', soloist: 'disco' },
    'Hip Hop': { swing: 25, sub: '16th', drum: 'Hip Hop', feel: 'Hip Hop', chord: 'smart', bass: 'neo', soloist: 'neo' },
    'Blues': { swing: 100, sub: '8th', drum: 'Blues Shuffle', feel: 'Blues', chord: 'jazz', bass: 'quarter', soloist: 'blues' },
    'Neo-Soul': { swing: 30, sub: '16th', drum: 'Neo-Soul', feel: 'Neo-Soul', chord: 'smart', bass: 'neo', soloist: 'neo' },
    'Reggae': { swing: 20, sub: '16th', drum: 'Reggae', feel: 'Reggae', chord: 'smart', bass: 'dub', soloist: 'blues' },
    'Acoustic': { swing: 15, sub: '8th', drum: 'Acoustic', feel: 'Acoustic', chord: 'pad', bass: 'half', soloist: 'minimal' },
    'Bossa': { swing: 0, sub: '16th', drum: 'Bossa Nova', feel: 'Bossa Nova', chord: 'jazz', bass: 'bossa', soloist: 'bossa' }
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
            chip.textContent = item.name;
            chip.dataset.id = itemId;
            chip.dataset.category = item.category || 'Other';
            if (itemId === activeId) chip.classList.add('active');
            chip.onclick = () => onSelect(item, chip);
            container.appendChild(chip);
        });
    };

    renderCategorized(ui.chordStylePresets, CHORD_STYLES, 'chord-style', cb.style, (item) => updateStyle('chord', item.id));
    renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', sb.style, (item) => updateStyle('soloist', item.id));
    renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bb.style, (item) => updateStyle('bass', item.id));

    const drumPresetsArray = Object.keys(DRUM_PRESETS).map(name => ({
        name,
        ...DRUM_PRESETS[name]
    }));
    
    renderCategorized(ui.drumPresets, drumPresetsArray, 'drum-preset', gb.lastDrumPreset, (item, chip) => {
        loadDrumPreset(item.name);
        document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll(`.drum-preset-chip[data-id="${item.name}"]`).forEach(c => c.classList.add('active'));
        gb.lastDrumPreset = item.name;
        syncWorker();
        saveCurrentState();
    });

    if (ui.smartDrumPresets) {
        renderCategorized(ui.smartDrumPresets, drumPresetsArray, 'drum-preset', gb.lastDrumPreset, (item, chip) => {
            loadDrumPreset(item.name);
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            document.querySelectorAll(`.drum-preset-chip[data-id="${item.name}"]`).forEach(c => c.classList.add('active'));
            gb.lastDrumPreset = item.name;
            syncWorker();
            saveCurrentState();
        });
    }

    renderCategorized(ui.chordPresets, CHORD_PRESETS, 'chord-preset', arranger.lastChordPreset, (item, chip) => {
        if (ctx.isPlaying && togglePlay) togglePlay();
        
        arranger.sections = item.sections.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value
        }));
        
        if (item.settings) {
            if (ctx.applyPresetSettings) {
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
        chip.classList.add('active');
        saveCurrentState();
    });
}

export function setupUIHandlers(refs) {
    const { 
        togglePlay, saveDrumPattern, previewChord, init
    } = refs;

    const openExportModal = () => {
        ui.arrangerActionMenu.classList.remove('open');
        ui.arrangerActionTrigger.classList.remove('active');
        ui.settingsOverlay.classList.remove('active');
        
        let defaultName = arranger.lastChordPreset || "Ensemble Export";
        defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${ctx.bpm}bpm`;
        
        ui.exportOverlay.classList.add('active');
    };

    if (ui.intensitySlider) {
        ui.intensitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch('SET_BAND_INTENSITY', val / 100);
            if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
            applyConductor();
        });
    }

    if (ui.complexitySlider) {
        ui.complexitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch('SET_COMPLEXITY', val / 100);
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
            dispatch('SET_AUTO_INTENSITY', e.target.checked);
            ui.intensitySlider.disabled = ctx.autoIntensity;
            if (ctx.autoIntensity) {
                ui.intensitySlider.style.opacity = 0.5;
            } else {
                ui.intensitySlider.style.opacity = 1;
            }
            saveCurrentState();
        });
    }

    document.querySelectorAll('.genre-btn').forEach(btn => {
        if (btn.dataset.genre === gb.lastSmartGenre) btn.classList.add('active');
        btn.addEventListener('click', () => {
            const genre = btn.dataset.genre;
            
            if (ctx.isPlaying) {
                // Remove existing pending classes
                document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('pending'));
                // Mark this one as pending
                btn.classList.add('pending');
                showToast(`Queued ${genre} for next measure...`);
            } else {
                // Immediate change if not playing
                document.querySelectorAll('.genre-btn').forEach(b => {
                    b.classList.remove('active', 'pending');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                gb.lastSmartGenre = genre;
            }
            
            const config = SMART_GENRES[genre];
            if (config) {
                dispatch('SET_GENRE_FEEL', {
                    genreName: genre,
                    feel: config.feel,
                    swing: config.swing,
                    sub: config.sub,
                    drum: config.drum,
                    chord: config.chord,
                    bass: config.bass,
                    soloist: config.soloist
                });
                
                // If not playing, update UI controls immediately
                if (!ctx.isPlaying) {
                    ui.swingSlider.value = config.swing;
                    if (config.sub) ui.swingBase.value = config.sub;
                    loadDrumPreset(config.drum);
                    
                    const modules = [
                        { id: 'chord', state: cb, configKey: 'chord' },
                        { id: 'bass', state: bb, configKey: 'bass' },
                        { id: 'soloist', state: sb, configKey: 'soloist' }
                    ];

                    modules.forEach(m => {
                        if (m.state.activeTab === 'smart') {
                            dispatch('SET_STYLE', { module: m.state === cb ? 'cb' : (m.state === bb ? 'bb' : 'sb'), style: 'smart' });
                            const chipSelector = { 'chord': '.chord-style-chip', 'bass': '.bass-style-chip', 'soloist': '.soloist-style-chip' }[m.id];
                            document.querySelectorAll(chipSelector).forEach(c => c.classList.remove('active'));
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
        [ui.templatesBtn, 'click', () => {
            const isVisible = ui.templatesContainer.style.display === 'flex';
            ui.templatesContainer.style.display = isVisible ? 'none' : 'flex';
        }],
        [ui.undoBtn, 'click', () => undo(refreshArrangerUI)],
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
        [ui.randomizeBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            pushHistory();
            const newProg = generateRandomProgression(cb.style);
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
            section.value = mutateProgression(section.value, cb.style);
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
            if (ui.exportDrumsCheck.checked) includedTracks.push('drums');
            
            const loopMode = document.querySelector('input[name="exportMode"]:checked').value;
            const targetDuration = parseFloat(ui.exportDurationInput.value);
            const filename = ui.exportFilenameInput.value.trim();

            ui.exportOverlay.classList.remove('active');
            exportToMidi({ includedTracks, loopMode, targetDuration, filename });
        }],
        [ui.clearDrums, 'click', () => { 
            gb.instruments.forEach(i => i.steps.fill(0)); 
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

    document.querySelectorAll('input[name="exportMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
             if (e.target.value === 'time') {
                 ui.exportDurationContainer.style.opacity = '1';
                 ui.exportDurationContainer.style.pointerEvents = 'auto';
                 ui.exportDurationInput.focus();
             } else {
                 ui.exportDurationContainer.style.opacity = '0.5';
                 ui.exportDurationContainer.style.pointerEvents = 'none';
             }
        });
    });

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
    ui.keySelect.addEventListener('change', () => {
        arranger.key = ui.keySelect.value;
        updateRelKeyButton();
        updateKeySelectLabels();
        validateAndAnalyze();
        saveCurrentState();
    });

    ui.timeSigSelect.addEventListener('change', () => {
        arranger.timeSignature = ui.timeSigSelect.value;
        arranger.grouping = null; // Reset to default for new time signature
        
        // Reload drum preset to adapt to new time signature (e.g. 4/4 -> 7/4)
        if (gb.lastDrumPreset) {
            loadDrumPreset(gb.lastDrumPreset);
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

    ui.practiceModeCheck.addEventListener('change', e => {
        cb.practiceMode = e.target.checked;
        validateAndAnalyze();
        saveCurrentState();
    });

    ui.themeSelect.addEventListener('change', e => {
        applyTheme(e.target.value);
        saveCurrentState();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (ctx.theme === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    ui.densitySelect.addEventListener('change', e => { 
        dispatch('SET_DENSITY', e.target.value); 
        validateAndAnalyze(); 
        flushBuffers(); 
        saveCurrentState();
    });

    const volumeNodes = [
        { el: ui.chordVol, state: cb, gain: 'chordsGain', mult: MIXER_GAIN_MULTIPLIERS.chords },
        { el: ui.bassVol, state: bb, gain: 'bassGain', mult: MIXER_GAIN_MULTIPLIERS.bass },
        { el: ui.soloistVol, state: sb, gain: 'soloistGain', mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { el: ui.drumVol, state: gb, gain: 'drumsGain', mult: MIXER_GAIN_MULTIPLIERS.drums },
        { el: ui.masterVol, state: ctx, gain: 'masterGain', mult: MIXER_GAIN_MULTIPLIERS.master }
    ];
    volumeNodes.forEach(({ el, state, gain, mult }) => {
        el.addEventListener('input', e => {
            const val = parseFloat(e.target.value);
            if (state !== ctx) state.volume = val;
            if (ctx[gain]) {
                const target = Math.max(0.0001, val * mult);
                ctx[gain].gain.setValueAtTime(ctx[gain].gain.value, ctx.audio.currentTime);
                ctx[gain].gain.exponentialRampToValueAtTime(target, ctx.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    const reverbNodes = [
        { el: ui.chordReverb, state: cb, gain: 'chordsReverb' },
        { el: ui.bassReverb, state: bb, gain: 'bassReverb' },
        { el: ui.soloistReverb, state: sb, gain: 'soloistReverb' },
        { el: ui.drumReverb, state: gb, gain: 'drumsReverb' }
    ];
    reverbNodes.forEach(({ el, state, gain }) => {
        el.addEventListener('input', e => {
            state.reverb = parseFloat(e.target.value);
            if (ctx[gain]) {
                const target = Math.max(0.0001, state.reverb);
                ctx[gain].gain.setValueAtTime(ctx[gain].gain.value, ctx.audio.currentTime);
                ctx[gain].gain.exponentialRampToValueAtTime(target, ctx.audio.currentTime + 0.04);
            }
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    // --- Volume Sliders ---

    ui.swingSlider.addEventListener('input', e => { gb.swing = parseInt(e.target.value); saveCurrentState(); });
    ui.swingBase.addEventListener('change', e => { gb.swingSub = e.target.value; saveCurrentState(); });
    ui.humanizeSlider.addEventListener('input', e => { gb.humanize = parseInt(e.target.value); saveCurrentState(); });
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

    ui.haptic.addEventListener('change', () => {
        dispatch('SET_PARAM', { module: 'ctx', param: 'haptic', value: ui.haptic.checked });
    });

    ui.sessionTimerSelect.addEventListener('change', () => {
        dispatch('SET_SESSION_TIMER', parseInt(ui.sessionTimerSelect.value));
    });

    ui.stopAtEndCheck.addEventListener('change', () => {
        dispatch('SET_STOP_AT_END', ui.stopAtEndCheck.checked);
    });

    ui.applyPresetSettings.addEventListener('change', () => {
        dispatch('SET_PRESET_SETTINGS_MODE', ui.applyPresetSettings.checked);
    });

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
            if (tab === 'smart' && module !== 'gb') {
                // Explicitly set style to smart when entering Smart tab
                dispatch('SET_STYLE', { module, style: 'smart' });
                // Clear manual chips in the Classic tab
                const chipSelector = { 'cb': '.chord-style-chip', 'bb': '.bass-style-chip', 'sb': '.soloist-style-chip' }[module];
                if (chipSelector) document.querySelectorAll(chipSelector).forEach(c => c.classList.remove('active'));
                
                flushBuffers();
                syncWorker();
                saveCurrentState();
            }
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (ctx.audio?.state === 'suspended' || ctx.audio?.state === 'interrupted') ctx.audio.resume();
            if (ctx.isPlaying && refs.iosAudioUnlocked) refs.silentAudio.play().catch(() => {});
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
        if (e.key === '[' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (gb.currentMeasure - 1 + gb.measures) % gb.measures; switchMeasure(next); }
        if (e.key === ']' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { const next = (gb.currentMeasure + 1) % gb.measures; switchMeasure(next); }
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) { document.body.classList.remove('chord-maximized'); ui.maximizeChordBtn.textContent = '⛶'; ui.maximizeChordBtn.title = 'Maximize'; renderChordVisualizer(); }
            if (ui.settingsOverlay.classList.contains('active')) ui.settingsOverlay.classList.remove('active');
            if (ui.editorOverlay.classList.contains('active')) ui.editorOverlay.classList.remove('active');
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { if (resizeTimeout) clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => recalculateScrollOffsets(), 150); });

    // Final UI Sync
    updateGroupingUI();
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