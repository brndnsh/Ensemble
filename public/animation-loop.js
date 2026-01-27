import { ACTIONS } from './types.js';
import { playback, groove, chords, bass, soloist, harmony, vizState, dispatch, arranger } from './state.js';
import { ui, clearActiveVisuals, updateActiveChordUI } from './ui.js';
import { getVisualTime } from './engine.js';
import { getStepsPerMeasure } from './utils.js';
import { switchMeasure } from './instrument-controller.js';
import { TIME_SIGNATURES } from './config.js';
import { UIStore } from './ui-store.js';

export function updateDrumVis(ev) {
    if (playback.lastActiveDrumElements) playback.lastActiveDrumElements.forEach(s => s.classList.remove('playing'));
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const stepMeasure = Math.floor(ev.step / spm);
    if (groove.followPlayback && stepMeasure !== groove.currentMeasure && playback.isPlaying) switchMeasure(stepMeasure, true);
    const offset = groove.currentMeasure * spm;
    if (ev.step >= offset && ev.step < offset + spm) {
        const activeSteps = UIStore.cachedSteps[ev.step - offset];
        if (activeSteps) { activeSteps.forEach(s => s.classList.add('playing')); playback.lastActiveDrumElements = activeSteps; }
        else playback.lastActiveDrumElements = null;
    } else playback.lastActiveDrumElements = null;
    playback.lastPlayingStep = ev.step;
}

export function updateChordVis(ev) { updateActiveChordUI(ev.index); }

let lastFrameTime = 0;
let missedFrames = 0;
let vizCrashCount = 0;

export function draw(viz) {
    if (!playback.isDrawing) return;

    // --- Performance Resilience Monitoring ---
    const nowFrame = performance.now();
    if (lastFrameTime > 0) {
        const delta = nowFrame - lastFrameTime;
        if (delta > 35) { // Missed at least 2 frames (at 60fps)
            missedFrames++;
            if (missedFrames > 15) {
                dispatch(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
                missedFrames = 0;
            }
        } else if (delta < 20) {
            missedFrames = Math.max(0, missedFrames - 1);
        }
    }
    lastFrameTime = nowFrame;

    if (!playback.audio) {
        requestAnimationFrame(() => draw(viz));
        return;
    }
    if (!playback.isPlaying && playback.drawQueue.length === 0) { playback.isDrawing = false; clearActiveVisuals(viz); return; }
    const now = getVisualTime();
    while (playback.drawQueue.length > 0 && playback.drawQueue[0].time < now - 2.0) playback.drawQueue.shift();
    if (playback.drawQueue.length > 300) playback.drawQueue = playback.drawQueue.slice(playback.drawQueue.length - 200);
    while (playback.drawQueue.length && playback.drawQueue[0].time <= now) {
        const ev = playback.drawQueue.shift();
        if (ev.type === 'drum_vis') updateDrumVis(ev);
        else if (ev.type === 'chord_vis') {
            updateChordVis(ev);
            if (viz && vizState.enabled && playback.isDrawing) viz.pushChord({ time: ev.time, notes: ev.chordNotes, rootMidi: ev.rootMidi, intervals: ev.intervals, duration: ev.duration });
        } else if (ev.type === 'bass_vis') {
            if (viz && vizState.enabled && playback.isDrawing) viz.pushNote('bass', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'soloist_vis') {
            if (viz && vizState.enabled && playback.isDrawing) viz.pushNote('soloist', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'harmony_vis') {
            if (viz && vizState.enabled && playback.isDrawing) viz.pushNote('harmony', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'drums_vis') {
            if (viz && vizState.enabled && playback.isDrawing) viz.pushNote('drums', { midi: ev.midi, time: ev.time, velocity: ev.velocity, duration: ev.duration });
        } else if (ev.type === 'fill_active') {
            if (viz && vizState.enabled && playback.isDrawing) viz.isFillActive = ev.active;
        }
    }
    if (viz && vizState.enabled && playback.isDrawing) {
        try {
            viz.setRegister('bass', bass.octave); viz.setRegister('soloist', soloist.octave); viz.setRegister('chords', chords.octave); viz.setRegister('harmony', harmony.octave);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
            viz.render(now, playback.bpm, ts.beats);
            vizCrashCount = 0;
        } catch (e) {
            console.error("[Visualizer Error]", e);
            vizCrashCount++;
            if (vizCrashCount > 3) {
                console.warn("Visualizer disabled due to repeated errors.");
                vizState.enabled = false;
                vizCrashCount = 0;
            }
        }
    }

    // --- Session Timer Display Update ---
    if (playback.isPlaying && playback.sessionTimer > 0 && ui.playBtnTimer) {
        const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
        const remainingMins = playback.sessionTimer - elapsedMins;

        if (remainingMins <= 0) {
            ui.playBtnTimer.style.display = 'none';
        } else {
            ui.playBtnTimer.style.display = 'block';

            const totalSeconds = Math.max(0, Math.ceil(remainingMins * 60));
            const m = Math.floor(totalSeconds / 60);
            const s = totalSeconds % 60;
            ui.playBtnTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;

            if (totalSeconds <= 30) {
                ui.playBtnTimer.classList.add('warning');
            } else {
                ui.playBtnTimer.classList.remove('warning');
            }
        }
    } else if (ui.playBtnTimer) {
        ui.playBtnTimer.style.display = 'none';
        ui.playBtnTimer.classList.remove('warning');
    }

    requestAnimationFrame(() => draw(viz));
}