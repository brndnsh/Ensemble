import { ctx, gb, cb, getUserPresets, getUserDrumPresets, saveUserPresets, saveUserDrumPresets } from './state.js';
import { ui, showToast, triggerFlash, updateOctaveLabel } from './ui.js';
import { initAudio, playNote, playDrumSound } from './engine.js';
import { KEY_ORDER, DRUM_PRESETS, CHORD_PRESETS, CHORD_STYLES } from './config.js';
import { normalizeKey } from './utils.js';
import { validateProgression } from './chords.js';

let userPresets = getUserPresets();
let userDrumPresets = getUserDrumPresets();
let iosAudioUnlocked = false;

/** @type {HTMLAudioElement} */
const silentAudio = new Audio("data:audio/mp3;base64,//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA");
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
 * Updates the UI state and internal state for the selected chord style.
 * @param {string} styleId 
 */
function updateStyleUI(styleId) {
    cb.style = styleId;
    document.querySelectorAll('.style-preset-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.id === styleId);
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
            silentAudio.play();
        }
        ctx.isPlaying = true;
        ui.playBtn.textContent = 'STOP';
        ui.playBtn.classList.add('playing');
        ctx.step = 0;
        ctx.nextNoteTime = ctx.audio.currentTime;
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
 * Toggles the enabled state of a module (chord or groove).
 * @param {'chord'|'groove'} type 
 */
function togglePower(type) {
    if (type === 'chord') {
        cb.enabled = !cb.enabled;
        ui.chordPowerBtn.classList.toggle('active', cb.enabled);
        
        // Find the content parts of the panel to visually disable
        const children = Array.from(document.getElementById('chordPanel').children);
        children.forEach(child => {
            if (!child.classList.contains('panel-header')) {
                child.style.opacity = cb.enabled ? '1' : '0.3';
                child.style.pointerEvents = cb.enabled ? 'all' : 'none';
                child.style.filter = cb.enabled ? 'none' : 'grayscale(1)';
            }
        });
        
        if (!cb.enabled) {
            // Clear any active visuals immediately
            document.querySelectorAll('.chord-card.active').forEach(c => c.classList.remove('active'));
        }
    } else if (type === 'groove') {
        gb.enabled = !gb.enabled;
        ui.groovePowerBtn.classList.toggle('active', gb.enabled);
        
        const children = Array.from(document.getElementById('groovePanel').children);
        children.forEach(child => {
            if (!child.classList.contains('panel-header')) {
                child.style.opacity = gb.enabled ? '1' : '0.3';
                child.style.pointerEvents = gb.enabled ? 'all' : 'none';
                child.style.filter = gb.enabled ? 'none' : 'grayscale(1)';
            }
        });

        if (!gb.enabled) {
            document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
        }
    }
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
            scheduleGlobalEvent(ctx.step, ctx.nextNoteTime);
            advanceGlobalStep();
        }
    }
    if (ctx.isPlaying) ctx.timerID = setTimeout(scheduler, ctx.lookahead);
}

function advanceCountIn() {
    ctx.nextNoteTime += 60.0 / ctx.bpm;
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
    ctx.step++;
}

/**
 * Finds the active chord for a given global step.
 * @param {number} step 
 */
function getChordAtStep(step) {
    let current = 0;
    if (!cb.progression.length) return null;
    for (const chord of cb.progression) {
        const chordSteps = Math.round(chord.beats * 4);
        if (step >= current && step < current + chordSteps) {
            return { chord, stepInChord: step - current, chordIndex: cb.progression.indexOf(chord) };
        }
        current += chordSteps;
    }
    return getChordAtStep(step % current);
}

/**
 * Schedules all audio events (drums and chords) for a single sixteenth note step.
 * @param {number} step 
 * @param {number} time 
 */
