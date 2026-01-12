import { ctx, gb, cb, bb, sb, vizState, storage, arranger } from './state.js';
import { ui, initUI, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState, clearActiveVisuals, renderSections, initTabs, renderMeasurePagination, setupPanelMenus, updateActiveChordUI, updateKeySelectLabels } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch, getVisualTime } from './engine.js';
import { KEY_ORDER, MIXER_GAIN_MULTIPLIERS, APP_VERSION, TIME_SIGNATURES } from './config.js';
import { SONG_TEMPLATES, DRUM_PRESETS, CHORD_PRESETS } from './presets.js';
import { normalizeKey, getMidi, midiToNote, generateId, compressSections, decompressSections, getStepsPerMeasure } from './utils.js';
import { validateProgression, transformRelativeProgression } from './chords.js';
import { chordPatterns } from './accompaniment.js';
import { exportToMidi } from './midi-export.js';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, startWorker, stopWorker, flushWorker, requestBuffer, syncWorker } from './worker-client.js';
import { initPWA, triggerInstall } from './pwa.js';
import { saveCurrentState, debounceSaveState, renderUserPresets, renderUserDrumPresets } from './persistence.js';
import { conductorState, applyConductor, updateAutoConductor, checkSectionTransition } from './conductor.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { analyzeFormUI, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, onSectionUpdate, onSectionDelete, onSectionDuplicate, addSection, transposeKey, switchToRelativeKey } from './arranger-controller.js';
import { switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, handleTap, resetToDefaults, flushBuffers, togglePower, getPowerConfig, setInstrumentControllerRefs, initializePowerButtons } from './instrument-controller.js';
import { updateStyle, setupPresets, setupUIHandlers } from './ui-controller.js';
import { applyTheme, setBpm } from './app-controller.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;
let viz;

