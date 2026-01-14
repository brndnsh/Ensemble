import { ENHARMONIC_MAP } from './config.js';

/**
 * Normalizes a note name (e.g., C# to Db) based on the project's map.
 * @param {string} k - The note name to normalize.
 * @returns {string} The normalized note name.
 */
export function normalizeKey(k) { 
    return ENHARMONIC_MAP[k] || k; 
}

/**
 * Converts a MIDI note number to a frequency in Hertz.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
export function getFrequency(midi) { 
    return 440 * Math.pow(2, (midi - 69) / 12); 
}

/**
 * Converts a MIDI note number to an object containing its note name and octave.
 * @param {number} midi - The MIDI note number.
 * @returns {{name: string, octave: number}}
 */
export function midiToNote(midi) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return {
        name: notes[midi % 12],
        octave: Math.floor(midi / 12) - 1
    };
}

/**
 * Converts a frequency in Hertz to a MIDI note number.
 * @param {number} freq - The frequency in Hz.
 * @returns {number} The MIDI note number.
 */
export function getMidi(freq) {
    if (!freq || freq <= 0) return null;
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Generates a unique ID for sections.
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Compresses the sections array into a Base64 string, handling Unicode.
 * @param {Array} sections 
 * @returns {string}
 */
export function compressSections(sections) {
    const minified = sections.map(s => ({ l: s.label, v: s.value }));
    const json = JSON.stringify(minified);
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binString);
}

/**
 * Decompresses the Base64 string back into sections, handling Unicode.
 * @param {string} str 
 * @returns {Array}
 */
export function decompressSections(str) {
    try {
        const binString = atob(str);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
        const json = new TextDecoder().decode(bytes);
        const minified = JSON.parse(json);
        return minified.map((s, i) => ({ 
            id: generateId(), 
            label: s.l || `Section ${i+1}`, 
            value: s.v || '' 
        }));
    } catch (e) {
        console.error("Failed to decompress sections", e);
        return [{ id: generateId(), label: 'Intro', value: 'I | IV' }];
    }
}

/**
 * Calculates the number of 16th-note (or equivalent) steps per measure for a given time signature.
 * @param {string} ts - Time signature (e.g. "4/4", "3/4", "6/8").
 * @returns {number}
 */
export function getStepsPerMeasure(ts) {
    if (ts === '2/4') return 8;
    if (ts === '3/4') return 12;
    if (ts === '6/8') return 12;
    if (ts === '7/8') return 14;
    if (ts === '5/4') return 20;
    if (ts === '7/4') return 28;
    if (ts === '12/8') return 24;
    return 16;
}

/**
 * Returns detailed structural information about a specific step in a measure.
 * @param {number} step - The global or measure-relative step.
 * @param {Object} tsConfig - The time signature configuration from config.js.
 * @returns {Object} { isMeasureStart, isGroupStart, isBeatStart, groupIndex, beatInGroup }
 */
export function getStepInfo(step, tsConfig) {
    const spm = getStepsPerMeasure(`${tsConfig.beats}/${tsConfig.stepsPerBeat === 4 ? 4 : 8}`);
    const mStep = step % spm;
    const isMeasureStart = mStep === 0;
    
    const grouping = tsConfig.grouping || [tsConfig.beats];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    
    let accumulatedSteps = 0;
    let isGroupStart = false;
    let groupIndex = -1;
    let stepInGroup = -1;

    for (let i = 0; i < grouping.length; i++) {
        const groupBeats = grouping[i];
        const groupSteps = groupBeats * stepsPerBeat;
        
        if (mStep >= accumulatedSteps && mStep < accumulatedSteps + groupSteps) {
            groupIndex = i;
            stepInGroup = mStep - accumulatedSteps;
            if (stepInGroup === 0) isGroupStart = true;
            break;
        }
        accumulatedSteps += groupSteps;
    }

    const isBeatStart = (mStep % stepsPerBeat === 0);
    const beatIndex = Math.floor(mStep / stepsPerBeat);

    return {
        isMeasureStart,
        isGroupStart,
        isBeatStart,
        groupIndex,
        stepInGroup,
        beatIndex,
        mStep
    };
}