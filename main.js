import { ctx, gb, cb, bb, sb, storage } from './state.js';
import { ui, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch } from './engine.js';
import { KEY_ORDER, DRUM_PRESETS, CHORD_PRESETS, CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES } from './config.js';
import { normalizeKey, getMidi, midiToNote } from './utils.js';
import { validateProgression } from './chords.js';
import { getBassNote } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { chordPatterns } from './accompaniment.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;

/** @type {HTMLAudioElement} */
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
function updateStyle(type, styleId) {
    const config = {
        chord: { state: cb, selector: '.chord-style-chip' },
        bass: { state: bb, selector: '.bass-style-chip' },
        soloist: { state: sb, selector: '.soloist-style-chip' }
    };
    const c = config[type];
    if (!c) return;
    c.state.style = styleId;
    document.querySelectorAll(c.selector).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === styleId);
    });
}

/**
 * Toggles the global play/stop state.
 */
function togglePlay() {
    if (ctx.isPlaying) {
        ctx.isPlaying = false;
        ui.playBtn.textContent = 'START';
        ui.playBtn.classList.remove('playing');
        clearTimeout(ctx.timerID);
        silentAudio.pause();
        releaseWakeLock();
    } else {
        initAudio();
        if (!iosAudioUnlocked) {
            silentAudio.play().catch(e => console.log("Audio unlock failed", e));
            iosAudioUnlocked = true;
        } else {
            silentAudio.play().catch(e => {});
        }
        ctx.isPlaying = true;
        ui.playBtn.textContent = 'STOP';
        ui.playBtn.classList.add('playing');
        ctx.step = 0;
        ctx.nextNoteTime = ctx.audio.currentTime;
        ctx.unswungNextNoteTime = ctx.audio.currentTime;
        ctx.isCountingIn = ui.countIn.checked;
        ctx.countInBeat = 0;
        requestWakeLock();
        
        if (!ctx.isDrawing) {
            ctx.isDrawing = true;
            requestAnimationFrame(draw);
        }
        scheduler();
    }
}

/**
 * Toggles the enabled state of a module.
 * @param {'chord'|'groove'|'bass'|'soloist'} type 
 */
