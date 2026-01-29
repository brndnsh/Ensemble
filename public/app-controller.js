import { playback, arranger } from './state.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { getStepsPerMeasure } from './utils.js';

export function applyTheme(theme) {
    playback.theme = theme;
    if (theme === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }
}

export function setBpm(val, viz) {
    const newBpm = Math.max(40, Math.min(240, parseInt(val)));
    if (newBpm === playback.bpm) return;
    
    if (playback.isPlaying && playback.audio) {
        const now = playback.audio.currentTime, ratio = playback.bpm / newBpm;
        const noteTimeRemaining = playback.nextNoteTime - now;
        if (noteTimeRemaining > 0) playback.nextNoteTime = now + (noteTimeRemaining * ratio);
        
        const unswungNoteTimeRemaining = playback.unswungNextNoteTime - now;
        if (unswungNoteTimeRemaining > 0) playback.unswungNextNoteTime = now + (unswungNoteTimeRemaining * ratio);
    }
    playback.bpm = newBpm; 
    
    syncWorker();
    saveCurrentState();

    if (viz && playback.isPlaying && playback.audio) {
        const secondsPerBeat = 60.0 / playback.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
        const measureTime = playback.unswungNextNoteTime - (playback.step % stepsPerMeasure) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}