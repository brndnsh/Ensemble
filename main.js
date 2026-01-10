import { ctx, gb, cb, bb, sb, vizState, storage, arranger } from './state.js';
import { ui, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState, clearActiveVisuals, createPresetChip, renderSections, initTabs, renderMeasurePagination, setupPanelMenus, renderTemplates, updateActiveChordUI } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch, getVisualTime } from './engine.js';
import { KEY_ORDER, MIXER_GAIN_MULTIPLIERS, APP_VERSION, TIME_SIGNATURES } from './config.js';
import { SONG_TEMPLATES, DRUM_PRESETS, CHORD_PRESETS, CHORD_STYLES, CHORD_INSTRUMENTS, BASS_STYLES, SOLOIST_STYLES } from './presets.js';
import { normalizeKey, getMidi, midiToNote, generateId, compressSections, decompressSections } from './utils.js';
import { validateProgression, generateRandomProgression, mutateProgression, transformRelativeProgression } from './chords.js';
import { chordPatterns } from './accompaniment.js';
import { exportToMidi } from './midi-export.js';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, startWorker, stopWorker, flushWorker, requestBuffer, syncWorker } from './worker-client.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;
let deferredPrompt;
let viz;

/** @type {HTMLAudioElement} */
// Use a slightly longer silent wav to ensure OS recognition as media playback
const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ");
silentAudio.loop = true;

/**
 * Requests a screen wake lock to prevent the device from sleeping during practice.
 * @async
 */
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { ctx.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

/**
 * Releases the active screen wake lock.
 */
function releaseWakeLock() { 
    if (ctx.wakeLock) { 
        ctx.wakeLock.release(); 
        ctx.wakeLock = null; 
    } 
}

/**
 * Generic style update function for all modules.
 * @param {string} type - 'chord', 'bass', or 'soloist'
 * @param {string} styleId - The ID of the selected style
 */
const UPDATE_STYLE_CONFIG = {
    chord: { state: cb, selector: '.chord-style-chip', field: 'style' },
    chordInstrument: { state: cb, selector: '.chord-instrument-chip', field: 'instrument' },
    bass: { state: bb, selector: '.bass-style-chip', field: 'style' },
    soloist: { state: sb, selector: '.soloist-style-chip', field: 'style' }
};

function updateStyle(type, styleId) {
    const c = UPDATE_STYLE_CONFIG[type];
    if (!c) return;
    const field = c.field || 'style';
    c.state[field] = styleId;
    document.querySelectorAll(c.selector).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === styleId);
    });

    flushBuffers();
    syncWorker();
    saveCurrentState();
}

/**
 * Applies the selected theme to the document.
 * @param {'auto'|'light'|'dark'} theme 
 */
function applyTheme(theme) {
    ctx.theme = theme;
    if (theme === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }
    if (ui.themeSelect) ui.themeSelect.value = theme;
}

function updateRelKeyButton() {
    if (ui.relKeyBtn) {
        ui.relKeyBtn.textContent = arranger.isMinor ? 'min' : 'maj';
    }
}

/**
 * Updates the text content of options in the key selector to reflect major/minor status.
 */
function updateKeySelectLabels() {
    if (!ui.keySelect) return;
    Array.from(ui.keySelect.options).forEach(opt => {
        const root = opt.value;
        opt.textContent = `Key: ${root}${arranger.isMinor ? 'm' : ''}`;
    });
}

/**
 * Toggles the key between Major and its Relative Minor (or vice-versa).
 */
function switchToRelativeKey() {
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger.key));
    const wasMinor = arranger.isMinor;
    
    // Relative shift: Major -> Minor is -3. Minor -> Major is +3.
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];
    
    arranger.key = newKey;
    arranger.isMinor = !wasMinor;
    ui.keySelect.value = newKey;
    
    // Rewrite all sections
    pushHistory();
    arranger.sections.forEach(section => {
        section.value = transformRelativeProgression(section.value, shift, arranger.isMinor);
    });
    
    updateRelKeyButton();
    updateKeySelectLabels();
    refreshArrangerUI();
    syncWorker();
    showToast(`Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`);
}

/**
 * Toggles the global play/stop state.
 */
function togglePlay() {
    if (ctx.isPlaying) {
        ctx.isPlaying = false;
        ui.playBtn.textContent = 'START';
        ui.playBtn.classList.remove('playing');
        stopWorker();
        silentAudio.pause();
        silentAudio.currentTime = 0;
        releaseWakeLock();

        // Immediate Visual Reset
        ctx.drawQueue = [];
        ctx.lastActiveDrumElements = null;
        cb.lastActiveChordIndex = null;
        clearActiveVisuals(viz);
        flushBuffers();
        
        // Reset scroll position to start
        ui.sequencerGrid.scrollTo({ left: 0, behavior: 'smooth' });

        // Let tails ring out, then suspend AudioContext to save power
        if (ctx.audio) {
            if (ctx.suspendTimeout) clearTimeout(ctx.suspendTimeout);
            ctx.suspendTimeout = setTimeout(() => {
                if (!ctx.isPlaying && ctx.audio.state === 'running') {
                    ctx.audio.suspend();
                }
            }, 3000); 
        }
    } else {
        if (ctx.suspendTimeout) clearTimeout(ctx.suspendTimeout);
        initAudio();
        ctx.step = 0;
        flushBuffers();
        syncWorker();
        if (!iosAudioUnlocked) {
            silentAudio.play().catch(e => console.log("Audio unlock failed", e));
            iosAudioUnlocked = true;
        } else {
            silentAudio.play().catch(e => {});
        }
        ctx.isPlaying = true;
        ui.playBtn.textContent = 'STOP';
        ui.playBtn.classList.add('playing');
        
        // Add a small 50ms padding to the start time to prevent scheduling in the "past"
        const startTime = ctx.audio.currentTime + 0.05;
        ctx.nextNoteTime = startTime;
        ctx.unswungNextNoteTime = startTime;
        
        ctx.isCountingIn = ui.countIn.checked;
        ctx.countInBeat = 0;
        requestWakeLock();
        
        if (viz) viz.setBeatReference(ctx.nextNoteTime);

        if (!ctx.isDrawing) {
            ctx.isDrawing = true;
            requestAnimationFrame(draw);
        }
        
        startWorker();
        scheduler();
    }
}

