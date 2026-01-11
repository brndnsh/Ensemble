import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { arranger, cb, bb, sb, ctx } from './state.js';

let timerID = null;
let interval = 25;

// Internal buffer heads to track generation progress
let bbBufferHead = 0;
let sbBufferHead = 0;
const LOOKAHEAD = 32;

/**
 * Finds the active chord for a given global step using the worker's local state.
 */
function getChordAtStep(step) {
    if (arranger.totalSteps === 0) return null;
    const targetStep = step % arranger.totalSteps;
    for (let i = 0; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            return { 
                chord: entry.chord, 
                stepInChord: targetStep - entry.start, 
                chordIndex: i 
            };
        }
    }
    return null;
}

/**
 * Generates a batch of notes for the bass and soloist modules.
 */
function fillBuffers(currentStep) {
    const targetStep = currentStep + LOOKAHEAD;
    const notesToMain = [];

    // Sync buffer heads if they fall behind the playback head
    if (bbBufferHead < currentStep) bbBufferHead = currentStep;
    if (sbBufferHead < currentStep) sbBufferHead = currentStep;

    let head = Math.min(bbBufferHead, sbBufferHead);

    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step);
        
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(step + 4);

            // 1. Bass Generation
            if (bb.enabled && step >= bbBufferHead) {
                if (isBassActive(bb.style, step, stepInChord)) {
                    const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / 4, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, step, stepInChord, arranger.isMinor);
                    if (bassResult) {
                        bb.lastFreq = typeof bassResult === 'object' ? bassResult.freq : bassResult;
                        // Emit immediately to prevent scheduling latency
                        notesToMain.push({ ...bassResult, step, module: 'bb' });
                    }
                }
                bbBufferHead++;
            }

            // 2. Soloist Generation
            if (sb.enabled && step >= sbBufferHead) {
                const soloResult = getSoloistNote(chord, nextChordData?.chord, step, sb.lastFreq, sb.octave, sb.style, stepInChord, bb.lastFreq);
                if (soloResult?.freq) {
                    sb.lastFreq = soloResult.freq;
                    notesToMain.push({ ...soloResult, step, module: 'sb' });
                }
                sbBufferHead++;
            }
        }
        head++;
    }

    if (notesToMain.length > 0) {
        postMessage({ type: 'notes', notes: notesToMain });
    }
}

let lastMainStep = 0;

self.onmessage = (e) => {
    try {
        const { type, data } = e.data;

        switch (type) {
            case 'start':
                if (!timerID) {
                    timerID = setInterval(() => {
                        fillBuffers(lastMainStep);
                        postMessage({ type: 'tick' });
                    }, interval);
                }
                break;
            case 'stop':
                if (timerID) {
                    clearInterval(timerID);
                    timerID = null;
                }
                break;
            case 'interval':
                interval = data;
                if (timerID) {
                    clearInterval(timerID);
                    timerID = setInterval(() => {
                        fillBuffers(lastMainStep);
                        postMessage({ type: 'tick' });
                    }, interval);
                }
                break;
            case 'syncState':
                if (data.arranger) {
                    Object.assign(arranger, data.arranger);
                    arranger.totalSteps = data.arranger.totalSteps;
                    arranger.stepMap = data.arranger.stepMap;
                }
                if (data.cb) Object.assign(cb, data.cb);
                if (data.bb) Object.assign(bb, data.bb);
                if (data.sb) Object.assign(sb, data.sb);
                if (data.ctx) Object.assign(ctx, data.ctx);
                fillBuffers(lastMainStep);
                break;
            case 'flush':
                bbBufferHead = data.step;
                sbBufferHead = data.step;
                lastMainStep = data.step;
                sb.phraseSteps = 0;
                sb.isResting = false; 
                sb.busySteps = 0;
                sb.currentPhraseSteps = 0;
                sb.motifBuffer = [];
                sb.hookBuffer = [];
                sb.isReplayingMotif = false;
                sb.motifReplayIndex = 0;
                sb.tension = 0;
                fillBuffers(data.step);
                break;
            case 'requestBuffer':
                lastMainStep = data.step;
                fillBuffers(data.step);
                break;
        }
    } catch (err) {
        postMessage({ type: 'error', data: err.message, stack: err.stack });
    }
};