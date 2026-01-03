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
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Formats a chord name with its suffix in a small superscript-like span.
 * @param {string} root - The root note or numeral.
 * @param {string} suffix - The chord suffix (e.g., maj7).
 * @returns {string} HTML string of the formatted chord name.
 */
export function formatChordName(root, suffix) { 
    return suffix ? `${root}<span class="suffix">${suffix}</span>` : root; 
}