const POWER_CONFIG = {
    chord: { state: cb, els: [ui.chordPowerBtn, ui.chordPowerBtnDesktop] },
    groove: { state: gb, els: [ui.groovePowerBtn, ui.groovePowerBtnDesktop], cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
    bass: { state: bb, els: [ui.bassPowerBtn, ui.bassPowerBtnDesktop] },
    soloist: { state: sb, els: [ui.soloistPowerBtn, ui.soloistPowerBtnDesktop] },
    viz: { 
        state: vizState, 
        els: [ui.vizPowerBtn], 
        cleanup: () => { 
            if (viz) viz.clear(); 
            if (ui.vizPanel) ui.vizPanel.classList.add('collapsed');
        },
        onEnable: () => {
            if (ui.vizPanel) ui.vizPanel.classList.remove('collapsed');
        }
    }
};

/**
 * Toggles the enabled state of a module.
 * @param {'chord'|'groove'|'bass'|'soloist'} type 
 */
function togglePower(type) {
    const c = POWER_CONFIG[type];
    if (!c) return;
    
    c.state.enabled = !c.state.enabled;
    
    c.els.forEach(el => {
        if (el) el.classList.toggle('active', c.state.enabled);
    });
    
    if (!c.state.enabled && c.cleanup) {
        c.cleanup();
    } else if (c.state.enabled) {
        if (c.onEnable) c.onEnable();
        if (['chord', 'bass', 'soloist'].includes(type)) {
            flushBuffers();
        }
    }
    syncWorker();
    saveCurrentState();
    if (ctx.isPlaying && c.state.enabled) scheduler();
}

export function flushBuffers() {
    if (bb.lastPlayedFreq !== null) bb.lastFreq = bb.lastPlayedFreq;
    bb.buffer.clear();

    if (sb.lastPlayedFreq !== null) sb.lastFreq = sb.lastPlayedFreq;
    sb.buffer.clear();
    
    flushWorker(ctx.step);
}

function saveCurrentState() {
    const data = {
        sections: arranger.sections,
        key: arranger.key,
        timeSignature: arranger.timeSignature,
        isMinor: arranger.isMinor,
        notation: arranger.notation,
        lastChordPreset: arranger.lastChordPreset,
        theme: ctx.theme,
        bpm: ctx.bpm,
        metronome: ui.metronome.checked,
        applyPresetSettings: ui.applyPresetSettings.checked,
        vizEnabled: vizState.enabled,
        cb: { enabled: cb.enabled, style: cb.style, instrument: cb.instrument, octave: cb.octave, density: cb.density, volume: cb.volume, reverb: cb.reverb },
        bb: { enabled: bb.enabled, style: bb.style, octave: bb.octave, volume: bb.volume, reverb: bb.reverb },
        sb: { enabled: sb.enabled, style: sb.style, octave: sb.octave, volume: sb.volume, reverb: sb.reverb },
        gb: { 
            enabled: gb.enabled,
            volume: gb.volume, 
            reverb: gb.reverb, 
            swing: gb.swing, 
            swingSub: gb.swingSub, 
            measures: gb.measures, 
            humanize: gb.humanize, 
            autoFollow: gb.autoFollow, 
            lastDrumPreset: gb.lastDrumPreset,
            pattern: gb.instruments.map(inst => ({ name: inst.name, steps: [...inst.steps] }))
        }
    };
    storage.save('currentState', data);
}

/**
 * Clears the active chord preset state and highlights.
 */
function clearChordPresetHighlight() {
    arranger.lastChordPreset = null;
    document.querySelectorAll('.chord-preset-chip').forEach(c => c.classList.remove('active'));
}

/**
 * Clears the active drum preset state and highlights.
 */
export function clearDrumPresetHighlight() {
    gb.lastDrumPreset = null;
    document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
}

/**
 * Triggers a full refresh of the arranger UI, validation, and persistence.
 */
function refreshArrangerUI() {
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
}

function onSectionUpdate(id, field, value) {
    if (field === 'reorder') {
        const newSections = value.map(sid => arranger.sections.find(s => s.id === sid));
        // Check if order actually changed before pushing history
        if (JSON.stringify(newSections.map(s => s.id)) !== JSON.stringify(arranger.sections.map(s => s.id))) {
            pushHistory();
            arranger.sections = newSections;
        } else {
            return; // No change
        }
    } else {
        const index = arranger.sections.findIndex(s => s.id === id);
        if (index === -1) return;
        const section = arranger.sections[index];

        if (field === 'move') {
            const newIndex = index + value;
            if (newIndex >= 0 && newIndex < arranger.sections.length) {
                pushHistory();
                // Swap sections
                const temp = arranger.sections[index];
                arranger.sections[index] = arranger.sections[newIndex];
                arranger.sections[newIndex] = temp;
            } else {
                return;
            }
        } else {
            section[field] = value;
        }
    }
    
    // Structural changes (reorder, move, add/delete) require full re-render
    // Value/label/color changes shouldn't re-render everything to preserve focus
    if (field === 'reorder' || field === 'move') {
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    }

    if (field === 'reorder' || field === 'move' || field === 'value') {
        clearChordPresetHighlight();
    }

    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
}

function onSectionDelete(id) {
    if (arranger.sections.length <= 1) return;
    arranger.sections = arranger.sections.filter(s => s.id !== id);
    clearChordPresetHighlight();
    refreshArrangerUI();
}

function onSectionDuplicate(id) {
    const section = arranger.sections.find(s => s.id === id);
    if (!section) return;
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger.sections.findIndex(s => s.id === id);
    arranger.sections.splice(index + 1, 0, newSection);
    clearChordPresetHighlight();
    refreshArrangerUI();
}

function addSection() {
    arranger.sections.push({ id: generateId(), label: `Section ${arranger.sections.length + 1}`, value: 'I' });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

function applyTemplate(template) {
    if (confirm(`Replace current arrangement with "${template.name}"?`)) {
        pushHistory();
        arranger.sections = template.sections.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value,
            color: '#3b82f6'
        }));
        arranger.isMinor = template.isMinor || false;
        updateRelKeyButton();
        updateKeySelectLabels();
        clearChordPresetHighlight();
        refreshArrangerUI();
        ui.templatesContainer.style.display = 'none';
        showToast(`Template "${template.name}" applied`);
    }
}

/**
 * The main audio scheduler loop.
 */
function scheduler() {
    requestBuffer(ctx.step);
    while (ctx.nextNoteTime < ctx.audio.currentTime + ctx.scheduleAheadTime) {
        if (ctx.isCountingIn) {
            scheduleCountIn(ctx.countInBeat, ctx.nextNoteTime);
            advanceCountIn();
        } else {
            // We pass the swung time to the general scheduler, 
            // but we'll calculate an unswung version for the soloist inside.
            scheduleGlobalEvent(ctx.step, ctx.nextNoteTime);
            advanceGlobalStep();
        }
    }
}

function getStepsPerMeasure() {
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    return ts.beats * ts.stepsPerBeat;
}

function advanceCountIn() {
    const beatDuration = 60.0 / ctx.bpm;
    ctx.nextNoteTime += beatDuration;
    ctx.unswungNextNoteTime += beatDuration;
    ctx.countInBeat++;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (ctx.countInBeat >= ts.beats) {
        ctx.isCountingIn = false;
        ctx.step = 0; 
    }
}

/**
 * Schedules the count-in metronome clicks.
 * @param {number} beat 
 * @param {number} time 
 */