function togglePower(type) {
    const config = {
        chord: { state: cb, el: ui.chordPowerBtn, panel: 'chordPanel' },
        groove: { state: gb, el: ui.groovePowerBtn, panel: 'groovePanel', cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
        bass: { state: bb, el: ui.bassPowerBtn, panel: 'bassPanel' },
        soloist: { state: sb, el: ui.soloistPowerBtn, panel: 'soloistPanel' }
    };
    const c = config[type];
    if (!c) return;
    
    c.state.enabled = !c.state.enabled;
    c.el.classList.toggle('active', c.state.enabled);
    document.getElementById(c.panel).classList.toggle('panel-disabled', !c.state.enabled);
    if (!c.state.enabled && type === 'chord') document.querySelectorAll('.chord-card.active').forEach(card => card.classList.remove('active'));
    if (!c.state.enabled && c.cleanup) c.cleanup();
}

/**
 * The main audio scheduler loop.
 */
function scheduler() {
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
    if (ctx.isPlaying) ctx.timerID = setTimeout(scheduler, ctx.lookahead);
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
     ctx.drawQueue.push({ type: 'flash', time: time, intensity: 0.3, beat: 1 });
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
 * Finds the active chord for a given global step.
 * @param {number} step 
 */
function getChordAtStep(step) {
    if (!cb.progression.length) return null;
    let current = 0;
    const totalSteps = cb.progression.reduce((sum, c) => sum + Math.round(c.beats * 4), 0);
    if (totalSteps === 0) return null;

    const targetStep = step % totalSteps;

    for (const chord of cb.progression) {
        const chordSteps = Math.round(chord.beats * 4);
        if (targetStep >= current && targetStep < current + chordSteps) {
            return { chord, stepInChord: targetStep - current, chordIndex: cb.progression.indexOf(chord) };
        }
        current += chordSteps;
    }
    return null;
}

function scheduleDrums(step, time, isDownbeat, isQuarter, isBackbeat) {
    gb.instruments.forEach(inst => {
        if (inst.steps[step] && !inst.muted) {
            let velocity = 1.0;
            if (inst.name === 'Kick') {
                velocity = isDownbeat ? 1.15 : (isQuarter ? 1.05 : 0.9);
            } else if (inst.name === 'Snare') {
                velocity = isBackbeat ? 1.1 : 0.9;
            } else if (inst.name === 'HiHat' || inst.name === 'Open') {
                velocity = isQuarter ? 1.1 : 0.85;
            }
            playDrumSound(inst.name, time, velocity);
        }
    });
}

function scheduleBass(chordData, step, time) {
    const { chord, stepInChord } = chordData;
    let shouldPlay = false;
    if (bb.style === 'whole' && stepInChord === 0) shouldPlay = true;
    else if (bb.style === 'half' && stepInChord % 8 === 0) shouldPlay = true;
    else if ((bb.style === 'quarter' || bb.style === 'arp') && stepInChord % 4 === 0) shouldPlay = true;

    if (shouldPlay) {
        const nextChordData = getChordAtStep(step + 4);
        const bassFreq = getBassNote(chord, nextChordData?.chord, Math.floor(stepInChord / 4), bb.lastFreq, bb.octave, bb.style);
        if (bassFreq) {
            bb.lastFreq = bassFreq;
            const midi = getMidi(bassFreq);
            const { name, octave } = midiToNote(midi);
            ctx.drawQueue.push({ 
                type: 'bass_vis', name, octave, midi, time,
                chordNotes: chord.freqs.map(f => getMidi(f))
            });
            const duration = (bb.style === 'whole' ? chord.beats : (bb.style === 'half' ? 2 : 1)) * (60.0 / ctx.bpm);
            playBassNote(bassFreq, time, duration);
        }
    }
}

function scheduleSoloist(chordData, step, time, unswungTime) {
    const { chord, stepInChord } = chordData;
    const nextChordData = getChordAtStep(step + 4);
    const soloResult = getSoloistNote(chord, nextChordData?.chord, step % 16, sb.lastFreq, sb.octave, sb.style);
    
    let midi = null, name = '--', octave = '';
    if (soloResult?.freq) {
        sb.lastFreq = soloResult.freq;
        midi = getMidi(soloResult.freq);
        ({ name, octave } = midiToNote(midi));

        const spb = 60.0 / ctx.bpm;
        const duration = 0.25 * spb * (soloResult.durationMultiplier || 1);
        
        playSoloNote(soloResult.freq, unswungTime, duration, 1.0, soloResult.bendStartInterval || 0, soloResult.style);
        sb.lastNoteEnd = unswungTime + duration;
    }

    ctx.drawQueue.push({ 
        type: 'soloist_vis', name, octave, midi, time: unswungTime,
        chordNotes: chord.freqs.map(f => getMidi(f))
    });
}

function scheduleChords(chordData, step, time) {
    const { chord, stepInChord, chordIndex } = chordData;
    const spb = 60.0 / ctx.bpm;
    const measureStep = step % 16;
    
    if (stepInChord === 0) ctx.drawQueue.push({ type: 'chord_vis', index: chordIndex, time });
    
    const pattern = chordPatterns[cb.style];
    if (pattern) {
        pattern(chord, time, spb, stepInChord, measureStep, step);
    }
}

function scheduleGlobalEvent(step, swungTime) {
    const drumStep = step % (gb.measures * 16);
    const jitter = (Math.random() - 0.5) * 0.004;
    const t = swungTime + jitter;
    const straightness = 0.65;
    const soloistTime = (ctx.unswungNextNoteTime * straightness) + (swungTime * (1.0 - straightness)) + jitter;

    if (gb.enabled) {
        if (drumStep % 4 === 0) ctx.drawQueue.push({ type: 'flash', time: swungTime, intensity: (drumStep % 16 === 0 ? 0.2 : 0.1), beat: (drumStep % 16 === 0 ? 1 : 0) });
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
            const step = activeSteps[0];
            const containerRect = container.getBoundingClientRect();
            const stepRect = step.getBoundingClientRect();
            container.scrollTo({ 
                left: stepRect.left - containerRect.left + container.scrollLeft - 100, 
                behavior: 'smooth' 
            });
        }
    }
    ctx.lastPlayingStep = ev.step;
}

function updateChordVis(ev) {
    cb.cachedCards.forEach((c, i) => {
        c.classList.toggle('active', i === ev.index);
    });
}

function updateInstrumentVis(ev, type) {
    const isBass = type === 'bass';
    const config = isBass ? 
        { state: bb, nameEl: ui.bassNoteName, octEl: ui.bassNoteOctave, tonesEl: ui.bassChordTones, pathEl: ui.bassPolyline, range: 12 } :
        { state: sb, nameEl: ui.soloistNoteName, octEl: ui.soloistNoteOctave, tonesEl: ui.soloistChordTones, pathEl: ui.soloistPath, range: 30 };
    
    if (config.nameEl) config.nameEl.textContent = ev.name;
    if (config.octEl) config.octEl.textContent = ev.octave;
    
    config.state.history.push(ev.midi);
    config.state.chordHistory.push(ev.chordNotes);
    if (config.state.history.length > 16) {
        config.state.history.shift();
        config.state.chordHistory.shift();
    }

    if (config.pathEl && config.state.history.length > 1) {
        const width = 100, height = 100;
        const min = config.state.octave - config.range;
        const max = config.state.octave + config.range;
        
        if (config.tonesEl) {
            config.tonesEl.innerHTML = '';
            const historyLen = config.state.chordHistory.length;
            const stepWidth = width / (historyLen > 1 ? historyLen - 1 : 1);
            
            config.state.chordHistory.forEach((notes, historyIdx) => {
                const x = historyIdx * stepWidth;
                notes.forEach(midi => {
                    let m = midi;
                    while (m > max) m -= 12;
                    while (m < min) m += 12;
                    if (m >= min && m <= max) {
                        const y = height - ((m - min) / (max - min)) * height;
                        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        line.setAttribute("x1", (x - stepWidth/2).toString());
                        line.setAttribute("y1", y.toString());
                        line.setAttribute("x2", (x + stepWidth/2).toString());
                        line.setAttribute("y2", y.toString());
                        line.setAttribute("stroke", "#ffffff");
                        line.setAttribute("stroke-width", "1");
                        line.setAttribute("stroke-opacity", ((historyIdx / historyLen) * 0.4).toString());
                        config.tonesEl.appendChild(line);
                    }
                });
            });
        }

        if (isBass) {
            const points = config.state.history.map((midi, i) => {
                const x = (i / (config.state.history.length - 1)) * width;
                const val = Math.max(min, Math.min(max, midi));
                const y = height - ((val - min) / (max - min)) * height;
                return `${x},${y}`;
            }).join(' ');
            config.pathEl.setAttribute('points', points);
        } else {
            let pathD = "", hasMoved = false;
            config.state.history.forEach((midi, i) => {
                const x = (i / (config.state.history.length - 1)) * width;
                if (midi === null) { hasMoved = false; return; }
                const val = Math.max(min, Math.min(max, midi));
                const y = height - ((val - min) / (max - min)) * height;
                if (!hasMoved) { pathD += `M ${x},${y} `; hasMoved = true; } 
                else { pathD += `L ${x},${y} `; }
            });
            config.pathEl.setAttribute('d', pathD);
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
        document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
        document.querySelectorAll('.chord-card.active').forEach(c => c.classList.remove('active'));
        [ui.bassNoteName, ui.soloistNoteName].forEach(el => { if(el) el.textContent = '--'; });
        [ui.bassNoteOctave, ui.soloistNoteOctave].forEach(el => { if(el) el.textContent = ''; });
        [ui.bassChordTones, ui.soloistChordTones].forEach(el => { if(el) el.innerHTML = ''; });
        if (ui.bassPolyline) ui.bassPolyline.setAttribute('points', '');
        if (ui.soloistPath) ui.soloistPath.setAttribute('d', '');
        bb.history = []; bb.chordHistory = [];
        sb.history = []; sb.chordHistory = [];
        return;
    }

    const isChromium = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const offset = isChromium ? 0.015 : 0.045;
    const now = ctx.audio.currentTime - (ctx.audio.outputLatency || 0) - offset;
    
    if (ctx.drawQueue.length > 200) {
        ctx.drawQueue = ctx.drawQueue.filter(ev => ev.time >= now - 0.5);
    }

    while (ctx.drawQueue.length && ctx.drawQueue[0].time <= now) {
        const ev = ctx.drawQueue.shift();
        if (ev.type === 'drum_vis') updateDrumVis(ev);
        else if (ev.type === 'chord_vis') updateChordVis(ev);
        else if (ev.type === 'bass_vis') updateInstrumentVis(ev, 'bass');
        else if (ev.type === 'soloist_vis') updateInstrumentVis(ev, 'soloist');
        else if (ev.type === 'flash') triggerFlash(ev.intensity);
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
        const chip = document.createElement('div');
        chip.className = 'preset-chip user-preset-chip';
        chip.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        chip.innerHTML = `<span>${p.name}</span> <span style="margin-left: 8px; opacity: 0.5;" onclick="event.stopPropagation(); window.deleteUserPreset(${idx})">×</span>`;
        chip.onclick = () => {
            ui.progInput.value = p.prog;
            validateProgression(renderChordVisualizer);
            document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
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
        const chip = document.createElement('div');
        chip.className = 'preset-chip drum-preset-chip';
        chip.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        chip.innerHTML = `<span>${p.name}</span> <span style="margin-left: 8px; opacity: 0.5;" onclick="event.stopPropagation(); window.deleteUserDrumPreset(${idx})">×</span>`;
        chip.onclick = () => {
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
        };
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

function setupUIHandlers() {
    const listeners = [
        [ui.playBtn, 'click', togglePlay],
        [ui.bpmInput, 'change', e => setBpm(e.target.value)],
        [ui.tapBtn, 'click', handleTap],
        [ui.saveBtn, 'click', saveProgression],
        [ui.saveDrumBtn, 'click', saveDrumPattern],
        [ui.shareBtn, 'click', shareProgression],
        [ui.transUpBtn, 'click', () => transposeKey(1)],
        [ui.transDownBtn, 'click', () => transposeKey(-1)],
        [ui.settingsBtn, 'click', () => ui.settingsOverlay.classList.add('active')],
        [ui.closeSettings, 'click', () => ui.settingsOverlay.classList.remove('active')],
        [ui.resetSettingsBtn, 'click', () => confirm("Reset all settings?") && resetToDefaults()],
        [ui.clearDrums, 'click', () => { gb.instruments.forEach(i => i.steps.fill(0)); renderGridState(); }],
        [ui.maximizeChordBtn, 'click', () => {
            const isMax = document.querySelector('.app-container').classList.toggle('chord-maximized');
            ui.maximizeChordBtn.textContent = isMax ? '❐' : '⛶';
        }]
    ];
    listeners.forEach(([el, evt, fn]) => el?.addEventListener(evt, fn));

    ui.settingsOverlay.addEventListener('click', e => e.target === ui.settingsOverlay && ui.settingsOverlay.classList.remove('active'));
    ui.keySelect.addEventListener('change', e => { cb.key = e.target.value; validateProgression(renderChordVisualizer); });
    ui.progInput.addEventListener('input', () => validateProgression(renderChordVisualizer));
    ui.notationSelect.addEventListener('change', e => { cb.notation = e.target.value; renderChordVisualizer(); });
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
        { el: ui.chordVol, state: cb, gain: 'chordsGain', mult: 1.25 },
        { el: ui.bassVol, state: bb, gain: 'bassGain', mult: 1.25 },
        { el: ui.soloistVol, state: sb, gain: 'soloistGain', mult: 0.8 },
        { el: ui.drumVol, state: gb, gain: 'drumsGain', mult: 1.0 },
        { el: ui.masterVol, state: ctx, gain: 'masterGain', mult: 1.0 }
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
        });
    });

    ui.swingSlider.addEventListener('input', e => gb.swing = parseInt(e.target.value));
    ui.swingBase.addEventListener('change', e => gb.swingSub = e.target.value);

    ['chord', 'groove', 'bass', 'soloist'].forEach(type => {
        ui[`${type}PowerBtn`].addEventListener('click', () => togglePower(type));
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (ctx.audio?.state === 'suspended' || ctx.audio?.state === 'interrupted') ctx.audio.resume();
            if (ctx.isPlaying && iosAudioUnlocked) silentAudio.play().catch(() => {});
        }
    });

    window.addEventListener('keydown', e => {
        if (e.key === ' ' && !['INPUT', 'SELECT'].includes(e.target.tagName)) {
            e.preventDefault(); togglePlay();
        }
    });
}

