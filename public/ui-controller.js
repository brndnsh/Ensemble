import { ACTIONS } from './types.js';
import { ui, showToast, renderChordVisualizer, renderSections, renderGridState, recalculateScrollOffsets, renderTemplates, updateRelKeyButton, updateKeySelectLabels } from './ui.js';
import { ctx, cb, bb, sb, gb, arranger, dispatch } from './state.js';
import { saveCurrentState } from './persistence.js';
import { restoreGains } from './engine.js';
import { syncWorker } from './worker-client.js';
import { generateId, formatUnicodeSymbols } from './utils.js';
import { CHORD_STYLES, SOLOIST_STYLES, BASS_STYLES, DRUM_PRESETS, CHORD_PRESETS, SONG_TEMPLATES } from './presets.js';
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
        chord: { selector: '.chord-style-chip', module: 'cb', panelId: 'chord' },
        bass: { selector: '.bass-style-chip', module: 'bb', panelId: 'bass' },
        soloist: { selector: '.soloist-style-chip', module: 'sb', panelId: 'soloist' }
    };
    const c = UPDATE_STYLE_CONFIG[type];
    if (!c) return;
    
    dispatch(ACTIONS.SET_STYLE, { module: c.module, style: styleId });

    // When a manual style is selected, we switch the tab to 'classic' automatically
    // unless the style being set is 'smart' (though usually smart is set via tabs)
    if (styleId !== 'smart') {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: c.module, tab: 'classic' });
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
    'Bossa': { swing: 0, sub: '16th', drum: 'Bossa Nova', feel: 'Bossa Nova', chord: 'jazz', bass: 'bossa', soloist: 'bossa' },
    'Country': { swing: 55, sub: '16th', drum: 'Country (Two-Step)', feel: 'Country', chord: 'strum-country', bass: 'country', soloist: 'country' },
    'Metal': { swing: 0, sub: '16th', drum: 'Metal (Speed)', feel: 'Metal', chord: 'power-metal', bass: 'metal', soloist: 'metal' }
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

    renderCategorized(ui.chordStylePresets, CHORD_STYLES, 'chord-style', cb.style, (item) => updateStyle('chord', item.id));
    renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', sb.style, (item) => updateStyle('soloist', item.id));
    renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bb.style, (item) => updateStyle('bass', item.id));

    const drumPresetsArray = Object.keys(DRUM_PRESETS).map(name => ({
        name,
        ...DRUM_PRESETS[name]
    }));
    
    renderCategorized(ui.drumPresets, drumPresetsArray, 'drum-preset', gb.lastDrumPreset, (item) => {
        loadDrumPreset(item.name);
        document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll(`.drum-preset-chip[data-id="${item.name}"]`).forEach(c => c.classList.add('active'));
        gb.lastDrumPreset = item.name;
        syncWorker();
        saveCurrentState();
    });

    if (ui.smartDrumPresets) {
        renderCategorized(ui.smartDrumPresets, drumPresetsArray, 'drum-preset', gb.lastDrumPreset, (item) => {
            loadDrumPreset(item.name);
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            document.querySelectorAll(`.drum-preset-chip[data-id="${item.name}"]`).forEach(c => c.classList.add('active'));
            gb.lastDrumPreset = item.name;
            syncWorker();
            saveCurrentState();
        });
    }

    renderCategorized(ui.chordPresets, CHORD_PRESETS, 'chord-preset', arranger.lastChordPreset, (item) => {
        if (arranger.isDirty) {
            if (!confirm("Discard your custom arrangement and load this preset?")) return;
        }

        if (ctx.isPlaying && togglePlay) togglePlay();
        
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
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${ctx.bpm}bpm`;
        
        ui.exportOverlay.classList.add('active');
    };

    if (ui.intensitySlider) {
        ui.intensitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_BAND_INTENSITY, val / 100);
            if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
            applyConductor();
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
                gb.lastSmartGenre = genre;
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
                            dispatch(ACTIONS.SET_STYLE, { module: m.state === cb ? 'cb' : (m.state === bb ? 'bb' : 'sb'), style: 'smart' });
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
        [ui.analyzeAudioBtn, 'click', (e) => {
            console.log("[Analyzer] analyzeAudioBtn triggered");
            e.stopPropagation();
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            
            // Trigger the reset logic from the specialized handler
            if (window.resetAnalyzer) window.resetAnalyzer();
            
            ui.analyzerOverlay.classList.add('active');
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
        dispatch(ACTIONS.SET_DENSITY, e.target.value); 
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

    ui.swingSlider.addEventListener('input', e => { gb.swing = parseInt(e.target.value); saveCurrentState(); });
    ui.swingBase.addEventListener('change', e => { gb.swingSub = e.target.value; saveCurrentState(); });
    ui.humanizeSlider.addEventListener('input', e => { gb.humanize = parseInt(e.target.value); saveCurrentState(); });
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

    ui.haptic.addEventListener('change', () => {
        dispatch(ACTIONS.SET_PARAM, { module: 'ctx', param: 'haptic', value: ui.haptic.checked });
    });

    if (ui.sessionTimerCheck && ui.sessionTimerInput) {
        const updateTimerUI = (isChecked) => {
            ui.sessionTimerDurationContainer.style.opacity = isChecked ? '1' : '0.4';
            ui.sessionTimerDurationContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
            if (ui.sessionTimerStepper) {
                ui.sessionTimerStepper.style.borderColor = isChecked ? 'var(--accent-color)' : 'var(--border-color)';
                ui.sessionTimerStepper.style.backgroundColor = isChecked ? 'var(--card-bg)' : 'var(--input-bg)';
            }
        };

        const currentTimer = ctx.sessionTimer || 0;
        ui.sessionTimerCheck.checked = currentTimer > 0;
        ui.sessionTimerInput.value = currentTimer > 0 ? currentTimer : 5;
        updateTimerUI(currentTimer > 0);

        ui.sessionTimerCheck.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const duration = isChecked ? parseFloat(ui.sessionTimerInput.value) : 0;
            updateTimerUI(isChecked);
            dispatch(ACTIONS.SET_SESSION_TIMER, duration);
        });

        ui.sessionTimerInput.addEventListener('change', (e) => {
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, parseFloat(e.target.value));
            }
        });

        const adjustTimer = (delta) => {
            const current = parseInt(ui.sessionTimerInput.value);
            const next = Math.max(1, Math.min(20, current + delta));
            ui.sessionTimerInput.value = next;
            if (ui.sessionTimerCheck.checked) {
                dispatch(ACTIONS.SET_SESSION_TIMER, next);
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

        ui.larsModeCheck.checked = gb.larsMode;
        updateLarsUI(gb.larsMode);
        
        ui.larsModeCheck.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_LARS_MODE, e.target.checked);
            updateLarsUI(e.target.checked);
            updateBpmUI();
            saveCurrentState();
        });
    }

    if (ui.larsIntensitySlider) {
        ui.larsIntensitySlider.value = Math.round(gb.larsIntensity * 100);
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
            if (tab === 'smart' && module !== 'gb') {
                dispatch(ACTIONS.SET_STYLE, { module, style: 'smart' });
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

    ui.closeAnalyzerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.analyzerOverlay.classList.remove('active');
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
    };
    window.resetAnalyzer = resetAnalyzer;

    const drawWaveform = (buffer) => {
        console.log("[Analyzer] Drawing waveform...");
        const canvas = ui.analyzerWaveformCanvas;
        const ctx = canvas.getContext('2d');
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

        ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.clearRect(0, 0, width, height);
        
        // Draw baseline
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, amp);
        ctx.lineTo(width, amp);
        ctx.stroke();

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
        console.log("[Analyzer] Waveform draw complete.");
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
        console.log(`[Analyzer] Handling file: ${file.name} (${file.size} bytes)`);
        ui.analyzerDropZone.style.display = 'none';
        if (ui.liveListenContainer) ui.liveListenContainer.style.display = 'none';
        ui.analyzerProcessing.style.display = 'block'; 
        currentFileName = file.name;
        
        try {
            console.log("[Analyzer] Reading arrayBuffer...");
            const arrayBuffer = await file.arrayBuffer();
            console.log("[Analyzer] Decoding audio data...");
            
            const audioCtx = ctx.audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            currentAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            console.log(`[Analyzer] Decoded: ${currentAudioBuffer.duration.toFixed(2)}s`);
            
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

            const analysis = await analyzer.analyze(currentAudioBuffer, { 
                bpm: customBpm, // Use custom BPM if provided
                startTime,
                endTime,
                onProgress: (pct) => {
                    ui.analyzerProgressBar.style.width = `${pct}%`;
                }
            });

            const { results: beatData, bpm, candidates, beatsPerMeasure } = analysis;

            // Extract structural sections using detected meter and energy
            detectedChords = extractForm(beatData, beatsPerMeasure);
            
            ui.analyzerProgressBar.style.width = '100%';
            ui.analyzerProcessing.style.display = 'none';
            ui.analyzerResults.style.display = 'block';
            
            // Render BPM Candidates
            if (ui.bpmChips && candidates) {
                ui.bpmChips.innerHTML = '';
                candidates.forEach(c => {
                    const chip = document.createElement('div');
                    chip.className = `preset-chip ${c.bpm === bpm ? 'active' : ''}`;
                    chip.textContent = `${c.bpm} BPM`;
                    chip.onclick = () => performAnalysis(c.bpm);
                    ui.bpmChips.appendChild(chip);
                });
            }

            const container = ui.suggestedSectionsContainer;
            container.innerHTML = '<h4>Suggested Structure</h4>';
            
            detectedChords.forEach(s => {
                const item = document.createElement('div');
                item.className = 'suggested-section-item';
                item.innerHTML = `
                    <div class="ss-header">
                        <strong>${s.label}</strong>
                        <span class="ss-repeat">x${s.repeat}</span>
                    </div>
                    <div class="ss-value">${formatUnicodeSymbols(s.value)}</div>
                `;
                container.appendChild(item);
            });

            ui.analyzerSummary.textContent = `Successfully analyzed "${currentFileName}" at ${bpm} BPM (${beatsPerMeasure}/4). Detected ${detectedChords.length} song sections.`;
            
            // Show BPM sync info
            ui.detectedBpmLabel.textContent = bpm;
            ui.analyzerSyncBpmCheck.checked = true; // Default to sync if we found a pulse
            
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

            ui.analyzerDropZone.style.display = 'none';
            ui.liveListenBtn.parentElement.style.display = 'none';
            ui.liveListenView.style.display = 'block';
            
            const history = [];
            const historyEl = ui.liveHistoryDisplay;
            const chordEl = ui.liveChordDisplay;

            // Process audio in 4096 sample chunks
            const processor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(liveAudioCtx.destination);

            let buffer = new Float32Array(0);
            const targetSamples = Math.floor(liveAudioCtx.sampleRate * 1.0); // 1.0s window

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
    ui.startAnalysisBtn.addEventListener('click', performAnalysis);

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
            if (detectedBpm && detectedBpm !== ctx.bpm) {
                setBpm(detectedBpm, ctx.viz);
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

    const channels = ['Chords', 'Bass', 'Soloist', 'Drums'];
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
    if (ui.midiDrumsChannel) ui.midiDrumsChannel.value = midiState.drumsChannel;
    if (ui.midiChordsOctave) ui.midiChordsOctave.value = midiState.chordsOctave;
    if (ui.midiBassOctave) ui.midiBassOctave.value = midiState.bassOctave;
    if (ui.midiSoloistOctave) ui.midiSoloistOctave.value = midiState.soloistOctave;
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