function scheduleCountIn(beat, time) {
     if (ui.visualFlash.checked) {
        ctx.drawQueue.push({ type: 'flash', time: time, intensity: 0.3, beat: 1 });
     }
     const osc = ctx.audio.createOscillator();
     const gain = ctx.audio.createGain();
     osc.connect(gain);
     gain.connect(ctx.masterGain);
     
     const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
     // Use the pulse definition to determine accents. 
     // We map the 'beat' index (0, 1, 2...) to steps. 
     // For simple meters, beat * stepsPerBeat usually aligns with pulse[0], pulse[1]...
     // But for 5/4 or 7/8, the pulse array is [0, 4, 8...] or [0, 4, 8].
     // Let's just check if the current beat index corresponds to a primary accent.
     // Beat 0 is always the downbeat (880Hz).
     // Secondary strong beats (like beat 3 in 4/4) could be 660Hz.
     // Weak beats 440Hz.
     
     let freq = 440;
     if (beat === 0) {
         freq = 1000; // Downbeat
     } else if (ts.grouping) {
         // Odd meter logic
         // Grouping "3+2" -> Accent on beat 0 and beat 3
         // Grouping "2+2+3" -> Accent on beat 0, 2, 4
         const groups = ts.grouping.split('+').map(Number);
         let accumulated = 0;
         for (let g of groups) {
             if (beat === accumulated && beat !== 0) {
                 freq = 800; // Secondary accent
                 break;
             }
             accumulated += g;
         }
     } else {
         // Standard meter logic (4/4, 3/4)
         if (beat === 0) freq = 1000;
         else if (arranger.timeSignature === '4/4' && beat === 2) freq = 800; // Beat 3 accent
         else if (arranger.timeSignature === '6/8' && beat === 3) freq = 800; // Beat 4 accent (dotted quarter)
         else if (arranger.timeSignature === '12/8' && (beat === 3 || beat === 6 || beat === 9)) freq = 800;
     }

     osc.frequency.setValueAtTime(freq, time);
     gain.gain.setValueAtTime(0.3, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
     osc.onended = () => { gain.disconnect(); osc.disconnect(); };
     osc.start(time);
     osc.stop(time + 0.1);
}

/**
 * Advances the global clock based on BPM and swing settings.
 */
function advanceGlobalStep() {
    const secondsPerBeat = 60.0 / ctx.bpm;
    const sixteenth = 0.25 * secondsPerBeat;
    let duration = sixteenth;
    
    if (gb.swing > 0) {
        const shift = (sixteenth / 3) * (gb.swing / 100);
        if (gb.swingSub === '16th') {
            duration += (ctx.step % 2 === 0) ? shift : -shift;
        } else { 
            duration += ((ctx.step % 4) < 2) ? shift : -shift;
        }
    }
    ctx.nextNoteTime += duration;
    ctx.unswungNextNoteTime += sixteenth;
    ctx.step++;
}

/**
 * Finds the active chord for a given global step.
 * Uses the cached step map for O(1) or O(N) lookup without reduction.
 */
function getChordAtStep(step) {
    if (arranger.totalSteps === 0) return null;

    const targetStep = step % arranger.totalSteps;

    for (let i = 0; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            return { 
                chord: entry.chord, 
                stepInChord: targetStep - entry.start, 
                chordIndex: i 
            };
        }
    }
    return null;
}

function scheduleDrums(step, time, isDownbeat, isQuarter, isBackbeat) {
    gb.instruments.forEach(inst => {
        const stepVal = inst.steps[step];
        if (stepVal > 0 && !inst.muted) {
            let velocity = stepVal === 2 ? 1.25 : 0.9;
            if (inst.name === 'Kick') {
                velocity *= isDownbeat ? 1.15 : (isQuarter ? 1.05 : 0.9);
            } else if (inst.name === 'Snare') {
                velocity *= isBackbeat ? 1.1 : 0.9;
            } else if (inst.name === 'HiHat' || inst.name === 'Open') {
                velocity *= isQuarter ? 1.1 : 0.85;
            }
            playDrumSound(inst.name, time, velocity);
        }
    });
}

function scheduleBass(chordData, step, time) {
    const noteEntry = bb.buffer.get(step);
    bb.buffer.delete(step); // Cleanup

    if (noteEntry && noteEntry.freq) {
        const { freq, chordData: cData, durationMultiplier, velocity, timingOffset } = noteEntry; 
        const { chord } = cData || chordData;
        const adjustedTime = time + (timingOffset || 0);
        
        bb.lastPlayedFreq = freq;
        const midi = getMidi(freq);
        const { name, octave } = midiToNote(midi);
        
        const spb = 60.0 / ctx.bpm;
        let duration;
        if (durationMultiplier) {
            duration = 0.25 * spb * durationMultiplier;
        } else {
            duration = (bb.style === 'whole' ? chord.beats : (bb.style === 'half' ? 2 : 1)) * spb;
        }
        
        if (vizState.enabled) {
            ctx.drawQueue.push({ 
                type: 'bass_vis', name, octave, midi, time: adjustedTime,
                chordNotes: chord.freqs.map(f => getMidi(f)),
                duration
            });
        }
        playBassNote(freq, adjustedTime, duration, velocity || 1.0, noteEntry.muted);
    }
}

function scheduleSoloist(chordData, step, time, unswungTime) {
    const noteEntry = sb.buffer.get(step);
    sb.buffer.delete(step); // Cleanup

    if (noteEntry && noteEntry.freq) {
        const { freq, extraFreq, extraMidi, extraFreq2, extraMidi2, durationMultiplier, velocity, bendStartInterval, style, chordData: cData, timingOffset, noteType } = noteEntry;
        const { chord } = cData || chordData;
        
        const offsetS = (timingOffset || 0) / 1000;
        const adjustedTime = time + offsetS;
        
        sb.lastPlayedFreq = freq;
        const midi = noteEntry.midi || getMidi(freq);
        const { name, octave } = midiToNote(midi);

        const spb = 60.0 / ctx.bpm;
        const duration = 0.25 * spb * (durationMultiplier || 1);
        const vel = velocity || 1.0;
        
        // Neo-soul "Lazy" Lag: Additional variable delay for neo style
        const styleLag = style === 'neo' ? (0.01 + Math.random() * 0.035) : 0;
        const playTime = unswungTime + styleLag + offsetS;

        playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);

        if (vizState.enabled) {
            // Double/Triple Stop Handling
            if (extraFreq && extraMidi) {
                playSoloNote(extraFreq, playTime, duration, vel * 0.7, bendStartInterval || 0, style);
                const extra = midiToNote(extraMidi);
                ctx.drawQueue.push({ 
                    type: 'soloist_vis', name: extra.name, octave: extra.octave, midi: extraMidi, time: playTime,
                    chordNotes: chord.freqs.map(f => getMidi(f)),
                    duration,
                    noteType
                });
            }
            
            if (extraFreq2 && extraMidi2) {
                playSoloNote(extraFreq2, playTime, duration, vel * 0.5, bendStartInterval || 0, style);
                const extra2 = midiToNote(extraMidi2);
                ctx.drawQueue.push({ 
                    type: 'soloist_vis', name: extra2.name, octave: extra2.octave, midi: extraMidi2, time: playTime,
                    chordNotes: chord.freqs.map(f => getMidi(f)),
                    duration,
                    noteType
                });
            }

            ctx.drawQueue.push({ 
                type: 'soloist_vis', name, octave, midi, time: playTime,
                chordNotes: chord.freqs.map(f => getMidi(f)),
                duration,
                noteType
            });
        } else {
            // Still play extra notes if not visualizing
            if (extraFreq) playSoloNote(extraFreq, playTime, duration, vel * 0.7, bendStartInterval || 0, style);
            if (extraFreq2) playSoloNote(extraFreq2, playTime, duration, vel * 0.5, bendStartInterval || 0, style);
        }

        sb.lastNoteEnd = playTime + duration;
    }
}

function scheduleChordVisuals(chordData, time) {
    const { chord, stepInChord, chordIndex } = chordData;
    const spb = 60.0 / ctx.bpm;
    
    if (stepInChord === 0) {
        ctx.drawQueue.push({ 
            type: 'chord_vis', index: chordIndex, time,
            chordNotes: [...chord.freqs.map(f => getMidi(f))],
            rootMidi: chord.rootMidi,
            intervals: [...chord.intervals],
            duration: chord.beats * spb
        });
    }
}

