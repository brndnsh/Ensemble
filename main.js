import { ctx, gb, cb, bb, sb, vizState, storage, arranger } from './state.js';
import { ui, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState, clearActiveVisuals, createPresetChip, renderSections, initTabs, renderMeasurePagination, setupPanelMenus } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch } from './engine.js';
import { KEY_ORDER, DRUM_PRESETS, CHORD_PRESETS, CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, MIXER_GAIN_MULTIPLIERS } from './config.js';
import { normalizeKey, getMidi, midiToNote, generateId, compressSections, decompressSections } from './utils.js';
import { validateProgression, generateRandomProgression } from './chords.js';
import { chordPatterns } from './accompaniment.js';
import { exportToMidi } from './midi-export.js';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, startWorker, stopWorker, flushWorker, requestBuffer, syncWorker } from './worker-client.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;
let viz;
let lastAudioTime = 0;
let lastPerfTime = 0;

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
    chord: { state: cb, selector: '.chord-style-chip' },
    bass: { state: bb, selector: '.bass-style-chip' },
    soloist: { state: sb, selector: '.soloist-style-chip' }
};

function updateStyle(type, styleId) {
    const c = UPDATE_STYLE_CONFIG[type];
    if (!c) return;
    c.state.style = styleId;
    document.querySelectorAll(c.selector).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === styleId);
    });
    flushBuffers();
    syncWorker();
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
    chord: { state: cb, els: [ui.chordPowerBtn, ui.chordPowerBtnDesktop], cleanup: () => document.querySelectorAll('.chord-card.active').forEach(card => card.classList.remove('active')) },
    groove: { state: gb, els: [ui.groovePowerBtn, ui.groovePowerBtnDesktop], cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
    bass: { state: bb, els: [ui.bassPowerBtn, ui.bassPowerBtnDesktop] },
    soloist: { state: sb, els: [ui.soloistPowerBtn, ui.soloistPowerBtnDesktop] },
    viz: { state: vizState, els: [ui.vizPowerBtn], cleanup: () => { if (viz) viz.clear(); } }
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
    } else if (c.state.enabled && ['chord', 'bass', 'soloist'].includes(type)) {
        flushBuffers();
    }
    syncWorker();
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
        notation: arranger.notation,
        theme: ctx.theme,
        bpm: ctx.bpm,
        metronome: ui.metronome.checked,
        style: cb.style,
        cb: { octave: cb.octave, density: cb.density, volume: cb.volume, reverb: cb.reverb },
        bb: { octave: bb.octave, volume: bb.volume, reverb: bb.reverb },
        sb: { octave: sb.octave, volume: sb.volume, reverb: sb.reverb },
        gb: { volume: gb.volume, reverb: gb.reverb, swing: gb.swing, swingSub: gb.swingSub, measures: gb.measures, humanize: gb.humanize, autoFollow: gb.autoFollow }
    };
    storage.save('currentState', data);
}

function onSectionUpdate(id, field, value) {
    const index = arranger.sections.findIndex(s => s.id === id);
    if (index === -1) return;
    const section = arranger.sections[index];

    if (field === 'move') {
        const newIndex = index + value;
        if (newIndex >= 0 && newIndex < arranger.sections.length) {
            // Swap sections
            const temp = arranger.sections[index];
            arranger.sections[index] = arranger.sections[newIndex];
            arranger.sections[newIndex] = temp;
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        }
    } else {
        section[field] = value;
    }
    
    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
}

function onSectionDelete(id) {
    if (arranger.sections.length <= 1) return;
    arranger.sections = arranger.sections.filter(s => s.id !== id);
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
}

function onSectionDuplicate(id) {
    const index = arranger.sections.findIndex(s => s.id === id);
    if (index === -1) return;
    const section = arranger.sections[index];
    const newSection = {
        id: generateId(),
        label: `${section.label} (Copy)`,
        value: section.value
    };
    arranger.sections.splice(index + 1, 0, newSection);
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
}

