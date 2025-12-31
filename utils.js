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
 * Formats a chord name with its suffix in a small superscript-like span.
 * @param {string} root - The root note or numeral.
 * @param {string} suffix - The chord suffix (e.g., maj7).
 * @returns {string} HTML string of the formatted chord name.
 */
export function formatChordName(root, suffix) { 
    return suffix ? `${root}<span class="suffix">${suffix}</span>` : root; 
}
