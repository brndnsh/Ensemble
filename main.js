import { ctx, gb, cb, bb, sb, vizState, storage } from './state.js';
import { ui, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState, clearActiveVisuals, createPresetChip } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch } from './engine.js';
import { KEY_ORDER, DRUM_PRESETS, CHORD_PRESETS, CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, MIXER_GAIN_MULTIPLIERS } from './config.js';
import { normalizeKey, getMidi, midiToNote } from './utils.js';
import { validateProgression, generateRandomProgression } from './chords.js';
import { getBassNote } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { chordPatterns } from './accompaniment.js';
import { exportToMidi } from './midi-export.js';
import { UnifiedVisualizer } from './visualizer.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;
let viz;

// Web Worker for robust background timing
const timerWorker = new Worker('./timer.js');
timerWorker.onmessage = (e) => {
    if (e.data === 'tick') scheduler();
};

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
}

/**
 * Toggles the global play/stop state.
 */
function togglePlay() {
    if (ctx.isPlaying) {
        ctx.isPlaying = false;
        ui.playBtn.textContent = 'START';
        ui.playBtn.classList.remove('playing');
        timerWorker.postMessage('stop');
        silentAudio.pause();
        silentAudio.currentTime = 0;
        releaseWakeLock();

        // Immediate Visual Reset
        ctx.drawQueue = [];
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
        
        timerWorker.postMessage('start');
        scheduler();
    }
}

