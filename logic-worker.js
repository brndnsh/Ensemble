import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { arranger, cb, bb, sb, ctx } from './state.js';

let timerID = null;
let interval = 25;

// Internal buffer heads to track generation progress
let bbBufferHead = 0;
let sbBufferHead = 0;
const LOOKAHEAD = 32;

let pendingBassEvent = null;

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

    // Use a single loop to synchronize generation across instruments
    let head = Math.min(bbBufferHead, sbBufferHead);

    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step);
        
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(step + 4);

            // 1. Bass Generation (if this step hasn't been processed for bass yet)
            if (bb.enabled && step >= bbBufferHead) {
                if (isBassActive(bb.style, step, stepInChord)) {
                    const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / 4, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, step, stepInChord, arranger.isMinor);
                    if (bassResult) {
                        bb.lastFreq = typeof bassResult === 'object' ? bassResult.freq : bassResult;
                        const newNote = { ...bassResult, step, module: 'bb' };
                        
                        // Monophony enforcement: If we have a pending note, emit it now, 
                        // effectively truncating its duration to the start of this new note.
                        if (pendingBassEvent) {
                            const gap = step - pendingBassEvent.step;
                            // Ensure we don't accidentally extend a short note (like a staccato 16th),
                            // but definitely shorten a long one if it overlaps.
                            const currentDur = pendingBassEvent.durationMultiplier || 4; 
                            if (gap < currentDur) {
                                pendingBassEvent.durationMultiplier = gap;
                            }
                            notesToMain.push(pendingBassEvent);
                        }
                        pendingBassEvent = newNote;
                    }
                }
                bbBufferHead++;
            }

            // 2. Soloist Generation (if this step hasn't been processed for soloist yet)
            if (sb.enabled && step >= sbBufferHead) {
                // Pass the current bass note for interval safety checks
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

    // If the pending note is very old (e.g. > 3 measures passed), emit it.
    // We hold it this long to ensure we can truncate it if a new note appears 
    // in the next batch. 48 steps = 3 bars.
    if (pendingBassEvent && head - pendingBassEvent.step > 48) {
        notesToMain.push(pendingBassEvent);
        pendingBassEvent = null;
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
                pendingBassEvent = null;
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