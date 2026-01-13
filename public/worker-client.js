import { arranger, cb, bb, sb, gb, ctx } from './state.js';

let timerWorker = null;
let onTickCallback = null;

export function initWorker(onTick, onNotes) {
    timerWorker = new Worker('./logic-worker.js', { type: 'module' });
    
    timerWorker.onmessage = (e) => {
        const { type, notes, data, stack, blob, filename } = e.data;
        if (type === 'tick') {
            if (onTick) onTick();
        } else if (type === 'notes') {
            if (onNotes) onNotes(notes);
        } else if (type === 'error') {
            console.error("[Worker Error]", data, stack);
        } else if (type === 'exportComplete') {
            const url = URL.createObjectURL(new Blob([blob], { type: 'audio/midi' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    timerWorker.onerror = (e) => {
        console.error("Worker error:", e);
    };
}

export function startExport(options) {
    if (timerWorker) timerWorker.postMessage({ type: 'export', data: options });
}


export function startWorker() {
    if (timerWorker) timerWorker.postMessage({ type: 'start' });
}

export function stopWorker() {
    if (timerWorker) timerWorker.postMessage({ type: 'stop' });
}

export function flushWorker(step) {
    if (timerWorker) timerWorker.postMessage({ type: 'flush', data: { step } });
}

export function requestBuffer(step) {
    if (timerWorker) timerWorker.postMessage({ type: 'requestBuffer', data: { step } });
}

export function syncWorker() {
    if (!timerWorker) return;
    timerWorker.postMessage({
        type: 'syncState',
        data: {
            arranger: { 
                progression: arranger.progression, 
                stepMap: arranger.stepMap, 
                totalSteps: arranger.totalSteps,
                key: arranger.key,
                isMinor: arranger.isMinor,
                timeSignature: arranger.timeSignature,
                grouping: arranger.grouping
            },
            cb: { style: cb.style, octave: cb.octave, density: cb.density, enabled: cb.enabled, volume: cb.volume },
            bb: { style: bb.style, octave: bb.octave, enabled: bb.enabled, lastFreq: bb.lastFreq, volume: bb.volume },
            sb: { style: sb.style, octave: sb.octave, enabled: sb.enabled, lastFreq: sb.lastFreq, volume: sb.volume },
            gb: { 
                genreFeel: gb.genreFeel, 
                lastDrumPreset: gb.lastDrumPreset, 
                enabled: gb.enabled, 
                volume: gb.volume,
                measures: gb.measures,
                swing: gb.swing,
                swingSub: gb.swingSub,
                instruments: gb.instruments.map(i => ({ name: i.name, steps: [...i.steps], muted: i.muted }))
            },
            ctx: { bpm: ctx.bpm, bandIntensity: ctx.bandIntensity, complexity: ctx.complexity, autoIntensity: ctx.autoIntensity }
        }
    });
}