function addSection() {
    arranger.sections.push({ id: generateId(), label: `Section ${arranger.sections.length + 1}`, value: 'I' });
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    saveCurrentState();
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

function advanceCountIn() {
    const beatDuration = 60.0 / ctx.bpm;
    ctx.nextNoteTime += beatDuration;
    ctx.unswungNextNoteTime += beatDuration;
    ctx.countInBeat++;
    if (ctx.countInBeat >= 4) {
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
     osc.frequency.setValueAtTime(beat === 0 ? 880 : 440, time);
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
 * Caches progression metadata to avoid redundant calculations in the scheduler.
 */
export function updateProgressionCache() {
    if (!arranger.progression.length) {
        arranger.totalSteps = 0;
        arranger.stepMap = [];
        return;
    }

    let current = 0;
    arranger.stepMap = arranger.progression.map(chord => {
        const steps = Math.round(chord.beats * 4);
        const entry = { start: current, end: current + steps, chord };
        current += steps;
        return entry;
    });
    arranger.totalSteps = current;
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
        const { freq, extraFreq, extraMidi, extraFreq2, extraMidi2, durationMultiplier, velocity, bendStartInterval, style, chordData: cData, timingOffset } = noteEntry;
        const { chord } = cData || chordData;
        const adjustedTime = time + (timingOffset || 0);
        
        sb.lastPlayedFreq = freq;
        const midi = noteEntry.midi || getMidi(freq);
        const { name, octave } = midiToNote(midi);

        const spb = 60.0 / ctx.bpm;
        const duration = 0.25 * spb * (durationMultiplier || 1);
        const vel = velocity || 1.0;
        
        // Neo-soul "Lazy" Lag: Additional variable delay for neo style
        const styleLag = style === 'neo' ? (0.01 + Math.random() * 0.035) : 0;
        const playTime = unswungTime + styleLag;

        playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);

        if (vizState.enabled) {
            // Double/Triple Stop Handling
            if (extraFreq && extraMidi) {
                playSoloNote(extraFreq, playTime, duration, vel * 0.7, bendStartInterval || 0, style);
                const extra = midiToNote(extraMidi);
                ctx.drawQueue.push({ 
                    type: 'soloist_vis', name: extra.name, octave: extra.octave, midi: extraMidi, time: playTime,
                    chordNotes: chord.freqs.map(f => getMidi(f)),
                    duration
                });
            }
            
            if (extraFreq2 && extraMidi2) {
                playSoloNote(extraFreq2, playTime, duration, vel * 0.5, bendStartInterval || 0, style);
                const extra2 = midiToNote(extraMidi2);
                ctx.drawQueue.push({ 
                    type: 'soloist_vis', name: extra2.name, octave: extra2.octave, midi: extraMidi2, time: playTime,
                    chordNotes: chord.freqs.map(f => getMidi(f)),
                    duration
                });
            }

            ctx.drawQueue.push({ 
                type: 'soloist_vis', name, octave, midi, time: playTime,
                chordNotes: chord.freqs.map(f => getMidi(f)),
                duration
            });
        } else {
            // Still play extra notes if not visualizing
            if (extraFreq) playSoloNote(extraFreq, playTime, duration, vel * 0.7, bendStartInterval || 0, style);
            if (extraFreq2) playSoloNote(extraFreq2, playTime, duration, vel * 0.5, bendStartInterval || 0, style);
        }

        sb.lastNoteEnd = playTime + duration;
    }
}

function scheduleChords(chordData, step, time) {
    const { chord, stepInChord, chordIndex } = chordData;
    const spb = 60.0 / ctx.bpm;
    const measureStep = step % 16;
    
    if (stepInChord === 0) {
        ctx.drawQueue.push({ 
            type: 'chord_vis', index: chordIndex, time,
            chordNotes: [...chord.freqs.map(f => getMidi(f))],
            rootMidi: chord.rootMidi,
            intervals: [...chord.intervals],
            duration: chord.beats * spb
        });
    }
    
    const pattern = chordPatterns[cb.style];
    if (pattern) {
        pattern(chord, time, spb, stepInChord, measureStep, step);
    }
}

function scheduleGlobalEvent(step, swungTime) {
    const drumStep = step % (gb.measures * 16);
    // Dynamic jitter based on humanize setting (0ms to ~25ms)
    const jitterAmount = (gb.humanize / 100) * 0.025;
    const jitter = (Math.random() - 0.5) * jitterAmount;
    const t = swungTime + jitter;
    
    // Metronome Click
    if (ui.metronome.checked && step % 4 === 0) {
        const isDownbeat = step % 16 === 0;
        const osc = ctx.audio.createOscillator();
        const gain = ctx.audio.createGain();
        osc.connect(gain);
        gain.connect(ctx.masterGain);
        osc.frequency.setValueAtTime(isDownbeat ? 1000 : 600, swungTime);
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
        if (drumStep % 4 === 0 && ui.visualFlash.checked) {
            ctx.drawQueue.push({ type: 'flash', time: swungTime, intensity: (drumStep % 16 === 0 ? 0.2 : 0.1), beat: (drumStep % 16 === 0 ? 1 : 0) });
        }
        ctx.drawQueue.push({ type: 'drum_vis', step: drumStep, time: swungTime });
        scheduleDrums(drumStep, t, drumStep % 16 === 0, drumStep % 4 === 0, [4, 12].includes(drumStep % 16));
    }

    const chordData = getChordAtStep(step);
    if (!chordData) return;

    if (bb.enabled) scheduleBass(chordData, step, t);
    if (sb.enabled) scheduleSoloist(chordData, step, t, soloistTime);
    if (cb.enabled) scheduleChords(chordData, step, t);
}

function cloneMeasure() {
    const sourceOffset = gb.currentMeasure * 16;
    gb.instruments.forEach(inst => {
        const pattern = inst.steps.slice(sourceOffset, sourceOffset + 16);
        for (let m = 0; m < gb.measures; m++) {
            if (m === gb.currentMeasure) continue;
            const targetOffset = m * 16;
            for (let i = 0; i < 16; i++) {
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
    
    // Auto-follow logic: switch measure page if needed
    const stepMeasure = Math.floor(ev.step / 16);
    if (gb.autoFollow && stepMeasure !== gb.currentMeasure && ctx.isPlaying) {
        switchMeasure(stepMeasure);
    }

    const offset = gb.currentMeasure * 16;
    if (ev.step >= offset && ev.step < offset + 16) {
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
    if (cb.lastActiveChordIndex !== undefined && cb.lastActiveChordIndex !== null) {
        if (arranger.cachedCards[cb.lastActiveChordIndex]) {
            arranger.cachedCards[cb.lastActiveChordIndex].classList.remove('active');
        }
    }
    if (arranger.cachedCards[ev.index]) {
        const card = arranger.cachedCards[ev.index];
        card.classList.add('active');
        cb.lastActiveChordIndex = ev.index;

        const chordData = arranger.progression[ev.index];
        if (chordData) {
            ui.activeSectionLabel.textContent = chordData.sectionLabel || "";
            
            // Highlight active section card in list
            document.querySelectorAll('.section-card').forEach(card => {
                card.classList.toggle('active', card.dataset.id == chordData.sectionId);
            });
        }

        // Auto-scroll logic using cached dimensions (no reflow)
        const container = ui.chordVisualizer;
        const offsetTop = arranger.cardOffsets[ev.index];
        const cardHeight = arranger.cardHeights[ev.index];
        
        if (offsetTop !== undefined && cardHeight !== undefined) {
            const scrollPos = offsetTop - (container.clientHeight / 2) + (cardHeight / 2);
            // We still use clientHeight for the container, which is usually cheap, 
            // but we avoid getBoundingClientRect on every card.
            container.scrollTo({ top: scrollPos, behavior: 'smooth' });
        }
    }
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

    // Interpolate audio time with performance time for sub-sample visual smoothness
    const audioTime = ctx.audio.currentTime;
    const perfTime = performance.now();
    if (audioTime !== lastAudioTime) {
        lastAudioTime = audioTime;
        lastPerfTime = perfTime;
    }
    const dt = (perfTime - lastPerfTime) / 1000;
    const smoothAudioTime = audioTime + Math.min(dt, 0.1);

    // Attempt to use high-precision latency if available, else fallback
    const outputLatency = ctx.audio.outputLatency || 0;
    const isChromium = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const offset = outputLatency > 0 ? outputLatency : (isChromium ? 0.015 : 0.045);
    const now = smoothAudioTime - offset;
    
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
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
            validateProgression(renderChordVisualizer);
            flushBuffers();
            document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
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
            renderGridState();
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        }, 'drum-preset-chip');
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

function setupUIHandlers() {
    const listeners = [
        [ui.playBtn, 'click', togglePlay],
        [ui.bpmInput, 'change', e => setBpm(e.target.value)],
        [ui.tapBtn, 'click', handleTap],
        [ui.addSectionBtn, 'click', addSection],
        [ui.randomizeBtn, 'click', () => {
            arranger.sections = [{ id: generateId(), label: 'Random', value: generateRandomProgression() }];
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
            validateProgression(renderChordVisualizer);
            flushBuffers();
        }],
        [ui.clearProgBtn, 'click', () => {
            arranger.sections = [{ id: generateId(), label: 'Intro', value: '' }];
            renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
            validateProgression(renderChordVisualizer);
            flushBuffers();
        }],
        [ui.saveBtn, 'click', saveProgression],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.shareBtn, 'click', shareProgression],
        [ui.transUpBtn, 'click', () => transposeKey(1)],
        [ui.transDownBtn, 'click', () => transposeKey(-1)],
        [ui.settingsBtn, 'click', () => ui.settingsOverlay.classList.add('active')],
        [ui.closeSettings, 'click', () => ui.settingsOverlay.classList.remove('active')],
        [ui.resetSettingsBtn, 'click', () => confirm("Reset all settings?") && resetToDefaults()],
        [ui.exportMidiBtn, 'click', exportToMidi],
        [ui.clearDrums, 'click', () => { gb.instruments.forEach(i => i.steps.fill(0)); renderGridState(); }],
        [ui.maximizeChordBtn, 'click', () => {
            const isMax = document.querySelector('.app-main-layout').classList.toggle('chord-maximized');
            ui.maximizeChordBtn.textContent = isMax ? '✕' : '⛶';
            ui.maximizeChordBtn.title = isMax ? 'Exit Maximize' : 'Maximize';
        }]
    ];
    listeners.forEach(([el, evt, fn]) => el?.addEventListener(evt, fn));

    ui.settingsOverlay.addEventListener('click', e => e.target === ui.settingsOverlay && ui.settingsOverlay.classList.remove('active'));
    ui.keySelect.addEventListener('change', e => { 
        arranger.key = e.target.value; 
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

    ui.densitySelect.addEventListener('change', e => { cb.density = e.target.value; validateProgression(renderChordVisualizer); flushBuffers(); });

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
    });

    ui.swingSlider.addEventListener('input', e => gb.swing = parseInt(e.target.value));
    ui.swingBase.addEventListener('change', e => gb.swingSub = e.target.value);
    ui.humanizeSlider.addEventListener('input', e => gb.humanize = parseInt(e.target.value));
    ui.autoFollowCheck.addEventListener('change', e => gb.autoFollow = e.target.checked);
    ui.drumBarsSelect.addEventListener('change', e => updateMeasures(e.target.value));
    ui.cloneMeasureBtn.addEventListener('click', cloneMeasure);

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

    window.addEventListener('keydown', e => {
        if (e.key === ' ' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            e.preventDefault(); togglePlay();
        }
        // Numeric hotkeys for Accompanist tabs
        if (['1', '2', '3', '4'].includes(e.key) && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
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
    renderCategorized(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist-style', sb.style, (item) => updateStyle('soloist', item.id));
    renderCategorized(ui.bassStylePresets, BASS_STYLES, 'bass-style', bb.style, (item) => updateStyle('bass', item.id));

    // Drum Presets
    const drumPresetsArray = Object.keys(DRUM_PRESETS).map(name => ({
        name,
        ...DRUM_PRESETS[name]
    }));
    renderCategorized(ui.drumPresets, drumPresetsArray, 'drum-preset', 'Standard', (item, chip) => {
        loadDrumPreset(item.name);
        document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });

    // Chord Progression Presets
    renderCategorized(ui.chordPresets, CHORD_PRESETS, 'chord-preset', 'Pop (Standard)', (item, chip) => {
        if (item.sections) {
            arranger.sections = item.sections.map(s => ({
                id: generateId(),
                label: s.label,
                value: s.value
            }));
        } else {
            // Reset to single section for legacy presets
            arranger.sections = [{ id: generateId(), label: 'Main', value: item.prog }];
        }
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        validateProgression(renderChordVisualizer);
        flushBuffers();
        document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });
}

function init() {
    try {
        const savedState = storage.get('currentState');
        if (savedState && savedState.sections) {
            arranger.sections = savedState.sections;
            arranger.key = savedState.key || 'C';
            arranger.notation = savedState.notation || 'roman';
            ctx.theme = savedState.theme || 'auto';
            ctx.bpm = savedState.bpm || 100;
            cb.style = savedState.style || 'pad';
            
            // Restore Accompanist Settings
            if (savedState.cb) {
                cb.octave = savedState.cb.octave;
                cb.density = savedState.cb.density;
                cb.volume = savedState.cb.volume;
                cb.reverb = savedState.cb.reverb;
            }
            if (savedState.bb) {
                bb.octave = savedState.bb.octave;
                bb.volume = savedState.bb.volume;
                bb.reverb = savedState.bb.reverb;
            }
            if (savedState.sb) {
                sb.octave = savedState.sb.octave;
                sb.volume = savedState.sb.volume;
                sb.reverb = savedState.sb.reverb;
            }
            if (savedState.gb) {
                gb.volume = savedState.gb.volume;
                gb.reverb = savedState.gb.reverb;
                gb.swing = savedState.gb.swing;
                gb.swingSub = savedState.gb.swingSub;
                gb.measures = savedState.gb.measures || 1;
                gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20;
                gb.autoFollow = savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true;
                gb.currentMeasure = 0;
            }

            // Sync UI
            ui.keySelect.value = arranger.key;
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

            applyTheme(ctx.theme);

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
        loadDrumPreset('Standard');
        setupPresets();
        setupUIHandlers();
        renderUserPresets();
        renderUserDrumPresets();
        loadFromUrl();
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        validateProgression(renderChordVisualizer);
        updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
        updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
        
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

    if (viz && ctx.isPlaying && ctx.audio) {
        const secondsPerBeat = 60.0 / ctx.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        // Use unswung time and measure alignment (16 steps) for stable grid
        const measureTime = ctx.unswungNextNoteTime - (ctx.step % 16) * sixteenth;
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
    
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    syncWorker();
    saveCurrentState();
}

function loadDrumPreset(name) {
    const p = DRUM_PRESETS[name];
    gb.measures = p.measures || 1; 
    gb.currentMeasure = 0;
    ui.drumBarsSelect.value = String(gb.measures);
    
    if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
    if (p.sub) { gb.swingSub = p.sub; ui.swingBase.value = p.sub; }
    gb.instruments.forEach(inst => {
        const pattern = p[inst.name] || new Array(16).fill(0);
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
    applyTheme('auto');
    arranger.sections.forEach(s => s.color = '#3b82f6');
    
    cb.volume = 0.5;
    cb.reverb = 0.3;
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
        inst.steps = new Array(16).fill(0);
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
    chord.freqs.forEach(f => playNote(f, now, 1.0, 0.15, 0.02));

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
    if (params.get('s')) {
        arranger.sections = decompressSections(params.get('s'));
    } else if (params.get('prog')) {
        arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }];
    }
    
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); arranger.key = ui.keySelect.value; }
    if (params.get('bpm')) { ctx.bpm = parseInt(params.get('bpm')); ui.bpmInput.value = ctx.bpm; }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

window.addEventListener('load', () => {
    init();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW failed', err));
    }
});