function scheduleChords(chordData, step, time) {
    const { chord, stepInChord, chordIndex } = chordData;
    const spb = 60.0 / ctx.bpm;
    const stepsPerMeasure = getStepsPerMeasure();
    const measureStep = step % stepsPerMeasure;
    
    const pattern = chordPatterns[cb.style];
    if (pattern) {
        pattern(chord, time, spb, stepInChord, measureStep, step);
    }
}

function scheduleGlobalEvent(step, swungTime) {
    const stepsPerMeasure = getStepsPerMeasure();
    const drumStep = step % (gb.measures * stepsPerMeasure);
    // Dynamic jitter based on humanize setting (0ms to ~25ms)
    const jitterAmount = (gb.humanize / 100) * 0.025;
    const jitter = (Math.random() - 0.5) * jitterAmount;
    const t = swungTime + jitter;
    
    // Metronome Click
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (ui.metronome.checked && ts.pulse.includes(step % stepsPerMeasure)) {
        const beatIndex = (step % stepsPerMeasure) / ts.stepsPerBeat;
        let freq = 600;
        
        // Downbeat (Beat 1)
        if (step % stepsPerMeasure === 0) {
            freq = 1000;
        } else if (ts.grouping) {
            // Odd meter logic (same as count-in)
            const groups = ts.grouping.split('+').map(Number);
            let accumulated = 0;
            for (let g of groups) {
                if (Math.abs(beatIndex - accumulated) < 0.01 && beatIndex !== 0) {
                    freq = 800; // Secondary accent
                    break;
                }
                accumulated += g;
            }
        } else {
            // Standard meter accents (same as count-in)
            if (arranger.timeSignature === '4/4' && Math.abs(beatIndex - 2) < 0.01) freq = 800;
            else if (arranger.timeSignature === '6/8' && Math.abs(beatIndex - 3) < 0.01) freq = 800;
            else if (arranger.timeSignature === '12/8' && (Math.abs(beatIndex - 3) < 0.01 || Math.abs(beatIndex - 6) < 0.01 || Math.abs(beatIndex - 9) < 0.01)) freq = 800;
        }

        const osc = ctx.audio.createOscillator();
        const gain = ctx.audio.createGain();
        osc.connect(gain);
        gain.connect(ctx.masterGain);
        osc.frequency.setValueAtTime(freq, swungTime);
        gain.gain.setValueAtTime(0.15, swungTime);
        gain.gain.exponentialRampToValueAtTime(0.001, swungTime + 0.05);
        osc.start(swungTime);
        osc.stop(swungTime + 0.05);
        osc.onended = () => { gain.disconnect(); osc.disconnect(); };
    }

    // Dynamic straightness based on soloist style
    let straightness = 0.65;
    if (sb.style === 'neo') straightness = 0.35;
    else if (sb.style === 'blues') straightness = 0.45;
    
    const soloistTime = (ctx.unswungNextNoteTime * straightness) + (swungTime * (1.0 - straightness)) + jitter;

    if (gb.enabled) {
        if (ts.pulse.includes(drumStep % stepsPerMeasure) && ui.visualFlash.checked) {
            ctx.drawQueue.push({ type: 'flash', time: swungTime, intensity: (drumStep % stepsPerMeasure === 0 ? 0.2 : 0.1), beat: (drumStep % stepsPerMeasure === 0 ? 1 : 0) });
        }
        ctx.drawQueue.push({ type: 'drum_vis', step: drumStep, time: swungTime });
        // Map current step to a 4/4 equivalent for simple styles or pass the context
        // We pass the raw drumStep and rely on the fact that drum patterns are 128 long.
        // But for odd meters, we might want to truncate the pattern read.
        // For now, let's just pass the step.
        scheduleDrums(drumStep, t, drumStep % stepsPerMeasure === 0, ts.pulse.includes(drumStep % stepsPerMeasure), false);
    }

    const chordData = getChordAtStep(step);
    if (!chordData) return;

    scheduleChordVisuals(chordData, t);

    if (bb.enabled) scheduleBass(chordData, step, t);
    if (sb.enabled) scheduleSoloist(chordData, step, t, soloistTime);
    if (cb.enabled) scheduleChords(chordData, step, t);
}

function cloneMeasure() {
    const stepsPerMeasure = getStepsPerMeasure();
    const sourceOffset = gb.currentMeasure * stepsPerMeasure;
    gb.instruments.forEach(inst => {
        const pattern = inst.steps.slice(sourceOffset, sourceOffset + stepsPerMeasure);
        for (let m = 0; m < gb.measures; m++) {
            if (m === gb.currentMeasure) continue;
            const targetOffset = m * stepsPerMeasure;
            for (let i = 0; i < stepsPerMeasure; i++) {
                inst.steps[targetOffset + i] = pattern[i];
            }
        }
    });
    showToast(`Measure ${gb.currentMeasure + 1} copied to all`);
    renderGridState();
}

function updateDrumVis(ev) {
    if (ctx.lastActiveDrumElements) {
        ctx.lastActiveDrumElements.forEach(s => s.classList.remove('playing'));
    }
    
    const stepsPerMeasure = getStepsPerMeasure();
    // Auto-follow logic: switch measure page if needed
    const stepMeasure = Math.floor(ev.step / stepsPerMeasure);
    if (gb.autoFollow && stepMeasure !== gb.currentMeasure && ctx.isPlaying) {
        switchMeasure(stepMeasure);
    }

    const offset = gb.currentMeasure * stepsPerMeasure;
    if (ev.step >= offset && ev.step < offset + stepsPerMeasure) {
        const localStep = ev.step - offset;
        const activeSteps = gb.cachedSteps[localStep];
        if (activeSteps) {
            activeSteps.forEach(s => s.classList.add('playing'));
            ctx.lastActiveDrumElements = activeSteps;
        } else {
            ctx.lastActiveDrumElements = null;
        }
    } else {
        ctx.lastActiveDrumElements = null;
    }
    ctx.lastPlayingStep = ev.step;
}

function updateChordVis(ev) {
    updateActiveChordUI(ev.index);
}

/**
 * The main animation loop for visual feedback.
 */