const POWER_CONFIG = {
    chord: { state: cb, el: () => ui.chordPowerBtn, panel: 'chordPanel', cleanup: () => document.querySelectorAll('.chord-card.active').forEach(card => card.classList.remove('active')) },
    groove: { state: gb, el: () => ui.groovePowerBtn, panel: 'groovePanel', cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
    bass: { state: bb, el: () => ui.bassPowerBtn, panel: 'bassPanel' },
    soloist: { state: sb, el: () => ui.soloistPowerBtn, panel: 'soloistPanel' },
    viz: { state: vizState, el: () => ui.vizPowerBtn, panel: 'visualizerPanel', cleanup: () => { if (viz) viz.clear(); } }
};

/**
 * Toggles the enabled state of a module.
 * @param {'chord'|'groove'|'bass'|'soloist'} type 
 */
function togglePower(type) {
    const c = POWER_CONFIG[type];
    if (!c) return;
    
    // Resolve element getter if it's a function (to handle potentially uninitialized UI refs if config defined too early, though here UI is imported)
    // Actually ui is imported so we can access it directly, but let's stick to the pattern.
    const el = typeof c.el === 'function' ? c.el() : c.el;

    c.state.enabled = !c.state.enabled;
    el.classList.toggle('active', c.state.enabled);
    document.getElementById(c.panel).classList.toggle('panel-disabled', !c.state.enabled);
    
    if (!c.state.enabled && c.cleanup) {
        c.cleanup();
    } else if (c.state.enabled && ['chord', 'bass', 'soloist'].includes(type)) {
        flushBuffers();
    } else if (type === 'viz' && c.state.enabled && ctx.isPlaying && ctx.audio) {
        // Restore beat reference if enabled mid-playback
        const secondsPerBeat = 60.0 / ctx.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        // Use unswung time and measure alignment (16 steps) for stable grid
        const measureTime = ctx.unswungNextNoteTime - (ctx.step % 16) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}

const BUFFER_LOOKAHEAD = 64;

function flushBuffers() {
    if (bb.lastPlayedFreq !== null) bb.lastFreq = bb.lastPlayedFreq;
    bb.buffer.clear();
    bb.bufferHead = ctx.step;

    if (sb.lastPlayedFreq !== null) sb.lastFreq = sb.lastPlayedFreq;
    sb.buffer.clear();
    sb.bufferHead = ctx.step;
    
    // Reset soloist stateful counters to ensure immediate response to changes
    sb.phraseSteps = 0;
    sb.isResting = false;
    sb.busySteps = 0;
    sb.currentLick = null;
    sb.sequenceType = null;
}

function fillBuffers() {
    // Initialize buffer heads if needed
    if (bb.bufferHead === undefined) bb.bufferHead = ctx.step;
    if (sb.bufferHead === undefined) sb.bufferHead = ctx.step;

    // Ensure we don't fill too far ahead or fall behind
    if (bb.bufferHead < ctx.step) bb.bufferHead = ctx.step;
    if (sb.bufferHead < ctx.step) sb.bufferHead = ctx.step;

    const targetStep = ctx.step + BUFFER_LOOKAHEAD;

    // --- Bass Buffering ---
    if (bb.enabled) {
        while (bb.bufferHead < targetStep) {
            const step = bb.bufferHead;
            const chordData = getChordAtStep(step);
            let result = null;

                if (chordData) {
                    const { chord, stepInChord } = chordData;
                    let shouldPlay = false;
                    if (bb.style === 'whole' && stepInChord === 0) shouldPlay = true;
                    else if (bb.style === 'half' && stepInChord % 8 === 0) shouldPlay = true;
                    else if (bb.style === 'arp' && stepInChord % 4 === 0) shouldPlay = true;
                    else if (bb.style === 'bossa') {
                        // Bossa rhythm: 1, 2&, 3, 4& (Steps: 0, 6, 8, 14)
                        if ([0, 6, 8, 14].includes(step % 16)) shouldPlay = true;
                    }
                    else if (bb.style === 'quarter') {
                        if (stepInChord % 4 === 0) shouldPlay = true;
                        // 15% chance of an eighth-note skip on the "and" of the beat
                        else if (stepInChord % 2 === 0 && Math.random() < 0.15) shouldPlay = true;
                    }

                    if (shouldPlay) {
                        const nextChordData = getChordAtStep(step + 4);
                        const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / 4, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, step);
                        
                        if (bassResult) {
                            const freq = typeof bassResult === 'object' ? bassResult.freq : bassResult;
                            const durationMultiplier = typeof bassResult === 'object' ? bassResult.durationMultiplier : null;
                            const velocity = typeof bassResult === 'object' ? bassResult.velocity : 1.0;
                            const muted = typeof bassResult === 'object' ? bassResult.muted : false;
                            
                            if (freq) {
                                bb.lastFreq = freq;
                                result = { freq, durationMultiplier, velocity, muted, chordData };
                            }
                        }
                    }
                }
            bb.buffer.set(step, result);
            bb.bufferHead++;
        }
    }

    // --- Soloist Buffering ---
    if (sb.enabled) {
        while (sb.bufferHead < targetStep) {
            const step = sb.bufferHead;
            const chordData = getChordAtStep(step);
            let result = null;

            if (chordData) {
                const { chord } = chordData;
                const nextChordData = getChordAtStep(step + 4);
                // Note: getSoloistNote is stateful (sb state) and updates it.
                // We rely on this linear execution order.
                const soloResult = getSoloistNote(chord, nextChordData?.chord, step % 16, sb.lastFreq, sb.octave, sb.style);
                
                if (soloResult?.freq) {
                    sb.lastFreq = soloResult.freq;
                    result = { ...soloResult, chordData };
                }
            }
            sb.buffer.set(step, result);
            sb.bufferHead++;
        }
    }
}

/**
 * The main audio scheduler loop.
 */
function scheduler() {
    fillBuffers();
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
    if (!cb.progression.length) {
        cb.totalSteps = 0;
        cb.stepMap = [];
        return;
    }

    let current = 0;
    cb.stepMap = cb.progression.map(chord => {
        const steps = Math.round(chord.beats * 4);
        const entry = { start: current, end: current + steps, chord };
        current += steps;
        return entry;
    });
    cb.totalSteps = current;
}

/**
 * Finds the active chord for a given global step.
 * Uses the cached step map for O(1) or O(N) lookup without reduction.
 */
function getChordAtStep(step) {
    if (cb.totalSteps === 0) return null;

    const targetStep = step % cb.totalSteps;

    for (let i = 0; i < cb.stepMap.length; i++) {
        const entry = cb.stepMap[i];
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
        const { freq, chordData: cData, durationMultiplier, velocity } = noteEntry; // Use buffered chordData to match generation context
        const { chord } = cData || chordData;
        
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
                type: 'bass_vis', name, octave, midi, time,
                chordNotes: chord.freqs.map(f => getMidi(f)),
                duration
            });
        }
        playBassNote(freq, time, duration, velocity || 1.0, noteEntry.muted);
    }
}