function setupPresets() {
    const setup = (container, data, type, activeId) => {
        data.forEach(s => {
            const chip = document.createElement('div');
            chip.className = `preset-chip ${type}-style-chip`;
            chip.textContent = s.name;
            chip.dataset.id = s.id;
            if (s.id === activeId) chip.classList.add('active');
            chip.onclick = () => updateStyle(type, s.id);
            container.appendChild(chip);
        });
    };

    Object.keys(DRUM_PRESETS).forEach(k => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip drum-preset-chip';
        chip.textContent = k;
        if (k === 'Standard') chip.classList.add('active');
        chip.onclick = () => {
            loadDrumPreset(k);
            document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        ui.drumPresets.appendChild(chip);
    });

    CHORD_PRESETS.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip chord-preset-chip';
        chip.textContent = p.name;
        if (p.name === 'Pop') chip.classList.add('active');
        chip.onclick = () => {
            ui.progInput.value = p.prog;
            validateProgression(renderChordVisualizer);
            document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        ui.chordPresets.appendChild(chip);
    });

    setup(ui.chordStylePresets, CHORD_STYLES, 'chord', cb.style);
    setup(ui.bassStylePresets, BASS_STYLES, 'bass', bb.style);
    setup(ui.soloistStylePresets, SOLOIST_STYLES, 'soloist', sb.style);
}

