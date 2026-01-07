import { arranger, cb, bb, sb, ctx } from './state.js';

let timerWorker = null;
let onTickCallback = null;

export function initWorker(onTick, onNotes) {
    timerWorker = new Worker('./logic-worker.js', { type: 'module' });
    
    timerWorker.onmessage = (e) => {
        const { type, notes, data, stack } = e.data;
        if (type === 'tick') {
            if (onTick) onTick();
        } else if (type === 'notes') {
            if (onNotes) onNotes(notes);
        } else if (type === 'error') {
            console.error("[Worker Error]", data, stack);
        }
    };

    timerWorker.onerror = (e) => {
        console.error("Worker error:", e);
    };
}

    timerWorker.onerror = (e) => {
        console.error("Worker error:", e);
    };
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
            arranger: { progression: arranger.progression, stepMap: arranger.stepMap, totalSteps: arranger.totalSteps },
            cb: { style: cb.style, octave: cb.octave, density: cb.density, enabled: cb.enabled },
            bb: { style: bb.style, octave: bb.octave, enabled: bb.enabled, lastFreq: bb.lastFreq },
            sb: { style: sb.style, octave: sb.octave, enabled: sb.enabled, lastFreq: sb.lastFreq },
            ctx: { bpm: ctx.bpm }
        }
    });
}
