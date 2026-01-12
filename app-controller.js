import { ctx, arranger, gb } from './state.js';
import { ui, updateOctaveLabel, renderMeasurePagination, renderGrid } from './ui.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { getStepsPerMeasure } from './utils.js';
import { switchMeasure } from './instrument-controller.js';

export function applyTheme(theme) {
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

export function setBpm(val, viz) {
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
        const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
        const measureTime = ctx.unswungNextNoteTime - (ctx.step % stepsPerMeasure) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}