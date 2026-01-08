import { getBassNote } from './bass.js';
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

    // Sync buffer heads to main step if they fall behind
    if (bbBufferHead < currentStep) bbBufferHead = currentStep;
    if (sbBufferHead < currentStep) sbBufferHead = currentStep;

    // Bass Generation
    if (bb.enabled) {
        while (bbBufferHead < targetStep) {
            const step = bbBufferHead;
            const chordData = getChordAtStep(step);
            let result = null;

            if (chordData) {
                const { chord, stepInChord } = chordData;
                let shouldPlay = false;
                if (bb.style === 'whole' && stepInChord === 0) shouldPlay = true;
                else if (bb.style === 'half' && stepInChord % 8 === 0) shouldPlay = true;
                else if (bb.style === 'arp' && stepInChord % 4 === 0) shouldPlay = true;
                else if (bb.style === 'bossa' && [0, 6, 8, 14].includes(step % 16)) shouldPlay = true;
                else if (bb.style === 'quarter') {
                    if (stepInChord % 4 === 0) shouldPlay = true;
                    else if (stepInChord % 2 === 0 && Math.random() < 0.15) shouldPlay = true;
                }
                else if (bb.style === 'funk') {
                    const stepInBeat = stepInChord % 4;
                    if (stepInChord === 0) shouldPlay = true;
                    else if (stepInChord % 4 === 0 && Math.random() < 0.7) shouldPlay = true;
                    else if (stepInBeat === 2 && Math.random() < 0.4) shouldPlay = true;
                    else if (stepInBeat === 3 && Math.random() < 0.2) shouldPlay = true;
                }
                else if (bb.style === 'neo') {
                    if (stepInChord === 0) shouldPlay = true;
                    else if (stepInChord % 8 === 0 && Math.random() < 0.5) shouldPlay = true;
                    else if (step % 4 === 3 && Math.random() < 0.2) shouldPlay = true;
                }

                if (shouldPlay) {
                    const nextChordData = getChordAtStep(step + 4);
                    const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / 4, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, step, stepInChord);
                    if (bassResult) {
                        const freq = typeof bassResult === 'object' ? bassResult.freq : bassResult;
                        if (freq) {
                            bb.lastFreq = freq;
                            result = { ...bassResult, step, module: 'bb' };
                            notesToMain.push(result);
                        }
                    }
                }
            }
            bbBufferHead++;
        }
    }

    // Soloist Generation
    if (sb.enabled) {
        while (sbBufferHead < targetStep) {
            const step = sbBufferHead;
            const chordData = getChordAtStep(step);
            
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4);
                const soloResult = getSoloistNote(chord, nextChordData?.chord, step, sb.lastFreq, sb.octave, sb.style, stepInChord);
                
                if (soloResult?.freq) {
                    sb.lastFreq = soloResult.freq;
                    notesToMain.push({ ...soloResult, step, module: 'sb' });
                }
            }
            sbBufferHead++;
        }
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
                // Update local state objects for generation
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
                // Reset soloist stateful tracking in the worker
                sb.phraseSteps = 0;
                sb.isResting = false; 
                sb.busySteps = 0;
                sb.currentLick = null;
                sb.sequenceType = null;
                sb.motifCell = null;
                sb.motifCounter = 0;
                sb.enclosureNotes = null;
                sb.enclosureIndex = 0;
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