function scheduleGlobalEvent(step, time) {
    const totalSteps = gb.measures * 16;
    if (totalSteps === 0) return;
    const drumStep = step % totalSteps;
    
    // Global metronome flash (always runs if playing, or maybe controlled by groove buddy? 
    // Let's keep it global or tied to Groove Buddy. Tied to Groove Buddy makes sense as it's the "rhythm" section.)
    if (gb.enabled && drumStep % 4 === 0) {
        ctx.drawQueue.push({ type: 'flash', time: time, intensity: (drumStep % 16 === 0 ? 0.2 : 0.1), beat: (drumStep % 16 === 0 ? 1 : 0) });
    }

    if (gb.enabled) {
        ctx.drawQueue.push({ type: 'drum_vis', step: drumStep, time: time });
        gb.instruments.forEach(inst => {
            if (inst.steps[drumStep] && !inst.muted) playDrumSound(inst.name, time);
        });
    }

    const chordData = getChordAtStep(step);
    if (cb.enabled && chordData) {
        const { chord, stepInChord, chordIndex } = chordData;
        const spb = 60.0 / ctx.bpm;
        const measureStep = step % 16;
        
        if (stepInChord === 0) ctx.drawQueue.push({ type: 'chord_vis', index: chordIndex, time: time });
        
        // Audio playback logic based on style
        if (cb.style === 'pad') {
            if (stepInChord === 0) chord.freqs.forEach(f => playNote(f, time, chord.beats * spb, cb.volume * 0.2, 0.5, true, 4, ctx.bpm / 120));
        } else if (cb.style === 'pulse') {
            if (measureStep % 4 === 0) chord.freqs.forEach(f => playNote(f, time, spb * 2.0, cb.volume * 0.2, 0.01));
        } else if (cb.style === 'strum8') {
            if (measureStep % 2 === 0) chord.freqs.forEach(f => playNote(f, time, spb * 1.0, cb.volume * (measureStep % 4 === 0 ? 0.2 : 0.15), 0.01));
        } else if (cb.style === 'pop') {
            const popSteps = [0, 3, 6, 10, 12, 14];
            if (popSteps.includes(measureStep)) { 
                const isDownbeat = measureStep % 4 === 0;
                chord.freqs.forEach(f => playNote(f, time, spb * 1.5, cb.volume * (isDownbeat ? 0.2 : 0.15), 0.01));
            }
        } else if (cb.style === 'skank') {
            if (measureStep % 8 === 4) chord.freqs.forEach(f => playNote(f, time, spb * 1.0, cb.volume * 0.2, 0.01));
        } else if (cb.style === 'funk') {
            const funkSteps = [0, 3, 4, 7, 8, 11, 12, 15];
            if (funkSteps.includes(measureStep)) {
                chord.freqs.forEach(f => playNote(f, time, spb * 0.5, cb.volume * (measureStep % 4 === 0 ? 0.2 : 0.15), 0.005));
            }
        } else if (cb.style === 'arpeggio') {
            if (measureStep % 2 === 0) {
                const noteIdx = (Math.floor(stepInChord / 2)) % chord.freqs.length;
                playNote(chord.freqs[noteIdx], time, spb * 2.0, cb.volume * 0.2, 0.01);
            }
        } else if (cb.style === 'tresillo') {
            const tresilloSteps = [0, 3, 6, 8, 11, 14];
            if (tresilloSteps.includes(measureStep)) {
                chord.freqs.forEach(f => playNote(f, time, spb * 1.5, cb.volume * 0.2, 0.01));
            }
        } else if (cb.style === 'clave') {
            const sonClave = [0, 3, 6, 10, 12];
            if (sonClave.includes(measureStep)) {
                chord.freqs.forEach(f => playNote(f, time, spb * 1.0, cb.volume * 0.2, 0.01));
            }
        } else if (cb.style === 'jazz') {
            const charleston = [0, 6]; 
            if (charleston.includes(measureStep % 8)) {
                chord.freqs.forEach(f => playNote(f, time, spb * 1.0, cb.volume * 0.2, 0.01));
            }
        } else if (cb.style === 'bossa') {
            const bossa = [0, 3, 6, 10, 13];
            if (bossa.includes(measureStep)) {
                chord.freqs.forEach(f => playNote(f, time, spb * 1.2, cb.volume * 0.2, 0.01));
            }
        }
    }
}

/**
 * Renders the visual chord progression cards in the DOM.
 */
function renderChordVisualizer() {
    ui.chordVisualizer.innerHTML = '';
    if (cb.progression.length === 0) return;

    let measureBox = document.createElement('div');
    measureBox.className = 'measure-box';
    ui.chordVisualizer.appendChild(measureBox);
    
    let currentBeatsInBar = 0;

    cb.progression.forEach((chord, i) => {
        if (currentBeatsInBar >= 4) {
            measureBox = document.createElement('div');
            measureBox.className = 'measure-box';
            ui.chordVisualizer.appendChild(measureBox);
            currentBeatsInBar = 0;
        }

        const div = document.createElement('div');
        div.className = 'chord-card';
        if (chord.beats < 4) div.classList.add('small');
        if (chord.isMinor) div.classList.add('minor');
        
        if (cb.notation === 'name') div.innerHTML = chord.absName;
        else if (cb.notation === 'nns') div.innerHTML = chord.nnsName;
        else div.innerHTML = chord.romanName;
        
        measureBox.appendChild(div);
        currentBeatsInBar += chord.beats;
    });
}

/**
 * Renders the drum sequencer grid.
 */