/** @type {HTMLAudioElement} */
const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ");
silentAudio.loop = true;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { ctx.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

function releaseWakeLock() { 
    if (ctx.wakeLock) { 
        ctx.wakeLock.release(); 
        ctx.wakeLock = null; 
    } 
}

function togglePlay() {
    if (ctx.isPlaying) {
        ctx.isPlaying = false;
        ui.playBtn.textContent = 'START';
        ui.playBtn.classList.remove('playing');
        stopWorker();
        silentAudio.pause();
        silentAudio.currentTime = 0;
        releaseWakeLock();
        ctx.drawQueue = [];
        ctx.lastActiveDrumElements = null;
        cb.lastActiveChordIndex = null;
        clearActiveVisuals(viz);
        flushBuffers();
        ui.sequencerGrid.scrollTo({ left: 0, behavior: 'smooth' });
        if (ctx.audio) {
            if (ctx.suspendTimeout) clearTimeout(ctx.suspendTimeout);
            ctx.suspendTimeout = setTimeout(() => {
                if (!ctx.isPlaying && ctx.audio.state === 'running') ctx.audio.suspend();
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
        const startTime = ctx.audio.currentTime + 0.1;
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

function scheduler() {
    requestBuffer(ctx.step);
    while (ctx.nextNoteTime < ctx.audio.currentTime + ctx.scheduleAheadTime) {
        if (ctx.isCountingIn) {
            scheduleCountIn(ctx.countInBeat, ctx.nextNoteTime);
            advanceCountIn();
        } else {
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
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (ctx.countInBeat >= ts.beats) {
        ctx.isCountingIn = false;
        ctx.step = 0; 
    }
}

function scheduleCountIn(beat, time) {
     if (ui.visualFlash.checked) ctx.drawQueue.push({ type: 'flash', time: time, intensity: 0.3, beat: 1 });
     const osc = ctx.audio.createOscillator();
     const gain = ctx.audio.createGain();
     osc.connect(gain);
     gain.connect(ctx.masterGain);
     const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
     let freq = 440;
     if (beat === 0) freq = 1000;
     else if (ts.grouping) {
         const groups = ts.grouping.split('+').map(Number);
         let accumulated = 0;
         for (let g of groups) {
             if (beat === accumulated && beat !== 0) { freq = 800; break; }
             accumulated += g;
         }
     } else {
         if (beat === 0) freq = 1000;
         else if (arranger.timeSignature === '4/4' && beat === 2) freq = 800;
         else if (arranger.timeSignature === '6/8' && beat === 3) freq = 800;
         else if (arranger.timeSignature === '12/8' && (beat === 3 || beat === 6 || beat === 9)) freq = 800;
     }
     osc.frequency.setValueAtTime(freq, time);
     gain.gain.setValueAtTime(0.3, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
     osc.onended = () => { gain.disconnect(); osc.disconnect(); };
     osc.start(time);
     osc.stop(time + 0.1);
}

function advanceGlobalStep() {
    const sixteenth = 0.25 * (60.0 / ctx.bpm);
    let duration = sixteenth;
    if (gb.swing > 0) {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        if (ts.stepsPerBeat === 4) {
            const shift = (sixteenth / 3) * (gb.swing / 100);
            duration += (gb.swingSub === '16th') ? ((ctx.step % 2 === 0) ? shift : -shift) : (((ctx.step % 4) < 2) ? shift : -shift);
        }
    }
    ctx.nextNoteTime += duration;
    ctx.unswungNextNoteTime += sixteenth;
    ctx.step++;
}

function getChordAtStep(step) {
    if (arranger.totalSteps === 0) return null;
    const targetStep = step % arranger.totalSteps;
    for (let i = 0; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            return { chord: entry.chord, stepInChord: targetStep - entry.start, chordIndex: i };
        }
    }
    return null;
}

function scheduleDrums(step, time, isDownbeat, isQuarter, isBackbeat, absoluteStep) {
    const conductorVel = ctx.conductorVelocity || 1.0;
    const header = document.querySelector('.groove-panel-header h2');
    if (header) header.style.color = gb.fillActive ? 'var(--soloist-color)' : '';
    if (gb.fillActive) {
        const fillStep = absoluteStep - gb.fillStartStep;
        if (fillStep >= gb.fillLength) {
            gb.fillActive = false;
            if (gb.pendingCrash) { playDrumSound('Crash', time, 1.1 * conductorVel); gb.pendingCrash = false; }
        }
    }
    if (gb.fillActive) {
        const fillStep = absoluteStep - gb.fillStartStep;
        if (fillStep >= 0 && fillStep < gb.fillLength) {
            if (ctx.bandIntensity >= 0.5 || fillStep >= (gb.fillLength / 2)) {
                const notes = gb.fillSteps[fillStep];
                if (notes && notes.length > 0) {
                    notes.forEach(note => playDrumSound(note.name, time, note.vel * conductorVel));
                    return;
                }
            }
        }
    }
    gb.instruments.forEach(inst => {
        const stepVal = inst.steps[step];
        if (stepVal > 0 && !inst.muted) {
            let velocity = stepVal === 2 ? 1.25 : 0.9;
            let soundName = inst.name;
            if (gb.genreFeel === 'Rock') {
                if (inst.name === 'Kick' && isDownbeat) velocity *= 1.2;
                if (inst.name === 'Snare' && isBackbeat) velocity *= 1.2;
            } else if (gb.genreFeel === 'Funk' && stepVal === 2) velocity *= 1.1;
            if (inst.name === 'HiHat' && gb.genreFeel !== 'Jazz' && ctx.bandIntensity > 0.8 && isQuarter) { soundName = 'Open'; velocity *= 1.1; }
            if (inst.name === 'Kick') velocity *= isDownbeat ? 1.15 : (isQuarter ? 1.05 : 0.9);
            else if (inst.name === 'Snare') velocity *= isBackbeat ? 1.1 : 0.9;
            else if (inst.name === 'HiHat' || inst.name === 'Open') {
                velocity *= isQuarter ? 1.1 : 0.85;
                // Tame the ride/hihat for Jazz at high intensity to prevent it from becoming wash-heavy
                if (gb.genreFeel === 'Jazz') velocity *= (1.0 - (ctx.bandIntensity * 0.35));
                if (ctx.bpm > 165) { velocity *= 0.7; if (!isQuarter) velocity *= 0.6; }
            }
            playDrumSound(soundName, time, velocity * conductorVel);
        } else if (stepVal === 0 && !inst.muted && inst.name === 'Snare' && (gb.genreFeel === 'Funk' || gb.genreFeel === 'Jazz') && ctx.complexity > 0.4 && Math.random() < (ctx.complexity * 0.35)) {
            playDrumSound('Snare', time, 0.15 * conductorVel);
        }
    });
}

function scheduleBass(chordData, step, time) {
    const noteEntry = bb.buffer.get(step);
    bb.buffer.delete(step);
    if (noteEntry && noteEntry.freq) {
        const { freq, chordData: cData, durationMultiplier, velocity, timingOffset } = noteEntry; 
        const { chord } = cData || chordData;
        const adjustedTime = time + (timingOffset || 0);
        bb.lastPlayedFreq = freq;
        const midi = getMidi(freq);
        const { name, octave } = midiToNote(midi);
        const spb = 60.0 / ctx.bpm;
        const duration = durationMultiplier ? 0.25 * spb * durationMultiplier : (bb.style === 'whole' ? chord.beats : (bb.style === 'half' ? 2 : 1)) * spb;
        const finalVel = (velocity || 1.0) * (ctx.conductorVelocity || 1.0);
        if (vizState.enabled) ctx.drawQueue.push({ type: 'bass_vis', name, octave, midi, time: adjustedTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration });
        playBassNote(freq, adjustedTime, duration, finalVel, noteEntry.muted);
    }
}

function scheduleSoloist(chordData, step, time, unswungTime) {
    const noteEntry = sb.buffer.get(step);
    sb.buffer.delete(step);
    if (noteEntry && noteEntry.freq) {
        const { freq, extraFreq, extraMidi, extraFreq2, extraMidi2, durationMultiplier, velocity, bendStartInterval, style, chordData: cData, timingOffset, noteType } = noteEntry;
        const { chord } = cData || chordData;
        const offsetS = (timingOffset || 0) / 1000;
        sb.lastPlayedFreq = freq;
        const midi = noteEntry.midi || getMidi(freq);
        const { name, octave } = midiToNote(midi);
        const spb = 60.0 / ctx.bpm;
        const duration = 0.25 * spb * (durationMultiplier || 1);
        const vel = (velocity || 1.0) * (ctx.conductorVelocity || 1.0);
        const playTime = unswungTime + (style === 'neo' ? (0.01 + Math.random() * 0.035) : 0) + offsetS;
        playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);
        if (vizState.enabled) {
            [ { f: extraFreq, m: extraMidi, v: 0.7 }, { f: extraFreq2, m: extraMidi2, v: 0.5 } ].forEach(extra => {
                if (extra.f && extra.m) {
                    playSoloNote(extra.f, playTime, duration, vel * extra.v, bendStartInterval || 0, style);
                    const n = midiToNote(extra.m);
                    ctx.drawQueue.push({ type: 'soloist_vis', name: n.name, octave: n.octave, midi: extra.m, time: playTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration, noteType });
                }
            });
            ctx.drawQueue.push({ type: 'soloist_vis', name, octave, midi, time: playTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration, noteType });
        } else {
            if (extraFreq) playSoloNote(extraFreq, playTime, duration, vel * 0.7, bendStartInterval || 0, style);
            if (extraFreq2) playSoloNote(extraFreq2, playTime, duration, vel * 0.5, bendStartInterval || 0, style);
        }
        sb.lastNoteEnd = playTime + duration;
    }
}

function scheduleChordVisuals(chordData, t) {
    if (chordData.stepInChord === 0) {
        ctx.drawQueue.push({ type: 'chord_vis', time: t, index: chordData.chordIndex, chordNotes: chordData.chord.freqs.map(f => getMidi(f)), rootMidi: chordData.chord.rootMidi, intervals: chordData.chord.intervals, duration: chordData.chord.beats * (60/ctx.bpm) });
        if (ui.visualFlash.checked) {
            ctx.drawQueue.push({ type: 'flash', time: t, intensity: 0.15, beat: 0 });
        }
    }
}

function scheduleChords(chordData, step, time) {
    const { chord, stepInChord } = chordData;
    const pattern = chordPatterns[cb.style];
    if (pattern) pattern(chord, time, 60.0 / ctx.bpm, stepInChord, step % getStepsPerMeasure(arranger.timeSignature), step);
}

function scheduleGlobalEvent(step, swungTime) {
    const spm = getStepsPerMeasure(arranger.timeSignature);
    updateAutoConductor();
    checkSectionTransition(step, spm);
    const drumStep = step % (gb.measures * spm);
    const t = swungTime + (Math.random() - 0.5) * (gb.humanize / 100) * 0.025;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (ui.metronome.checked && ts.pulse.includes(step % spm)) {
        const beatIndex = (step % spm) / ts.stepsPerBeat;
        let freq = (step % spm === 0) ? 1000 : 600;
        if (ts.grouping && step % spm !== 0) {
            const groups = ts.grouping.split('+').map(Number);
            let acc = 0;
            for (let g of groups) { if (Math.abs(beatIndex - acc) < 0.01 && beatIndex !== 0) { freq = 800; break; } acc += g; }
        } else if (step % spm !== 0) {
            if (arranger.timeSignature === '4/4' && Math.abs(beatIndex - 2) < 0.01) freq = 800;
            else if (arranger.timeSignature === '6/8' && Math.abs(beatIndex - 3) < 0.01) freq = 800;
            else if (arranger.timeSignature === '12/8' && (Math.abs(beatIndex - 3) < 0.01 || Math.abs(beatIndex - 6) < 0.01 || Math.abs(beatIndex - 9) < 0.01)) freq = 800;
        }
        const osc = ctx.audio.createOscillator();
        const g = ctx.audio.createGain();
        osc.connect(g); g.connect(ctx.masterGain);
        osc.frequency.setValueAtTime(freq, swungTime);
        g.gain.setValueAtTime(0.15, swungTime);
        g.gain.exponentialRampToValueAtTime(0.001, swungTime + 0.05);
        osc.start(swungTime); osc.stop(swungTime + 0.05);
        osc.onended = () => { g.disconnect(); osc.disconnect(); };
    }
    const straightness = (sb.style === 'neo') ? 0.35 : ((sb.style === 'blues') ? 0.45 : 0.65);
    const soloistTime = (ctx.unswungNextNoteTime * straightness) + (swungTime * (1.0 - straightness)) + (Math.random() - 0.5) * (gb.humanize / 100) * 0.025;
    if (gb.enabled) {
        const isDownbeat = (drumStep % spm === 0);
        const isQuarter = ts.pulse.includes(drumStep % spm);
        const isBackbeat = (ts.beats === 4) ? (drumStep % spm === ts.stepsPerBeat || drumStep % spm === ts.stepsPerBeat * 3) : false;

        if (ts.pulse.includes(drumStep % spm) && ui.visualFlash.checked) ctx.drawQueue.push({ type: 'flash', time: swungTime, intensity: (drumStep % spm === 0 ? 0.2 : 0.1), beat: (drumStep % spm === 0 ? 1 : 0) });
        ctx.drawQueue.push({ type: 'drum_vis', step: drumStep, time: swungTime });
        scheduleDrums(drumStep, t, isDownbeat, isQuarter, isBackbeat, step);
    }
    const chordData = getChordAtStep(step);
    if (chordData) {
        scheduleChordVisuals(chordData, t);
        if (bb.enabled) scheduleBass(chordData, step, t);
        if (sb.enabled) scheduleSoloist(chordData, step, t, soloistTime);
        if (cb.enabled) scheduleChords(chordData, step, t);
    }
}

function updateDrumVis(ev) {
    if (ctx.lastActiveDrumElements) ctx.lastActiveDrumElements.forEach(s => s.classList.remove('playing'));
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const stepMeasure = Math.floor(ev.step / spm);
    if (gb.autoFollow && stepMeasure !== gb.currentMeasure && ctx.isPlaying) switchMeasure(stepMeasure);
    const offset = gb.currentMeasure * spm;
    if (ev.step >= offset && ev.step < offset + spm) {
        const activeSteps = gb.cachedSteps[ev.step - offset];
        if (activeSteps) { activeSteps.forEach(s => s.classList.add('playing')); ctx.lastActiveDrumElements = activeSteps; }
        else ctx.lastActiveDrumElements = null;
    } else ctx.lastActiveDrumElements = null;
    ctx.lastPlayingStep = ev.step;
}

function updateChordVis(ev) { updateActiveChordUI(ev.index); }

function draw() {
    if (!ctx.audio) return;
    if (ctx.autoIntensity && ui.intensitySlider) {
        const val = Math.round(ctx.bandIntensity * 100);
        if (parseInt(ui.intensitySlider.value) !== val) { ui.intensitySlider.value = val; if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`; }
    }
    if (!ctx.isPlaying && ctx.drawQueue.length === 0) { ctx.isDrawing = false; clearActiveVisuals(viz); return; }
    const now = getVisualTime();
    while (ctx.drawQueue.length > 0 && ctx.drawQueue[0].time < now - 2.0) ctx.drawQueue.shift();
    if (ctx.drawQueue.length > 300) ctx.drawQueue = ctx.drawQueue.slice(ctx.drawQueue.length - 200);
    while (ctx.drawQueue.length && ctx.drawQueue[0].time <= now) {
        const ev = ctx.drawQueue.shift();
        if (ev.type === 'drum_vis') updateDrumVis(ev);
        else if (ev.type === 'chord_vis') {
            updateChordVis(ev);
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushChord({ time: ev.time, notes: ev.chordNotes, rootMidi: ev.rootMidi, intervals: ev.intervals, duration: ev.duration });
        } else if (ev.type === 'bass_vis') {
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushNote('bass', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'soloist_vis') {
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushNote('soloist', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'flash') triggerFlash(ev.intensity);
    }
    if (viz && vizState.enabled && ctx.isDrawing) {
        viz.setRegister('bass', bb.octave); viz.setRegister('soloist', sb.octave); viz.setRegister('chords', cb.octave);
        viz.render(now, ctx.bpm);
    }
    requestAnimationFrame(draw);
}

function init() {
    try {
        initUI();
        const savedState = storage.get('currentState');
        if (savedState && savedState.sections) {
            arranger.sections = savedState.sections; arranger.key = savedState.key || 'C'; arranger.timeSignature = savedState.timeSignature || '4/4'; arranger.isMinor = savedState.isMinor || false; arranger.notation = savedState.notation || 'roman'; arranger.lastChordPreset = savedState.lastChordPreset || 'Pop (Standard)'; ctx.theme = savedState.theme || 'auto'; ctx.bpm = savedState.bpm || 100; ctx.bandIntensity = savedState.bandIntensity !== undefined ? savedState.bandIntensity : 0.5; ctx.complexity = savedState.complexity !== undefined ? savedState.complexity : 0.3; ctx.autoIntensity = savedState.autoIntensity || false; ctx.metronome = savedState.metronome || false; ctx.applyPresetSettings = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false; vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
            
            if (savedState.cb) { 
                cb.enabled = savedState.cb.enabled !== undefined ? savedState.cb.enabled : true; 
                cb.style = (savedState.cb.style && savedState.cb.style !== 'smart') ? 'smart' : 'smart'; 
                cb.instrument = 'Piano'; // Always force Piano
                cb.octave = savedState.cb.octave; cb.density = savedState.cb.density; cb.volume = savedState.cb.volume; cb.reverb = savedState.cb.reverb; 
                cb.practiceMode = savedState.cb.practiceMode || false;
            }
            if (savedState.bb) { bb.enabled = savedState.bb.enabled !== undefined ? savedState.bb.enabled : false; bb.style = savedState.bb.style || 'arp'; bb.octave = savedState.bb.octave; bb.volume = savedState.bb.volume; bb.reverb = savedState.bb.reverb; }
            if (savedState.sb) { sb.enabled = savedState.sb.enabled !== undefined ? savedState.sb.enabled : false; sb.style = savedState.sb.style || 'scalar'; sb.octave = (savedState.sb.octave === 77 || savedState.sb.octave === 67 || savedState.sb.octave === undefined) ? 72 : savedState.sb.octave; sb.volume = savedState.sb.volume; sb.reverb = savedState.sb.reverb; }
            if (savedState.gb) { gb.enabled = savedState.gb.enabled !== undefined ? savedState.gb.enabled : true; gb.volume = savedState.gb.volume; gb.reverb = savedState.gb.reverb; gb.swing = savedState.gb.swing; gb.swingSub = savedState.gb.swingSub; gb.measures = savedState.gb.measures || 1; gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20; gb.autoFollow = savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true; gb.lastDrumPreset = savedState.gb.lastDrumPreset || 'Standard'; if (savedState.gb.pattern) { savedState.gb.pattern.forEach(savedInst => { const inst = gb.instruments.find(i => i.name === savedInst.name); if (inst) { inst.steps.fill(0); savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; }); } }); } gb.genreFeel = savedState.gb.genreFeel || 'Rock'; gb.lastSmartGenre = savedState.gb.lastSmartGenre || 'Rock'; gb.activeTab = savedState.gb.activeTab || 'classic'; gb.mobileTab = savedState.gb.mobileTab || 'chords'; gb.currentMeasure = 0; }
            ui.keySelect.value = arranger.key; ui.timeSigSelect.value = arranger.timeSignature; ui.bpmInput.value = ctx.bpm;
            if (ui.intensitySlider) { ui.intensitySlider.value = Math.round(ctx.bandIntensity * 100); if (ui.intensityValue) ui.intensityValue.textContent = `${ui.intensitySlider.value}%`; ui.intensitySlider.disabled = ctx.autoIntensity; ui.intensitySlider.style.opacity = ctx.autoIntensity ? 0.5 : 1; }
            if (ui.complexitySlider) { ui.complexitySlider.value = Math.round(ctx.complexity * 100); let label = 'Low'; if (ctx.complexity > 0.33) label = 'Medium'; if (ctx.complexity > 0.66) label = 'High'; if (ui.complexityValue) ui.complexityValue.textContent = label; }
            if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = ctx.autoIntensity;
            document.querySelectorAll('.genre-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.genre === gb.lastSmartGenre); });
            ui.notationSelect.value = arranger.notation; ui.densitySelect.value = cb.density; 
            if (ui.practiceModeCheck) ui.practiceModeCheck.checked = cb.practiceMode;
            ui.octave.value = cb.octave; ui.bassOctave.value = bb.octave; ui.soloistOctave.value = sb.octave; ui.chordVol.value = cb.volume; ui.chordReverb.value = cb.reverb; ui.bassVol.value = bb.volume; ui.bassReverb.value = bb.reverb; ui.soloistVol.value = sb.volume; ui.soloistReverb.value = sb.reverb; ui.drumVol.value = gb.volume; ui.drumReverb.value = gb.reverb; ui.swingSlider.value = gb.swing; ui.swingBase.value = gb.swingSub; ui.humanizeSlider.value = gb.humanize; ui.autoFollowCheck.checked = gb.autoFollow; ui.drumBarsSelect.value = gb.measures; ui.metronome.checked = ctx.metronome; ui.applyPresetSettings.checked = ctx.applyPresetSettings;
            applyTheme(ctx.theme); updateRelKeyButton(); updateKeySelectLabels(); updateOctaveLabel(ui.octaveLabel, cb.octave); updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg); updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
        } else { applyTheme('auto'); }
        viz = new UnifiedVisualizer('unifiedVizContainer'); viz.addTrack('bass', 'var(--success-color)'); viz.addTrack('soloist', 'var(--soloist-color)');
        setInstrumentControllerRefs(() => scheduler(), viz);
        initTabs(); setupPanelMenus(); renderGrid(); renderMeasurePagination(switchMeasure);
        if (!savedState || !savedState.gb || !savedState.gb.pattern) loadDrumPreset('Standard');
        setupPresets(); setupUIHandlers({ togglePlay, previewChord: window.previewChord, init, viz, silentAudio, iosAudioUnlocked, POWER_CONFIG: getPowerConfig() });
        renderUserPresets(onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI);
        renderUserDrumPresets(switchMeasure); loadFromUrl(); renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        
        initializePowerButtons();
        
        validateProgression(() => { renderChordVisualizer(); analyzeFormUI(); });
        initWorker(() => scheduler(), (notes) => { notes.forEach(n => { if (n.module === 'bb') bb.buffer.set(n.step, n); else if (n.module === 'sb') sb.buffer.set(n.step, n); }); });
        syncWorker(); document.querySelector('.app-main-layout').classList.add('loaded');
        const versionEl = document.getElementById('appVersion'); if (versionEl) versionEl.textContent = `Ensemble v${APP_VERSION}`;
    } catch (e) { console.error("Error during init:", e); }
}

window.previewChord = (index) => {
    if (ctx.isPlaying) return; 
    initAudio(); 
    const chord = arranger.progression[index]; 
    if (!chord) return;
    
    // Disable sustain for auditioning
    const wasSustainActive = ctx.sustainActive;
    ctx.sustainActive = false;
    
    const now = ctx.audio.currentTime; 
    chord.freqs.forEach(f => playNote(f, now, 1.0, { vol: 0.15, instrument: 'Piano' }));
    
    // Restore sustain state (though usually false when not playing)
    ctx.sustainActive = wasSustainActive;

    const cards = document.querySelectorAll('.chord-card'); 
    if (cards[index]) { 
        cards[index].classList.add('active'); 
        setTimeout(() => { if (!ctx.isPlaying) cards[index].classList.remove('active'); }, 300); 
    }
};

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search); let hasParams = false;
    if (params.get('s')) { arranger.sections = decompressSections(params.get('s')); hasParams = true; }
    else if (params.get('prog')) { arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }]; hasParams = true; }
    if (hasParams) clearChordPresetHighlight();
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); arranger.key = ui.keySelect.value; }
    if (params.get('ts')) { arranger.timeSignature = params.get('ts'); ui.timeSigSelect.value = arranger.timeSignature; }
    if (params.get('bpm')) { setBpm(params.get('bpm'), viz); }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

function updateRelKeyButton() {
    if (ui.relKeyBtn) ui.relKeyBtn.textContent = arranger.isMinor ? 'min' : 'maj';
}

window.addEventListener('load', () => { init(); initPWA(); });