function scheduleSoloist(chordData, step, time, unswungTime) {
    const noteEntry = sb.buffer.get(step);
    sb.buffer.delete(step); // Cleanup

    if (noteEntry && noteEntry.freq) {
        const { freq, extraFreq, extraMidi, extraFreq2, extraMidi2, durationMultiplier, velocity, bendStartInterval, style, chordData: cData } = noteEntry;
        const { chord } = cData || chordData;
        
        sb.lastPlayedFreq = freq;
        const midi = noteEntry.midi || getMidi(freq);
        const { name, octave } = midiToNote(midi);

        const spb = 60.0 / ctx.bpm;
        const duration = 0.25 * spb * (durationMultiplier || 1);
        const vel = velocity || 1.0;
        
        // Neo-soul "Lazy" Lag: Additional fixed delay for neo style
        const styleLag = style === 'neo' ? 0.025 : 0;
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
    const jitter = (Math.random() - 0.5) * 0.004;
    const t = swungTime + jitter;
    
    // Dynamic straightness based on soloist style
    const straightness = sb.style === 'neo' ? 0.35 : 0.65;
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

function updateDrumVis(ev) {
    if (ctx.lastPlayingStep !== undefined && gb.cachedSteps[ctx.lastPlayingStep]) {
        gb.cachedSteps[ctx.lastPlayingStep].forEach(s => s.classList.remove('playing'));
    }
    const activeSteps = gb.cachedSteps[ev.step];
    if (activeSteps) {
        activeSteps.forEach(s => s.classList.add('playing'));
        // Only trigger layout/scrolling once per measure
        if (ev.step % 16 === 0) {
            const container = ui.sequencerGrid;
            const scrollOffset = gb.stepOffsets ? gb.stepOffsets[ev.step] : null;
            
            if (scrollOffset !== null) {
                container.scrollTo({ 
                    left: scrollOffset, 
                    behavior: 'smooth' 
                });
            }
        }
    }
    ctx.lastPlayingStep = ev.step;
}

function updateChordVis(ev) {
    if (cb.lastActiveChordIndex !== undefined && cb.lastActiveChordIndex !== null) {
        if (cb.cachedCards[cb.lastActiveChordIndex]) {
            cb.cachedCards[cb.lastActiveChordIndex].classList.remove('active');
        }
    }
    if (cb.cachedCards[ev.index]) {
        const card = cb.cachedCards[ev.index];
        card.classList.add('active');
        cb.lastActiveChordIndex = ev.index;

        // Auto-scroll logic using cached dimensions (no reflow)
        const container = ui.chordVisualizer;
        const offsetTop = cb.cardOffsets[ev.index];
        const cardHeight = cb.cardHeights[ev.index];
        
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

    // Attempt to use high-precision latency if available, else fallback
    const outputLatency = ctx.audio.outputLatency || 0;
    const isChromium = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const offset = outputLatency > 0 ? outputLatency : (isChromium ? 0.015 : 0.045);
    const now = ctx.audio.currentTime - offset;
    
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
    const prog = ui.progInput.value.trim();
    if (!prog || cb.progression.length === 0) return;
    const name = prompt("Name this progression:", prog);
    if (name) {
        userPresets.push({ name, prog });
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
            ui.progInput.value = p.prog;
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
                ui.drumBarsSelect.value = p.measures;
                renderGrid();
            }
            p.pattern.forEach(savedInst => {
                const inst = gb.instruments.find(i => i.name === savedInst.name);
                if (inst) inst.steps = [...savedInst.steps];
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

function copyMeasure1() {
    if (gb.measures <= 1) return;
    gb.instruments.forEach(inst => {
        const firstMeasure = inst.steps.slice(0, 16);
        for (let m = 1; m < gb.measures; m++) {
            for (let i = 0; i < 16; i++) {
                inst.steps[m * 16 + i] = firstMeasure[i];
            }
        }
    });
    renderGridState();
    showToast("Measure 1 duplicated");
}

function setupUIHandlers() {
    const listeners = [
        [ui.playBtn, 'click', togglePlay],
        [ui.bpmInput, 'change', e => setBpm(e.target.value)],
        [ui.tapBtn, 'click', handleTap],
        [ui.randomizeBtn, 'click', () => {
            ui.progInput.value = generateRandomProgression();
            validateProgression(renderChordVisualizer);
            flushBuffers();
        }],
        [ui.clearProgBtn, 'click', () => {
            ui.progInput.value = '';
            validateProgression(renderChordVisualizer);
            flushBuffers();
            ui.progInput.focus();
        }],
        [ui.saveBtn, 'click', saveProgression],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.copyMeasureBtn, 'click', copyMeasure1],
        [ui.shareBtn, 'click', shareProgression],
        [ui.transUpBtn, 'click', () => transposeKey(1)],
        [ui.transDownBtn, 'click', () => transposeKey(-1)],
        [ui.settingsBtn, 'click', () => ui.settingsOverlay.classList.add('active')],
        [ui.closeSettings, 'click', () => ui.settingsOverlay.classList.remove('active')],
        [ui.resetSettingsBtn, 'click', () => confirm("Reset all settings?") && resetToDefaults()],
        [ui.exportMidiBtn, 'click', exportToMidi],
        [ui.clearDrums, 'click', () => { gb.instruments.forEach(i => i.steps.fill(0)); renderGridState(); }],
        [ui.maximizeChordBtn, 'click', () => {
            const isMax = document.querySelector('.app-container').classList.toggle('chord-maximized');
            ui.maximizeChordBtn.textContent = isMax ? '❐' : '⛶';
        }]
    ];
    listeners.forEach(([el, evt, fn]) => el?.addEventListener(evt, fn));

    ui.settingsOverlay.addEventListener('click', e => e.target === ui.settingsOverlay && ui.settingsOverlay.classList.remove('active'));
    ui.keySelect.addEventListener('change', e => { cb.key = e.target.value; validateProgression(renderChordVisualizer); flushBuffers(); });
    ui.progInput.addEventListener('input', () => { validateProgression(renderChordVisualizer); flushBuffers(); });
    ui.notationSelect.addEventListener('change', e => { cb.notation = e.target.value; renderChordVisualizer(); });
    ui.densitySelect.addEventListener('change', e => { cb.density = e.target.value; validateProgression(renderChordVisualizer); flushBuffers(); });
    ui.drumBarsSelect.addEventListener('change', e => { 
        const newCount = parseInt(e.target.value);
        gb.instruments.forEach(inst => {
            const old = [...inst.steps];
            inst.steps = new Array(newCount * 16).fill(0).map((_, i) => old[i % old.length]);
        });
        gb.measures = newCount;
        renderGrid();
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

    ['chord', 'groove', 'bass', 'soloist', 'viz'].forEach(type => {
        ui[`${type}PowerBtn`].addEventListener('click', () => togglePower(type));
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
        ui.progInput.value = item.prog;
        validateProgression(renderChordVisualizer);
        flushBuffers();
        document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });
}

// --- INITIALIZATION ---
function init() {
    try {
        viz = new UnifiedVisualizer('unifiedVizContainer');
        viz.addTrack('bass', 'var(--accent-color)');
        viz.addTrack('soloist', '#f472b6');
        
        renderGrid();
        loadDrumPreset('Standard');
        setupPresets();
        setupUIHandlers();
        renderUserPresets();
        renderUserDrumPresets();
        loadFromUrl();
        validateProgression(renderChordVisualizer);
        updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
        updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
        
        // Show the app after everything is ready
        document.querySelector('.app-container').classList.add('loaded');
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
    cb.key = newKey;
    
    // Improved exclusion regex to avoid transposing Roman/NNS accidentals or numerals
    const isMusicalNotation = (part) => {
        return part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) || 
               part.match(/^[#b](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i);
    };

    const parts = ui.progInput.value.split(/([\s,|,-]+)/);
    const transposed = parts.map(part => {
        const noteMatch = part.match(/^([A-G][#b]?)(.*)/i);
        if (noteMatch && !isMusicalNotation(part)) {
            const root = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
            const newRoot = KEY_ORDER[(KEY_ORDER.indexOf(root) + delta + 12) % 12];
            return newRoot + noteMatch[2];
        }
        return part;
    });
    ui.progInput.value = transposed.join('');
    validateProgression(renderChordVisualizer);
    flushBuffers();
}

function loadDrumPreset(name) {
    const p = DRUM_PRESETS[name];
    if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
    if (p.sub) { gb.swingSub = p.sub; ui.swingBase.value = p.sub; }
    gb.instruments.forEach(inst => {
        const pattern = p[inst.name] || new Array(16).fill(0);
        const newSteps = new Array(gb.measures * 16).fill(0);
        for(let i=0; i<newSteps.length; i++) newSteps[i] = pattern[i % pattern.length];
        inst.steps = newSteps;
    });
    renderGridState();
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
    cb.volume = 0.5;
    cb.reverb = 0.3;
    cb.octave = 65;
    cb.notation = 'roman';
    cb.density = 'standard';
    bb.volume = 0.45;
    bb.reverb = 0.05;
    bb.octave = 36;
    sb.volume = 0.5;
    sb.reverb = 0.6;
    sb.octave = 77;
    gb.volume = 0.5;
    gb.reverb = 0.2;
    gb.swing = 0;
    gb.swingSub = '8th';
    gb.measures = 1;

    ui.bpmInput.value = 100;
    ui.chordVol.value = 0.5;
    ui.chordReverb.value = 0.3;
    ui.octave.value = 65;
    ui.notationSelect.value = 'roman';
    ui.densitySelect.value = 'standard';
    ui.bassVol.value = 0.45;
    ui.bassReverb.value = 0.05;
    ui.bassOctave.value = 36;
    ui.soloistVol.value = 0.5;
    ui.soloistReverb.value = 0.6;
    ui.soloistOctave.value = 77;
    ui.drumVol.value = 0.5;
    ui.drumReverb.value = 0.2;
    ui.swingSlider.value = 0;
    ui.swingBase.value = '8th';
    ui.drumBarsSelect.value = 1;
    ui.masterVol.value = 0.5;
    ui.countIn.checked = true;
    ui.visualFlash.checked = false;
    ui.haptic.checked = false;

    if (ctx.masterGain) ctx.masterGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.master, ctx.audio.currentTime, 0.02);
    
    // Update instrument buses with mixing multipliers
    if (ctx.chordsGain) ctx.chordsGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.chords, ctx.audio.currentTime, 0.02);
    if (ctx.bassGain) ctx.bassGain.gain.setTargetAtTime(0.45 * MIXER_GAIN_MULTIPLIERS.bass, ctx.audio.currentTime, 0.02);
    if (ctx.soloistGain) ctx.soloistGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.soloist, ctx.audio.currentTime, 0.02);
    if (ctx.drumsGain) ctx.drumsGain.gain.setTargetAtTime(0.5 * MIXER_GAIN_MULTIPLIERS.drums, ctx.audio.currentTime, 0.02);

    if (ctx.chordsReverb) ctx.chordsReverb.gain.setTargetAtTime(0.3, ctx.audio.currentTime, 0.02);
    if (ctx.bassReverb) ctx.bassReverb.gain.setTargetAtTime(0.05, ctx.audio.currentTime, 0.02);
    if (ctx.soloistReverb) ctx.soloistReverb.gain.setTargetAtTime(0.6, ctx.audio.currentTime, 0.02);
    if (ctx.drumsReverb) ctx.drumsReverb.gain.setTargetAtTime(0.2, ctx.audio.currentTime, 0.02);

    updateOctaveLabel(ui.octaveLabel, cb.octave);
    updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
    updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
    validateProgression(renderChordVisualizer);
    flushBuffers();
    
    gb.instruments.forEach(inst => {
        inst.steps = new Array(16).fill(0);
        inst.muted = false;
    });
    loadDrumPreset('Standard');
    renderGrid(); 

    showToast("Settings reset");
}

function shareProgression() {
    const params = new URLSearchParams();
    params.set('prog', ui.progInput.value);
    params.set('key', ui.keySelect.value);
    params.set('bpm', ui.bpmInput.value);
    params.set('style', cb.style);
    params.set('notation', cb.notation);
    window.location.origin + window.location.pathname + '?' + params.toString();
    navigator.clipboard.writeText(url).then(() => {
        showToast("Link copied!");
    });
}

/**
 * Auditions a specific chord from the progression.
 * Used for the "Click to Audition" feature.
 * @param {number} index 
 */
window.previewChord = (index) => {
    if (ctx.isPlaying) return;
    initAudio();
    const chord = cb.progression[index];
    if (!chord) return;
    
    // Play the full chord once
    const now = ctx.audio.currentTime;
    chord.freqs.forEach(f => playNote(f, now, 1.0, 0.15, 0.02));
    
    // Move cursor and select text in input
    if (chord.charStart !== undefined && chord.charEnd !== undefined) {
        ui.progInput.focus();
        setTimeout(() => {
            ui.progInput.setSelectionRange(chord.charStart, chord.charEnd);
        }, 0);
    }

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
    if (params.get('prog')) ui.progInput.value = params.get('prog');
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); cb.key = ui.keySelect.value; }
    if (params.get('bpm')) { ctx.bpm = parseInt(params.get('bpm')); ui.bpmInput.value = ctx.bpm; }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('notation')) { cb.notation = params.get('notation'); ui.notationSelect.value = cb.notation; }
}

window.addEventListener('load', () => {
    init();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW failed', err));
    }
});