function renderGrid() {
    ui.sequencerGrid.innerHTML = '';
    gb.instruments.forEach((inst, tIdx) => {
        const row = document.createElement('div');
        row.className = 'track';
        const header = document.createElement('div');
        header.className = 'track-header';
        header.innerHTML = `<span>${inst.symbol} <span>${inst.name}</span></span>`;
        header.style.cursor = "pointer"; if (inst.muted) header.style.opacity = 0.5;
        header.onclick = () => { inst.muted = !inst.muted; header.style.opacity = inst.muted ? 0.5 : 1; };
        row.appendChild(header);
        const stepsWrapper = document.createElement('div');
        stepsWrapper.className = 'steps-wrapper';
        for (let m = 0; m < gb.measures; m++) {
            const measureDiv = document.createElement('div'); measureDiv.className = 'steps';
            for (let b = 0; b < 16; b++) {
                const globalIdx = m * 16 + b, step = document.createElement('div');
                const active = inst.steps[globalIdx];
                step.className = `step ${active ? 'active' : ''}`; step.dataset.step = globalIdx;
                step.onclick = () => { inst.steps[globalIdx] = inst.steps[globalIdx] ? 0 : 1; renderGridState(); };
                measureDiv.appendChild(step);
            }
            stepsWrapper.appendChild(measureDiv);
        }
        row.appendChild(stepsWrapper); ui.sequencerGrid.appendChild(row);
    });

    // Add beat labels row
    const labelRow = document.createElement('div');
    labelRow.className = 'track label-row';
    const labelHeader = document.createElement('div');
    labelHeader.className = 'track-header label-header';
    labelHeader.innerHTML = '<span></span>';
    labelRow.appendChild(labelHeader);

    const labelsWrapper = document.createElement('div');
    labelsWrapper.className = 'steps-wrapper';
    
    const beatLabels = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
    
    for (let m = 0; m < gb.measures; m++) {
        const measureDiv = document.createElement('div');
        measureDiv.className = 'steps label-steps';
        beatLabels.forEach((text, i) => {
            const label = document.createElement('div');
            label.className = 'step-label';
            label.textContent = text;
            if (i % 4 === 0) label.classList.add('beat-start');
            measureDiv.appendChild(label);
        });
        labelsWrapper.appendChild(measureDiv);
    }
    labelRow.appendChild(labelsWrapper);
    ui.sequencerGrid.appendChild(labelRow);
}

/**
 * Updates only the 'active' classes in the drum grid without re-rendering the full DOM.
 */
function renderGridState() {
    const totalSteps = gb.measures * 16;
    gb.instruments.forEach((inst, tIdx) => {
        const trackRow = ui.sequencerGrid.children[tIdx], allSteps = trackRow.querySelectorAll('.step');
        for(let i=0; i < totalSteps; i++) {
            if (allSteps[i]) {
                allSteps[i].classList.toggle('active', !!inst.steps[i]);
            }
        }
    });
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
        if (ev.type === 'drum_vis') {
            document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
            const activeSteps = document.querySelectorAll(`.step[data-step="${ev.step}"]`);
            activeSteps.forEach(s => s.classList.add('playing'));
            
            if (activeSteps.length > 0 && ev.step % 16 === 0) {
                const container = ui.sequencerGrid;
                const step = activeSteps[0];
                const containerRect = container.getBoundingClientRect();
                const stepRect = step.getBoundingClientRect();
                const scrollLeft = stepRect.left - containerRect.left + container.scrollLeft - 100;
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        } else if (ev.type === 'chord_vis') {
            document.querySelectorAll('.chord-card').forEach((c, i) => {
                c.classList.toggle('active', i === ev.index);
            });
        } else if (ev.type === 'flash') {
            triggerFlash(ev.intensity);
        }
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
        saveUserPresets(userPresets);
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
        chip.className = 'preset-chip';
        chip.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        chip.innerHTML = `<span>${p.name}</span> <span style="margin-left: 8px; opacity: 0.5;" onclick="event.stopPropagation(); window.deleteUserPreset(${idx})">×</span>`;
        chip.onclick = () => {
            ui.progInput.value = p.prog;
            validateProgression(renderChordVisualizer);
            document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        ui.userPresetsContainer.appendChild(chip);
    });
}

window.deleteUserPreset = (idx) => {
    if (confirm("Delete this preset?")) {
        userPresets.splice(idx, 1);
        saveUserPresets(userPresets);
        renderUserPresets();
    }
};

function saveDrumPattern() {
    const name = prompt("Name this drum pattern:");
    if (name) {
        const pattern = gb.instruments.map(inst => ({ name: inst.name, steps: [...inst.steps] }));
        userDrumPresets.push({ name, pattern, measures: gb.measures, swing: gb.swing, swingSub: gb.swingSub });
        saveUserDrumPresets(userDrumPresets);
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
        saveUserDrumPresets(userDrumPresets);
        renderUserDrumPresets();
    }
};