// --- INITIALIZATION ---
function init() {
    try {
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
}

function transposeKey(delta) {
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(ui.keySelect.value));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];
    ui.keySelect.value = newKey;
    cb.key = newKey;
    const parts = ui.progInput.value.split(/([\s,-]+)/);
    const transposed = parts.map(part => {
        const noteMatch = part.match(/^([A-G][#b]?)(.*)/i);
        if (noteMatch && !part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/)) {
            const root = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
            const newRoot = KEY_ORDER[(KEY_ORDER.indexOf(root) + delta + 12) % 12];
            return newRoot + noteMatch[2];
        }
        return part;
    });
    ui.progInput.value = transposed.join('');
    validateProgression(renderChordVisualizer);
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
    bb.volume = 0.5;
    bb.reverb = 0.05;
    bb.octave = 41;
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
    ui.bassVol.value = 0.5;
    ui.bassReverb.value = 0.05;
    ui.bassOctave.value = 41;
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

    if (ctx.masterGain) ctx.masterGain.gain.setTargetAtTime(0.5, ctx.audio.currentTime, 0.02);
    
    // Update instrument buses with mixing multipliers
    if (ctx.chordsGain) ctx.chordsGain.gain.setTargetAtTime(0.5 * 1.25, ctx.audio.currentTime, 0.02);
    if (ctx.bassGain) ctx.bassGain.gain.setTargetAtTime(0.5 * 1.25, ctx.audio.currentTime, 0.02);
    if (ctx.soloistGain) ctx.soloistGain.gain.setTargetAtTime(0.5 * 0.8, ctx.audio.currentTime, 0.02);
    if (ctx.drumsGain) ctx.drumsGain.gain.setTargetAtTime(0.5, ctx.audio.currentTime, 0.02);

    if (ctx.chordsReverb) ctx.chordsReverb.gain.setTargetAtTime(0.3, ctx.audio.currentTime, 0.02);
    if (ctx.bassReverb) ctx.bassReverb.gain.setTargetAtTime(0.05, ctx.audio.currentTime, 0.02);
    if (ctx.soloistReverb) ctx.soloistReverb.gain.setTargetAtTime(0.6, ctx.audio.currentTime, 0.02);
    if (ctx.drumsReverb) ctx.drumsReverb.gain.setTargetAtTime(0.2, ctx.audio.currentTime, 0.02);

    updateOctaveLabel(ui.octaveLabel, cb.octave);
    updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
    updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
    validateProgression(renderChordVisualizer);
    
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
    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    navigator.clipboard.writeText(url).then(() => {
        showToast("Link copied!");
    });
}

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
});
