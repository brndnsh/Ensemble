import { arranger, cb, bb, sb, hb, gb, ctx } from './state.js';

let timerWorker = null;
let schedulerRequestHandler = null;
let notesReceivedHandler = null;

export const getTimerWorker = () => timerWorker;

export function initWorker(onSchedulerRequest, onNotesReceived) {
    if (timerWorker) {
        schedulerRequestHandler = onSchedulerRequest;
        notesReceivedHandler = onNotesReceived;
        return;
    }
    
    schedulerRequestHandler = onSchedulerRequest;
    notesReceivedHandler = onNotesReceived;
    
    // In production, WORKER_PATH is injected by esbuild --define
    const workerPath = typeof WORKER_PATH !== 'undefined' ? WORKER_PATH : 'logic-worker.js';
    timerWorker = new Worker(workerPath, { type: 'module' });

    timerWorker.onmessage = (e) => {
        const { type, notes, data, timestamp } = e.data;
        if (type === 'tick') {
            if (typeof schedulerRequestHandler === 'function') schedulerRequestHandler();
        } else if (type === 'notes') {
            if (typeof notesReceivedHandler === 'function') notesReceivedHandler(notes, timestamp);
        } else if (type === 'error') {
            console.error("[Worker Error]", data);
        } else if (type === 'exportComplete') {
            const { blob, filename } = e.data;
            const url = URL.createObjectURL(new Blob([blob], { type: 'audio/midi' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
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

export function flushWorker(step, syncData = null, primeSteps = 0) {
    if (timerWorker) timerWorker.postMessage({ type: 'flush', data: { step, syncData, primeSteps, timestamp: performance.now() } });
}

export function requestBuffer(step) {
    if (timerWorker) timerWorker.postMessage({ type: 'requestBuffer', data: { step, timestamp: performance.now() } });
}

export function requestResolution(step) {
    if (timerWorker) timerWorker.postMessage({ type: 'resolution', data: { step, timestamp: performance.now() } });
}

export function primeWorker(steps = 32) {
    if (timerWorker) timerWorker.postMessage({ type: 'prime', data: steps });
}

export function syncWorker(action, payload) {
    if (!timerWorker) return;

    let data = {};

    if (!action) {
        // Full Sync
        data = {
            arranger: { 
                progression: arranger.progression, 
                stepMap: arranger.stepMap, 
                sectionMap: arranger.sectionMap,
                totalSteps: arranger.totalSteps,
                key: arranger.key,
                isMinor: arranger.isMinor,
                timeSignature: arranger.timeSignature,
                grouping: arranger.grouping
            },
            cb: { style: cb.style, octave: cb.octave, density: cb.density, enabled: cb.enabled, volume: cb.volume },
            bb: { style: bb.style, octave: bb.octave, enabled: bb.enabled, lastFreq: bb.lastFreq, volume: bb.volume },
            sb: { style: sb.style, octave: sb.octave, enabled: sb.enabled, lastFreq: sb.lastFreq, volume: sb.volume, doubleStops: sb.doubleStops, sessionSteps: sb.sessionSteps },
            hb: { style: hb.style, octave: hb.octave, enabled: hb.enabled, volume: hb.volume, complexity: hb.complexity },
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
        };
    } else {
        // Delta Sync
        switch (action) {
            case 'SET_BAND_INTENSITY': data.ctx = { bandIntensity: ctx.bandIntensity }; break;
            case 'SET_COMPLEXITY': data.ctx = { complexity: ctx.complexity }; data.hb = { complexity: hb.complexity }; break;
            case 'SET_AUTO_INTENSITY': data.ctx = { autoIntensity: ctx.autoIntensity }; break;
            case 'UPDATE_HB':
                data.hb = payload;
                break;
            case 'SET_PARAM': 
                if (payload.module) {
                    data[payload.module] = { [payload.param]: payload.value };
                }
                break;
            case 'UPDATE_CONDUCTOR_DECISION':
                data.cb = { density: cb.density };
                data.sb = { hookRetentionProb: sb.hookRetentionProb };
                data.ctx = { conductorVelocity: ctx.conductorVelocity, intent: ctx.intent };
                break;
            case 'SET_STYLE':
                if (payload.module) data[payload.module] = { style: payload.style };
                break;
            case 'SET_VOLUME':
                if (payload.module) data[payload.module] = { volume: payload.value };
                break;
            case 'SET_OCTAVE':
                if (payload.module) data[payload.module] = { octave: payload.value };
                break;
            case 'SET_GENRE_FEEL':
                data.gb = { 
                    genreFeel: gb.genreFeel, 
                    swing: gb.swing, 
                    swingSub: gb.swingSub 
                };
                break;
            case 'SET_SWING': data.gb = { swing: payload }; break;
            case 'SET_SWING_SUB': data.gb = { swingSub: payload }; break;
            case 'SET_SESSION_STEPS': data.sb = { sessionSteps: payload }; break;
            case 'SET_DOUBLE_STOPS': data.sb = { doubleStops: payload }; break;
            case 'SET_BPM': data.ctx = { bpm: ctx.bpm }; break;
            case 'ARRANGER_UPDATE': // Custom action for large structural changes
                data.arranger = {
                    progression: arranger.progression,
                    stepMap: arranger.stepMap,
                    sectionMap: arranger.sectionMap,
                    totalSteps: arranger.totalSteps,
                    key: arranger.key,
                    isMinor: arranger.isMinor,
                    timeSignature: arranger.timeSignature
                };
                break;
        }
    }

    if (Object.keys(data).length > 0) {
        timerWorker.postMessage({ type: 'syncState', data });
    }
}