// --- INITIALIZATION ---
function init() {
    renderGrid();
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
    loadDrumPreset('Standard');

    CHORD_PRESETS.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip chord-preset-chip';
        chip.textContent = p.name;
        if (p.name === 'Pop') chip.classList.add('active');
        chip.onclick = () => {
            ui.progInput.value = p.prog;
            validateProgression(renderChordVisualizer);
            document.querySelectorAll('.chord-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        ui.chordPresets.appendChild(chip);
    });

    CHORD_STYLES.forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip style-preset-chip';
        chip.textContent = s.name;
        chip.dataset.id = s.id;
        if (s.id === cb.style) chip.classList.add('active');
        chip.onclick = () => updateStyleUI(s.id);
        ui.chordStylePresets.appendChild(chip);
    });
    
    renderUserPresets();
    renderUserDrumPresets();
    loadFromUrl();
    validateProgression(renderChordVisualizer);

    // Event Listeners
    ui.playBtn.addEventListener('click', togglePlay);
    ui.bpmInput.addEventListener('change', e => { setBpm(e.target.value); });
    ui.tapBtn.addEventListener('click', handleTap);
    ui.saveBtn.addEventListener('click', saveProgression);
    ui.saveDrumBtn.addEventListener('click', saveDrumPattern);
    ui.shareBtn.addEventListener('click', shareProgression);
    ui.transUpBtn.addEventListener('click', () => transposeKey(1));
    ui.transDownBtn.addEventListener('click', () => transposeKey(-1));
    ui.maximizeChordBtn.addEventListener('click', () => {
        const container = document.querySelector('.app-container');
        container.classList.toggle('chord-maximized');
        ui.maximizeChordBtn.textContent = container.classList.contains('chord-maximized') ? '❐' : '⛶';
    });
    ui.settingsBtn.addEventListener('click', () => ui.settingsOverlay.classList.add('active'));
    ui.closeSettings.addEventListener('click', () => ui.settingsOverlay.classList.remove('active'));
    ui.settingsOverlay.addEventListener('click', (e) => { if(e.target === ui.settingsOverlay) ui.settingsOverlay.classList.remove('active'); });
    
    ui.keySelect.addEventListener('change', e => { cb.key = e.target.value; validateProgression(renderChordVisualizer); });
    ui.progInput.addEventListener('input', () => { validateProgression(renderChordVisualizer); });
    ui.chordVol.addEventListener('input', e => { cb.volume = parseFloat(e.target.value); });
    ui.octave.addEventListener('input', e => { 
        cb.octave = parseInt(e.target.value); 
        updateOctaveLabel(cb.octave);
        validateProgression(renderChordVisualizer); 
    });
    ui.notationSelect.addEventListener('change', e => { cb.notation = e.target.value; renderChordVisualizer(); });
    ui.clearDrums.addEventListener('click', () => { gb.instruments.forEach(i => i.steps.fill(0)); renderGridState(); });
    ui.drumVol.addEventListener('input', e => { gb.volume = parseFloat(e.target.value); });
    ui.drumBarsSelect.addEventListener('change', e => { 
        const newCount = parseInt(e.target.value);
        const oldMeasures = gb.measures;
        gb.instruments.forEach(inst => {
            const currentSteps = [...inst.steps];
            const newSteps = new Array(newCount * 16).fill(0);
            for (let i = 0; i < newSteps.length; i++) newSteps[i] = currentSteps[i % (oldMeasures * 16)];
            inst.steps = newSteps;
        });
        gb.measures = newCount;
        renderGrid();
    });
    ui.masterVol.addEventListener('input', e => {
        if (ctx.masterGain) ctx.masterGain.gain.setTargetAtTime(parseFloat(e.target.value), ctx.audio.currentTime, 0.02);
    });
    ui.swingSlider.addEventListener('input', e => { gb.swing = parseInt(e.target.value); });
    ui.swingBase.addEventListener('change', e => { gb.swingSub = e.target.value; });

    ui.chordPowerBtn.addEventListener('click', () => togglePower('chord'));
    ui.groovePowerBtn.addEventListener('click', () => togglePower('groove'));

    window.addEventListener('keydown', e => {
        if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            togglePlay();
        }
    });
}

function setBpm(val) {
    const newBpm = Math.max(40, Math.min(240, parseInt(val)));
    if (newBpm === ctx.bpm) return;
    if (ctx.isPlaying && ctx.audio) {
        const now = ctx.audio.currentTime, ratio = ctx.bpm / newBpm;
        const noteTimeRemaining = ctx.nextNoteTime - now;
        if (noteTimeRemaining > 0) ctx.nextNoteTime = now + (noteTimeRemaining * ratio);
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
    if (params.get('style')) updateStyleUI(params.get('style'));
    if (params.get('notation')) { cb.notation = params.get('notation'); ui.notationSelect.value = cb.notation; }
}

init();