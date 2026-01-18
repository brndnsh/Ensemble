import { ACTIONS } from './types.js';
import { ctx, gb, cb, bb, sb, vizState, dispatch, arranger } from './state.js';
import { ui, triggerFlash, clearActiveVisuals, updateActiveChordUI } from './ui.js';
import { getVisualTime } from './engine.js';
import { getStepsPerMeasure } from './utils.js';
import { switchMeasure } from './instrument-controller.js';
import { TIME_SIGNATURES } from './config.js';
import { UIStore } from './ui-store.js';

export function updateDrumVis(ev) {
    if (ctx.lastActiveDrumElements) ctx.lastActiveDrumElements.forEach(s => s.classList.remove('playing'));
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const stepMeasure = Math.floor(ev.step / spm);
    if (gb.followPlayback && stepMeasure !== gb.currentMeasure && ctx.isPlaying) switchMeasure(stepMeasure, true);
    const offset = gb.currentMeasure * spm;
    if (ev.step >= offset && ev.step < offset + spm) {
        const activeSteps = UIStore.cachedSteps[ev.step - offset];
        if (activeSteps) { activeSteps.forEach(s => s.classList.add('playing')); ctx.lastActiveDrumElements = activeSteps; }
        else ctx.lastActiveDrumElements = null;
    } else ctx.lastActiveDrumElements = null;
    ctx.lastPlayingStep = ev.step;
}

export function updateChordVis(ev) { updateActiveChordUI(ev.index); }

let lastFrameTime = 0;
let missedFrames = 0;

export function draw(viz) {
    if (!ctx.isDrawing) return;

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

    if (!ctx.audio) {
        requestAnimationFrame(() => draw(viz));
        return;
    }
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
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        viz.render(now, ctx.bpm, ts.beats);
    }
    requestAnimationFrame(() => draw(viz));
}