function draw() {
    if (!ctx.audio) return;
    if (!ctx.isPlaying && ctx.drawQueue.length === 0) {
        ctx.isDrawing = false;
        clearActiveVisuals(viz);
        return;
    }

    const now = getVisualTime();
    
    // Efficient queue cleanup: remove only old events from the front
    while (ctx.drawQueue.length > 0 && ctx.drawQueue[0].time < now - 2.0) {
        ctx.drawQueue.shift();
    }
    
    // Safety cap for extremely long queues (unlikely but safe)
    if (ctx.drawQueue.length > 300) {
        ctx.drawQueue = ctx.drawQueue.slice(ctx.drawQueue.length - 200);
    }

    // Process events ready to draw
    // We iterate without shifting immediately so we can render things that started slightly in the past but are still valid?
    // Actually, the original logic shifted them as it processed them. 
    // BUT, the original logic checked: while (ctx.drawQueue.length && ctx.drawQueue[0].time <= now)
    // This consumes the event.
    
    // The visualization needs persistent state for things like "currently active chord".
    // "drum_vis" sets a class. "chord_vis" sets a class. 
    // If we shift them out, they are "processed".
    
    while (ctx.drawQueue.length && ctx.drawQueue[0].time <= now) {
        const ev = ctx.drawQueue.shift();
        if (ev.type === 'drum_vis') updateDrumVis(ev);
        else if (ev.type === 'chord_vis') {
            updateChordVis(ev);
            if (viz && vizState.enabled) viz.pushChord({ 
                time: ev.time, 
                notes: ev.chordNotes, 
                rootMidi: ev.rootMidi, 
                intervals: ev.intervals, 
                duration: ev.duration 
            });
        }
        else if (ev.type === 'bass_vis') {
            if (viz && vizState.enabled) viz.pushNote('bass', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        }
        else if (ev.type === 'soloist_vis') {
            if (viz && vizState.enabled) viz.pushNote('soloist', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        }
        else if (ev.type === 'flash') triggerFlash(ev.intensity);
    }
    
    if (viz && vizState.enabled) {
        viz.setRegister('bass', bb.octave);
        viz.setRegister('soloist', sb.octave);
        viz.setRegister('chords', cb.octave);
        viz.render(now, ctx.bpm);
    }

    requestAnimationFrame(draw);
}

// --- PERSISTENCE ---
function saveProgression() {
    if (arranger.progression.length === 0) return;
    const name = prompt("Name this progression:");
    if (name) {
        // We use compressed sections for storage to keep it compact and structured
        const compressed = compressSections(arranger.sections);
        userPresets.push({ name, sections: compressed });
        storage.save('userPresets', userPresets);
        renderUserPresets();
        showToast("Progression saved");
    }
}

function renderUserPresets() {
    ui.userPresetsContainer.innerHTML = '';
    if (userPresets.length === 0) { ui.userPresetsContainer.style.display = 'none'; return; }
    ui.userPresetsContainer.style.display = 'flex';
    userPresets.forEach((p, idx) => {
        const chip = createPresetChip(p.name, () => window.deleteUserPreset(idx), () => {
            if (p.sections) {
                arranger.sections = decompressSections(p.sections);
            } else if (p.prog) {
                // Legacy support
                arranger.sections = [{ id: generateId(), label: 'Main', value: p.prog }];
            }
            arranger.lastChordPreset = p.name;
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
            validateProgression(renderChordVisualizer);
            flushBuffers();
            document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            saveCurrentState();
        });
        if (p.name === arranger.lastChordPreset) chip.classList.add('active');
        ui.userPresetsContainer.appendChild(chip);
    });
}

window.deleteUserPreset = (idx) => {
    if (confirm("Delete this preset?")) {
        userPresets.splice(idx, 1);
        storage.save('userPresets', userPresets);
        renderUserPresets();
    }
};

function saveDrumPattern() {
    const name = prompt("Name this drum pattern:");
    if (name) {
        const pattern = gb.instruments.map(inst => ({ name: inst.name, steps: [...inst.steps] }));
        userDrumPresets.push({ name, pattern, measures: gb.measures, swing: gb.swing, swingSub: gb.swingSub });
        storage.save('userDrumPresets', userDrumPresets);
        renderUserDrumPresets();
        showToast("Drum pattern saved");
    }
}

function renderUserDrumPresets() {
    ui.userDrumPresetsContainer.innerHTML = '';
    if (userDrumPresets.length === 0) { ui.userDrumPresetsContainer.style.display = 'none'; return; }
    ui.userDrumPresetsContainer.style.display = 'flex';
    userDrumPresets.forEach((p, idx) => {
        const chip = createPresetChip(p.name, () => window.deleteUserDrumPreset(idx), () => {
            if (p.measures) {
                gb.measures = p.measures;
                gb.currentMeasure = 0;
                ui.drumBarsSelect.value = p.measures;
                renderMeasurePagination(switchMeasure);
                renderGrid();
            }
            p.pattern.forEach(savedInst => {
                const inst = gb.instruments.find(i => i.name === savedInst.name);
                if (inst) {
                    inst.steps.fill(0); // Clear existing
                    savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
                }
            });
            if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
            if (p.swingSub) { gb.swingSub = p.swingSub; ui.swingBase.value = p.swingSub; }
            gb.lastDrumPreset = p.name;
            renderGridState();
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            saveCurrentState();
        }, 'drum-preset-chip');
        if (p.name === gb.lastDrumPreset) chip.classList.add('active');
        ui.userDrumPresetsContainer.appendChild(chip);
    });
}

window.deleteUserDrumPreset = (idx) => {
    if (confirm("Delete this drum pattern?")) {
        userDrumPresets.splice(idx, 1);
        storage.save('userDrumPresets', userDrumPresets);
        renderUserDrumPresets();
    }
};

function updateMeasures(val) {
    gb.measures = parseInt(val);
    clearDrumPresetHighlight();
    if (gb.currentMeasure >= gb.measures) gb.currentMeasure = 0;
    renderMeasurePagination(switchMeasure);
    renderGrid();
    saveCurrentState();
}

function switchMeasure(idx) {
    if (gb.currentMeasure === idx) return;
    gb.currentMeasure = idx;
    renderMeasurePagination(switchMeasure);
    renderGrid();
}

/**
 * Pushes the current arranger state to the history stack.
 */
function pushHistory() {
    arranger.history.push(JSON.stringify(arranger.sections));
    if (arranger.history.length > 20) arranger.history.shift(); // Limit history
}

function undo() {
    if (arranger.history.length === 0) return;
    const last = arranger.history.pop();
    arranger.sections = JSON.parse(last);
    clearChordPresetHighlight();
    refreshArrangerUI();
    showToast("Undo successful");
}

function setupUIHandlers() {
    const openExportModal = () => {
        ui.arrangerActionMenu.classList.remove('open');
        ui.arrangerActionTrigger.classList.remove('active');
        ui.settingsOverlay.classList.remove('active');
        
        // Pre-populate Filename
        let defaultName = arranger.lastChordPreset || "Ensemble Export";
        // Clean up name
        defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        ui.exportFilenameInput.value = `${defaultName} - ${arranger.key} - ${ctx.bpm}bpm`;
        
        ui.exportOverlay.classList.add('active');
    };

    const listeners = [
        [ui.playBtn, 'click', togglePlay],
        [ui.bpmInput, 'change', e => setBpm(e.target.value)],
        [ui.tapBtn, 'click', handleTap],
        [ui.addSectionBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            addSection();
        }],
        [ui.templatesBtn, 'click', () => {
            const isVisible = ui.templatesContainer.style.display === 'flex';
            ui.templatesContainer.style.display = isVisible ? 'none' : 'flex';
        }],
        [ui.undoBtn, 'click', undo],
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
            
            // If we have a last interacted section, replace its value
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId);
            
            if (section) {
                section.value = newProg;
                showToast(`Randomized ${section.label}`);
            } else {
                // Fallback to replacing everything if no section found
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
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            saveProgression();
        }],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.shareBtn, 'click', () => {
            ui.arrangerActionMenu.classList.remove('open');
            ui.arrangerActionTrigger.classList.remove('active');
            shareProgression();
        }],
        [ui.transUpBtn, 'click', () => transposeKey(1)],
        [ui.transDownBtn, 'click', () => transposeKey(-1)],
        [ui.relKeyBtn, 'click', switchToRelativeKey],
        [ui.installAppBtn, 'click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    ui.installAppBtn.style.display = 'none';
                }
                deferredPrompt = null;
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

    // Radio Button Handlers for Export
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

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) {
                document.body.classList.remove('chord-maximized');
                ui.maximizeChordBtn.textContent = '⛶';
                ui.maximizeChordBtn.title = 'Maximize';
                renderChordVisualizer();
            }
        }
    });

    // Editor Overlay Listeners
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
    ui.keySelect.addEventListener('change', e => { 
        arranger.key = e.target.value; 
        arranger.isMinor = false;
        updateRelKeyButton();
        updateKeySelectLabels();
        validateProgression(renderChordVisualizer); 
        flushBuffers(); 
        saveCurrentState();
    });

    ui.timeSigSelect.addEventListener('change', e => {
        arranger.timeSignature = e.target.value;
        loadDrumPreset(gb.lastDrumPreset);
        validateProgression(renderChordVisualizer);
        flushBuffers();
        saveCurrentState();
    });
    
    ui.notationSelect.addEventListener('change', e => { 
        arranger.notation = e.target.value; 
        renderChordVisualizer(); 
        saveCurrentState();
    });

    ui.themeSelect.addEventListener('change', e => {
        applyTheme(e.target.value);
        saveCurrentState();
    });

    // Listen for system theme changes if in 'auto' mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (ctx.theme === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    ui.densitySelect.addEventListener('change', e => { 
        cb.density = e.target.value; 
        validateProgression(renderChordVisualizer); 
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
            if (ctx[gain]) ctx[gain].gain.setTargetAtTime(val * mult, ctx.audio.currentTime, 0.02);
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
            if (ctx[gain]) ctx[gain].gain.setTargetAtTime(state.reverb, ctx.audio.currentTime, 0.02);
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    const octaveSliders = [
        { el: ui.octave, state: cb, label: ui.octaveLabel, callback: () => validateProgression(renderChordVisualizer) },
        { el: ui.bassOctave, state: bb, label: ui.bassOctaveLabel, header: ui.bassHeaderReg },
        { el: ui.soloistOctave, state: sb, label: ui.soloistOctaveLabel, header: ui.soloistHeaderReg }
    ];
    octaveSliders.forEach(({ el, state, label, header, callback }) => {
        el.addEventListener('input', e => {
            state.octave = parseInt(e.target.value);
            updateOctaveLabel(label, state.octave, header);
            if (callback) callback();
            flushBuffers();
        });
        el.addEventListener('change', () => saveCurrentState());
    });

    ui.swingSlider.addEventListener('input', e => { gb.swing = parseInt(e.target.value); saveCurrentState(); });
    ui.swingBase.addEventListener('change', e => { gb.swingSub = e.target.value; saveCurrentState(); });
    ui.humanizeSlider.addEventListener('input', e => { gb.humanize = parseInt(e.target.value); saveCurrentState(); });
    ui.autoFollowCheck.addEventListener('change', e => { gb.autoFollow = e.target.checked; saveCurrentState(); });
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

    // Global Option Checkboxes
    [ui.metronome, ui.countIn, ui.visualFlash, ui.haptic, ui.applyPresetSettings].forEach(el => {
        el.addEventListener('change', () => saveCurrentState());
    });

    Object.keys(POWER_CONFIG).forEach(type => {
        const c = POWER_CONFIG[type];
        c.els.forEach(el => {
            if (el) el.addEventListener('click', () => togglePower(type));
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (ctx.audio?.state === 'suspended' || ctx.audio?.state === 'interrupted') ctx.audio.resume();
            if (ctx.isPlaying && iosAudioUnlocked) silentAudio.play().catch(() => {});
        }
    });

    window.addEventListener('ensemble_state_change', saveCurrentState);

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        if (ui.installAppBtn) {
            ui.installAppBtn.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        // Clear the deferredPrompt so it can be garbage collected
        deferredPrompt = null;
        // Hide the install button
        if (ui.installAppBtn) {
            ui.installAppBtn.style.display = 'none';
        }
        showToast('App installed successfully!');
    });

    // Custom Event to Open Editor
    document.addEventListener('open-editor', (e) => {
        ui.editorOverlay.classList.add('active');
        const sectionId = e.detail?.sectionId;
        if (sectionId) {
            setTimeout(() => {
                const card = ui.sectionList.querySelector(`.section-card[data-id="${sectionId}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Optional: Highlight effect
                    card.style.borderColor = 'var(--accent-color)';
                    setTimeout(() => card.style.borderColor = '', 1000);
                }
            }, 100);
        }
    });

    window.addEventListener('keydown', e => {
        const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
        
        if (e.key === ' ' && !isTyping) {
            e.preventDefault(); togglePlay();
        }
        // Open Editor with 'e'
        if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (ui.editorOverlay.classList.contains('active')) {
                ui.editorOverlay.classList.remove('active');
            } else {
                ui.editorOverlay.classList.add('active');
            }
        }
        // Numeric hotkeys for Accompanist tabs
        if (['1', '2', '3', '4'].includes(e.key) && !isTyping) {
            const index = parseInt(e.key) - 1;
            const tabItem = document.querySelectorAll('.tab-item')[index];
            if (tabItem) {
                const btn = tabItem.querySelector('.tab-btn');
                if (btn) btn.click();
            }
        }
        if (e.key === '[' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            const next = (gb.currentMeasure - 1 + gb.measures) % gb.measures;
            switchMeasure(next);
        }
        if (e.key === ']' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            const next = (gb.currentMeasure + 1) % gb.measures;
            switchMeasure(next);
        }
        if (e.key === 'Escape') {
            const layout = document.querySelector('.app-main-layout');
            if (layout.classList.contains('chord-maximized')) {
                layout.classList.remove('chord-maximized');
                ui.maximizeChordBtn.textContent = '⛶';
                ui.maximizeChordBtn.title = 'Maximize';
            }
            if (ui.settingsOverlay.classList.contains('active')) {
                ui.settingsOverlay.classList.remove('active');
            }
            if (ui.editorOverlay.classList.contains('active')) {
                ui.editorOverlay.classList.remove('active');
            }
        }
    });
}

function setupPresets() {
    const renderCategorized = (container, data, type, activeId, onSelect) => {
        container.innerHTML = '';
        // Sort by category to keep similar colors together
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

    // Style Presets
    renderCategorized(ui.chordStylePresets, CHORD_STYLES, 'chord-style', cb.style, (item) => updateStyle('chord', item.id));
    renderCategorized(ui.chordInstrumentPresets, CHORD_INSTRUMENTS, 'chord-instrument', cb.instrument, (item) => updateStyle('chordInstrument', item.id));
    renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', sb.style, (item) => updateStyle('soloist', item.id));
    renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bb.style, (item) => updateStyle('bass', item.id));

    // Drum Presets
    const drumPresetsArray = Object.keys(DRUM_PRESETS).map(name => ({
        name,
        ...DRUM_PRESETS[name]
    }));
    renderCategorized(ui.drumPresets, drumPresetsArray, 'drum-preset', gb.lastDrumPreset, (item, chip) => {
        loadDrumPreset(item.name);
        document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        gb.lastDrumPreset = item.name;
        saveCurrentState();
    });

    // Chord Progression Presets
    renderCategorized(ui.chordPresets, CHORD_PRESETS, 'chord-preset', arranger.lastChordPreset, (item, chip) => {
        arranger.sections = item.sections.map(s => ({
            id: generateId(),
            label: s.label,
            value: s.value
        }));
        
        // Context-Aware Settings
        if (item.settings) {
            // Apply BPM and Style ONLY if the user has opted in (default: true)
            if (ui.applyPresetSettings.checked) {
                if (item.settings.bpm) {
                    setBpm(item.settings.bpm);
                }
                if (item.settings.style) {
                    updateStyle('chord', item.settings.style);
                }
            }
            // Always apply structural changes like Time Signature to ensure the loop works
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
        validateProgression(renderChordVisualizer);
        flushBuffers();
        document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        saveCurrentState();
    });
}

function init() {
    try {
        const savedState = storage.get('currentState');
        if (savedState && savedState.sections) {
            arranger.sections = savedState.sections;
            arranger.key = savedState.key || 'C';
            arranger.timeSignature = savedState.timeSignature || '4/4';
            arranger.isMinor = savedState.isMinor || false;
            arranger.notation = savedState.notation || 'roman';
            arranger.lastChordPreset = savedState.lastChordPreset || 'Pop (Standard)';
            ctx.theme = savedState.theme || 'auto';
            ctx.bpm = savedState.bpm || 100;
            vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
            
            // Restore Accompanist Settings
            if (savedState.cb) {
                cb.enabled = savedState.cb.enabled !== undefined ? savedState.cb.enabled : true;
                cb.style = savedState.cb.style || 'pad';
                cb.instrument = savedState.cb.instrument || 'Clean';
                cb.octave = savedState.cb.octave;
                cb.density = savedState.cb.density;
                cb.volume = savedState.cb.volume;
                cb.reverb = savedState.cb.reverb;
            }
            if (savedState.bb) {
                bb.enabled = savedState.bb.enabled !== undefined ? savedState.bb.enabled : false;
                bb.style = savedState.bb.style || 'arp';
                bb.octave = savedState.bb.octave;
                bb.volume = savedState.bb.volume;
                bb.reverb = savedState.bb.reverb;
            }
            if (savedState.sb) {
                sb.enabled = savedState.sb.enabled !== undefined ? savedState.sb.enabled : false;
                sb.style = savedState.sb.style || 'scalar';
                sb.octave = savedState.sb.octave;
                sb.volume = savedState.sb.volume;
                sb.reverb = savedState.sb.reverb;
            }
            if (savedState.gb) {
                gb.enabled = savedState.gb.enabled !== undefined ? savedState.gb.enabled : true;
                gb.volume = savedState.gb.volume;
                gb.reverb = savedState.gb.reverb;
                gb.swing = savedState.gb.swing;
                gb.swingSub = savedState.gb.swingSub;
                gb.measures = savedState.gb.measures || 1;
                gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20;
                gb.autoFollow = savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true;
                gb.lastDrumPreset = savedState.gb.lastDrumPreset || 'Standard';
                
                if (savedState.gb.pattern) {
                    savedState.gb.pattern.forEach(savedInst => {
                        const inst = gb.instruments.find(i => i.name === savedInst.name);
                        if (inst) {
                            inst.steps.fill(0);
                            savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
                        }
                    });
                }

                gb.currentMeasure = 0;
            }

            // Sync UI
            ui.keySelect.value = arranger.key;
            ui.timeSigSelect.value = arranger.timeSignature;
            ui.bpmInput.value = ctx.bpm;
            ui.notationSelect.value = arranger.notation;
            ui.densitySelect.value = cb.density;
            ui.octave.value = cb.octave;
            ui.bassOctave.value = bb.octave;
            ui.soloistOctave.value = sb.octave;
            ui.chordVol.value = cb.volume;
            ui.chordReverb.value = cb.reverb;
            ui.bassVol.value = bb.volume;
            ui.bassReverb.value = bb.reverb;
            ui.soloistVol.value = sb.volume;
            ui.soloistReverb.value = sb.reverb;
            ui.drumVol.value = gb.volume;
            ui.drumReverb.value = gb.reverb;
            ui.swingSlider.value = gb.swing;
            ui.swingBase.value = gb.swingSub;
            ui.humanizeSlider.value = gb.humanize;
            ui.autoFollowCheck.checked = gb.autoFollow;
            ui.drumBarsSelect.value = gb.measures;
            ui.metronome.checked = savedState.metronome || false;
            ui.applyPresetSettings.checked = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false;

            applyTheme(ctx.theme);

            updateRelKeyButton();
            updateKeySelectLabels();
            updateOctaveLabel(ui.octaveLabel, cb.octave);
            updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
            updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
        } else {
            applyTheme('auto');
        }

        viz = new UnifiedVisualizer('unifiedVizContainer');
        viz.addTrack('bass', 'var(--success-color)');
        viz.addTrack('soloist', 'var(--soloist-color)');
        
        initTabs(); 
        setupPanelMenus();

        renderGrid();
        renderMeasurePagination(switchMeasure);
        
        if (!savedState || !savedState.gb || !savedState.gb.pattern) {
            loadDrumPreset('Standard');
        }

        setupPresets();
        renderTemplates(SONG_TEMPLATES, applyTemplate);
        setupUIHandlers();
        renderUserPresets();
        renderUserDrumPresets();
        loadFromUrl();
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        validateProgression(renderChordVisualizer);
        updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
        updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);

        // Sync Power Buttons UI
        Object.keys(POWER_CONFIG).forEach(type => {
            const c = POWER_CONFIG[type];
            c.els.forEach(el => {
                if (el) el.classList.toggle('active', c.state.enabled);
            });
            if (type === 'viz' && ui.vizPanel) {
                ui.vizPanel.classList.toggle('collapsed', !c.state.enabled);
            }
        });
        
        // Logic Worker handles timing AND generative musical logic
        initWorker(
            () => scheduler(), 
            (notes) => {
                notes.forEach(n => {
                    if (n.module === 'bb') bb.buffer.set(n.step, n);
                    else if (n.module === 'sb') sb.buffer.set(n.step, n);
                });
            }
        );

        syncWorker();
        // Show the app after everything is ready
        document.querySelector('.app-main-layout').classList.add('loaded');
        
        const versionEl = document.getElementById('appVersion');
        if (versionEl) versionEl.textContent = `Ensemble v${APP_VERSION}`;
    } catch (e) { console.error("Error during init:", e); }
}

function setBpm(val) {
    const newBpm = Math.max(40, Math.min(240, parseInt(val)));
    if (newBpm === ctx.bpm) return;
    
    if (ctx.isPlaying && ctx.audio) {
        const now = ctx.audio.currentTime, ratio = ctx.bpm / newBpm;
        const noteTimeRemaining = ctx.nextNoteTime - now;
        if (noteTimeRemaining > 0) ctx.nextNoteTime = now + (noteTimeRemaining * ratio);
        
        const unswungNoteTimeRemaining = ctx.unswungNextNoteTime - now;
        if (unswungNoteTimeRemaining > 0) ctx.unswungNextNoteTime = now + (unswungNoteTimeRemaining * ratio);
    }
    ctx.bpm = newBpm; ui.bpmInput.value = newBpm;
    syncWorker();
    saveCurrentState();

    if (viz && ctx.isPlaying && ctx.audio) {
        const secondsPerBeat = 60.0 / ctx.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        // Use unswung time and measure alignment for stable grid
        const stepsPerMeasure = getStepsPerMeasure();
        const measureTime = ctx.unswungNextNoteTime - (ctx.step % stepsPerMeasure) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}

function transposeKey(delta) {
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(ui.keySelect.value));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];
    ui.keySelect.value = newKey;
    arranger.key = newKey;
    
    // Improved exclusion regex to avoid transposing Roman/NNS accidentals or numerals
    const isMusicalNotation = (part) => {
        return part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) || 
               part.match(/^[#b](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i);
    };

    arranger.sections.forEach(section => {
        const parts = section.value.split(/([\s,|,-]+)/);
        const transposed = parts.map(part => {
            const noteMatch = part.match(/^([A-G][#b]?)(.*)/i);
            if (noteMatch && !isMusicalNotation(part)) {
                const root = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
                const newRoot = KEY_ORDER[(KEY_ORDER.indexOf(root) + delta + 12) % 12];
                return newRoot + noteMatch[2];
            }
            return part;
        });
        section.value = transposed.join('');
    });
    
    clearChordPresetHighlight();
    refreshArrangerUI();
    updateRelKeyButton();
    updateKeySelectLabels();
    syncWorker();
}

function loadDrumPreset(name) {
    let p = DRUM_PRESETS[name];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    gb.lastDrumPreset = name;
    gb.measures = p.measures || 1; 
    gb.currentMeasure = 0;
    ui.drumBarsSelect.value = String(gb.measures);
    
    if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
    if (p.sub) { gb.swingSub = p.sub; ui.swingBase.value = p.sub; }
    gb.instruments.forEach(inst => {
        const stepsPerMeasure = getStepsPerMeasure();
        const pattern = p[inst.name] || new Array(stepsPerMeasure).fill(0);
        inst.steps.fill(0);
        pattern.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
    });
    renderMeasurePagination(switchMeasure);
    renderGrid();
}

let tapTimes = [];
function handleTap() {
    const now = Date.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length-1] > 2000) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 2) {
        const intervals = [];
        for (let i=1; i<tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i-1]);
        const avg = intervals.reduce((a,b)=>a+b)/intervals.length;
        setBpm(Math.round(60000/avg));
    }
}

function resetToDefaults() {
    ctx.bpm = 100;
    arranger.notation = 'roman';
    arranger.key = 'C';
    arranger.timeSignature = '4/4';
    applyTheme('auto');
    arranger.sections.forEach(s => s.color = '#3b82f6');
    
    cb.volume = 0.5;
    cb.reverb = 0.3;
    cb.instrument = 'Clean';
    cb.octave = 65;
    cb.density = 'standard';
    
    bb.volume = 0.45;
    bb.reverb = 0.05;
    bb.octave = 41;
    
    sb.volume = 0.5;
    sb.reverb = 0.6;
    sb.octave = 77;
    
    gb.volume = 0.5;
    gb.reverb = 0.2;
    gb.swing = 0;
    gb.swingSub = '8th';

    ui.bpmInput.value = 100;
    ui.keySelect.value = 'C';
    ui.timeSigSelect.value = '4/4';
    ui.notationSelect.value = 'roman';
    ui.densitySelect.value = 'standard';
    ui.octave.value = 65;
    ui.bassOctave.value = 41;
    ui.soloistOctave.value = 77;
    ui.chordVol.value = 0.5;
    ui.chordReverb.value = 0.3;
    ui.bassVol.value = 0.45;
    ui.bassReverb.value = 0.05;
    ui.soloistVol.value = 0.5;
    ui.soloistReverb.value = 0.6;
    ui.drumVol.value = 0.5;
    ui.drumReverb.value = 0.2;
    ui.swingSlider.value = 0;
    ui.swingBase.value = '8th';
    ui.masterVol.value = 0.5;
    ui.countIn.checked = true;
    ui.metronome.checked = false;
    ui.visualFlash.checked = false;
    ui.haptic.checked = false;
    if (ctx.masterGain) ctx.masterGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.master, ctx.audio.currentTime, 0.02);
    if (ctx.chordsGain) ctx.chordsGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.chords, ctx.audio.currentTime, 0.02);
    if (ctx.bassGain) ctx.bassGain.gain.setTargetAtTime(0.45 * MIXER_GAIN_MULTIPLIERS.bass, ctx.audio.currentTime, 0.02);
    if (ctx.soloistGain) ctx.soloistGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.soloist, ctx.audio.currentTime, 0.02);
    if (ctx.drumsGain) ctx.drumsGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.drums, ctx.audio.currentTime, 0.02);

    updateOctaveLabel(ui.octaveLabel, cb.octave);
    updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
    updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
    
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    
    gb.instruments.forEach(inst => {
        inst.steps = new Array(128).fill(0);
        inst.muted = false;
    });
    loadDrumPreset('Standard');
    renderGrid(); 

    saveCurrentState();
    showToast("Settings reset");
}

function shareProgression() {
    try {
        const params = new URLSearchParams();
        params.set('s', compressSections(arranger.sections));
        params.set('key', ui.keySelect.value);
        params.set('ts', arranger.timeSignature);
        params.set('bpm', ui.bpmInput.value);
        params.set('style', cb.style);
        params.set('notation', arranger.notation);
        const url = window.location.origin + window.location.pathname + '?' + params.toString();
        
        navigator.clipboard.writeText(url).then(() => {
            showToast("Share link copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy URL: ", err);
            showToast("Failed to copy link. Please copy it from the address bar.");
        });
    } catch (e) {
        console.error("Error generating share link:", e);
        showToast("Error generating share link.");
    }
}

/**
 * Auditions a specific chord from the progression.
 * Used for the "Click to Audition" feature.
 * @param {number} index 
 */
window.previewChord = (index) => {
    if (ctx.isPlaying) return;
    initAudio();
    const chord = arranger.progression[index];
    if (!chord) return;
    
    // Play the full chord once
    const now = ctx.audio.currentTime;
    chord.freqs.forEach(f => playNote(f, now, 1.0, { vol: 0.15, att: 0.02 }));

    // Visual feedback
    const cards = document.querySelectorAll('.chord-card');
    if (cards[index]) {
        cards[index].classList.add('active');
        setTimeout(() => {
            if (!ctx.isPlaying) cards[index].classList.remove('active');
        }, 300);
    }
};

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    if (params.get('s')) {
        arranger.sections = decompressSections(params.get('s'));
        hasParams = true;
    } else if (params.get('prog')) {
        arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }];
        hasParams = true;
    }
    
    if (hasParams) {
        clearChordPresetHighlight();
    }
    
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); arranger.key = ui.keySelect.value; }
    if (params.get('ts')) { arranger.timeSignature = params.get('ts'); ui.timeSigSelect.value = arranger.timeSignature; }
    if (params.get('bpm')) { ctx.bpm = parseInt(params.get('bpm')); ui.bpmInput.value = ctx.bpm; }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

window.addEventListener('load', () => {
    init();

    if ('serviceWorker' in navigator) {
        let newWorker;
        const updateBanner = document.getElementById('updateBanner');
        const refreshBtn = document.getElementById('updateRefreshBtn');

        refreshBtn.addEventListener('click', () => {
            if (newWorker) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
        });

        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('SW registered');
            
            // Check for updates every hour
            setInterval(() => {
                reg.update();
            }, 60 * 60 * 1000);
            
            reg.addEventListener('updatefound', () => {
                newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New update available
                        updateBanner.classList.add('show');
                    }
                });
            });
        }).catch(err => console.log('SW failed', err));

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }
});