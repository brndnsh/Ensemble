import { arranger, chords, bass, soloist, harmony, groove, playback } from './state.js';

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
            chords: { style: chords.style, octave: chords.octave, density: chords.density, enabled: chords.enabled, volume: chords.volume },
            bass: { style: bass.style, octave: bass.octave, enabled: bass.enabled, lastFreq: bass.lastFreq, volume: bass.volume },
            soloist: { style: soloist.style, octave: soloist.octave, enabled: soloist.enabled, lastFreq: soloist.lastFreq, volume: soloist.volume, doubleStops: soloist.doubleStops, sessionSteps: soloist.sessionSteps },
            harmony: { style: harmony.style, octave: harmony.octave, enabled: harmony.enabled, volume: harmony.volume, complexity: harmony.complexity, pocketOffset: harmony.pocketOffset },
            groove: { 
                genreFeel: groove.genreFeel, 
                lastDrumPreset: groove.lastDrumPreset, 
                enabled: groove.enabled, 
                volume: groove.volume,
                measures: groove.measures,
                swing: groove.swing,
                swingSub: groove.swingSub,
                instruments: groove.instruments.map(i => ({ name: i.name, steps: [...i.steps], muted: i.muted }))
            },
            playback: { bpm: playback.bpm, bandIntensity: playback.bandIntensity, complexity: playback.complexity, autoIntensity: playback.autoIntensity }
        };
    } else {
        // Delta Sync
        switch (action) {
            case 'SET_BAND_INTENSITY': data.playback = { bandIntensity: playback.bandIntensity }; break;
            case 'SET_COMPLEXITY': data.playback = { complexity: playback.complexity }; data.harmony = { complexity: harmony.complexity }; break;
            case 'SET_AUTO_INTENSITY': data.playback = { autoIntensity: playback.autoIntensity }; break;
            case 'UPDATE_HB':
                data.harmony = payload;
                break;
            case 'SET_PARAM': 
                if (payload.module) {
                    data[payload.module] = { [payload.param]: payload.value };
                }
                break;
            case 'UPDATE_CONDUCTOR_DECISION':
                data.chords = { density: chords.density };
                data.soloist = { hookRetentionProb: soloist.hookRetentionProb };
                data.playback = { conductorVelocity: playback.conductorVelocity, intent: playback.intent };
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
                data.groove = { 
                    genreFeel: groove.genreFeel, 
                    swing: groove.swing, 
                    swingSub: groove.swingSub 
                };
                break;
            case 'SET_SWING': data.groove = { swing: payload }; break;
            case 'SET_SWING_SUB': data.groove = { swingSub: payload }; break;
            case 'SET_SESSION_STEPS': data.soloist = { sessionSteps: payload }; break;
            case 'SET_DOUBLE_STOPS': data.soloist = { doubleStops: payload }; break;
            case 'SET_BPM': data.playback = { bpm: playback.bpm }; break;
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
