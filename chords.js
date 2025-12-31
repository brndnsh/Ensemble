import { KEY_ORDER, ROMAN_VALS, NNS_OFFSETS, INTERVAL_TO_NNS, INTERVAL_TO_ROMAN } from './config.js';
import { normalizeKey, getFrequency, formatChordName } from './utils.js';
import { cb } from './state.js';
import { ui } from './ui.js';

const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

/**
 * Extracts quality and 7th status from a chord symbol string.
 * @param {string} symbol 
 * @returns {{quality: string, is7th: boolean, suffix: string}}
 */
export function getChordDetails(symbol) {
    let quality = 'major', is7th = symbol.includes('7');
    const suffixMatch = symbol.match(/(maj7|maj|M7|min|m7b5|m|dim|o7|o|aug|\+|-|ø|h7)/);
    const suffix = suffixMatch ? suffixMatch[1] : "";

    if (suffix.includes('maj') || suffix === 'M7') quality = 'maj7';
    else if (suffix === 'm7b5' || suffix === 'ø' || suffix === 'h7') quality = 'halfdim';
    else if (suffix.includes('min') || suffix === 'm' || suffix === '-') quality = 'minor';
    else if (suffix === 'o7' || (suffix === 'o' && is7th) || suffix === 'dim7') { quality = 'dim'; is7th = true; }
    else if (suffix === 'o' || suffix === 'dim') quality = 'dim';
    else if (suffix.includes('aug') || suffix === '+') quality = 'aug';

    return { quality, is7th, suffix };
}

/**
 * Calculates the best inversion for a chord to maintain smooth voice leading.
 * @param {number} rootMidi 
 * @param {number[]} intervals 
 * @param {number[]} previousMidis 
 * @returns {number[]}
 */
export function getBestInversion(rootMidi, intervals, previousMidis) {
    const targetCenter = previousMidis && previousMidis.length > 0 
        ? previousMidis.reduce((a, b) => a + b, 0) / previousMidis.length 
        : cb.octave;

    return intervals.map(inter => {
        let note = rootMidi + inter;
        let pc = note % 12;
        let octaves = [-24, -12, 0, 12, 24];
        let candidates = octaves.map(o => (Math.floor(targetCenter / 12) * 12) + o + pc);
        candidates.sort((a, b) => Math.abs(a - targetCenter) - Math.abs(b - targetCenter));
        return candidates[0];
    }).sort((a, b) => a - b);
}

/**
 * Parses the progression input string and updates the chord state.
 * @param {Function} renderCallback - Callback to trigger visual update.
 */
export function validateProgression(renderCallback) {
    const input = ui.progInput.value;
    const key = ui.keySelect.value;
    const parsed = [];
    const baseOctave = Math.floor(cb.octave / 12) * 12;
    const bars = input.split(/\|/).map(s => s.trim()).filter(s => s);
    if (bars.length === 0 && input.trim()) bars.push(input.trim());
    
    let lastMidis = [];

    bars.forEach(barText => {
        const chords = barText.split(/\s+/).filter(s => s);
        if (chords.length === 0) return;
        const beatsPerChord = 4 / chords.length;
        
        chords.forEach(part => {
            const romanMatch = part.match(ROMAN_REGEX);
            const nnsMatch = part.match(NNS_REGEX);
            const noteMatch = part.match(NOTE_REGEX);
            
            let rootPart = "";
            if (romanMatch) rootPart = romanMatch[0];
            else if (nnsMatch) rootPart = nnsMatch[0];
            else if (noteMatch) rootPart = noteMatch[0];

            const suffixPart = part.slice(rootPart.length);
            let { quality, is7th } = getChordDetails(suffixPart);
            
            const keyRootMidi = baseOctave + KEY_ORDER.indexOf(normalizeKey(key));
            let rootMidi;
            let rootName = "";

            if (romanMatch) {
                const accidental = romanMatch[1] || "", numeral = romanMatch[2];
                let rootOffset = ROMAN_VALS[numeral.toUpperCase()];
                if (accidental === 'b') rootOffset -= 1;
                if (accidental === '#') rootOffset += 1;
                rootMidi = keyRootMidi + rootOffset;
                if (numeral === numeral.toLowerCase() && quality === 'major') quality = 'minor';
                if (numeral.toLowerCase() === 'vii' && !suffixPart.match(/(maj|min|m|dim|o|aug|\+)/)) quality = 'dim';
            } else if (nnsMatch) {
                const accidental = nnsMatch[1] || "", number = parseInt(nnsMatch[2]);
                let rootOffset = NNS_OFFSETS[number - 1];
                if (accidental === 'b') rootOffset -= 1;
                if (accidental === '#') rootOffset += 1;
                rootMidi = keyRootMidi + rootOffset;
            } else if (noteMatch) {
                const note = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
                rootMidi = baseOctave + KEY_ORDER.indexOf(note);
            } else {
                rootMidi = keyRootMidi; // Default to key root
            }

            let intervals = [0, 4, 7];
            const isMinor = quality === 'minor' || quality === 'dim' || quality === 'halfdim';
            if (quality === 'minor') intervals = [0, 3, 7];
            else if (quality === 'dim') intervals = [0, 3, 6];
            else if (quality === 'halfdim') intervals = [0, 3, 6];
            else if (quality === 'aug') intervals = [0, 4, 8];

            if (is7th || quality === 'halfdim') {
                if (quality === 'maj7') intervals.push(11);
                else if (quality === 'dim') intervals.push(9); 
                else if (quality === 'halfdim') intervals.push(10);
                else intervals.push(10); 
            }

            const currentMidis = getBestInversion(rootMidi, intervals, lastMidis);
            lastMidis = currentMidis;

            const interval = (rootMidi - keyRootMidi + 24) % 12;
            const rootNNS = INTERVAL_TO_NNS[interval];
            const rootRomanBase = INTERVAL_TO_ROMAN[interval];
            rootName = KEY_ORDER[rootMidi % 12];
            
            let absSuffix = "", nnsSuffix = "", romSuffix = "";
            if (quality === 'minor') { absSuffix = 'm'; nnsSuffix = '-'; }
            else if (quality === 'dim') { absSuffix = 'dim'; nnsSuffix = '°'; romSuffix = '°'; }
            else if (quality === 'halfdim') { absSuffix = 'm7b5'; nnsSuffix = 'ø'; romSuffix = 'ø'; }
            else if (quality === 'aug') { absSuffix = 'aug'; nnsSuffix = '+'; romSuffix = '+'; }
            else if (quality === 'maj7') { absSuffix = 'maj7'; nnsSuffix = 'maj7'; romSuffix = 'maj7'; }
            
            if (is7th && quality !== 'maj7' && quality !== 'halfdim') { 
                absSuffix += '7'; 
                nnsSuffix += '7'; 
                romSuffix += '7';
            }

            let romanName;
            if (quality === 'minor' || quality === 'dim' || quality === 'halfdim') {
                romanName = formatChordName(rootRomanBase.toLowerCase(), romSuffix);
            } else {
                romanName = formatChordName(rootRomanBase, romSuffix);
            }

            parsed.push({ 
                romanName: romanName, 
                absName: formatChordName(rootName, absSuffix),
                nnsName: formatChordName(rootNNS, nnsSuffix),
                isMinor: isMinor,
                beats: beatsPerChord, 
                freqs: currentMidis.map(getFrequency) 
            });
        });
    });
    cb.progression = parsed;
    if (renderCallback) renderCallback();
}
