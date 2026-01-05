import { KEY_ORDER, ROMAN_VALS, NNS_OFFSETS, INTERVAL_TO_NNS, INTERVAL_TO_ROMAN } from './config.js';
import { normalizeKey, getFrequency } from './utils.js';
import { cb } from './state.js';
import { ui } from './ui.js';
import { updateProgressionCache } from './main.js';

const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

/**
 * Extracts quality and 7th status from a chord symbol string.
 * @param {string} symbol 
 * @returns {{quality: string, is7th: boolean, suffix: string}}
 */
export function getChordDetails(symbol) {
    let quality = 'major', is7th = symbol.includes('7') || symbol.includes('9');
    const suffixMatch = symbol.match(/(maj7|maj9|maj|M7|m9|m7b5|m7|m6|min|m|dim|o7|o|aug|\+|-|ø|h7|sus4|sus2|add9|7b9|7#9|7|9|6|5)/);
    const suffix = suffixMatch ? suffixMatch[1] : "";

    if (suffix === 'maj9') quality = 'maj9';
    else if (suffix.includes('maj') || suffix === 'M7') quality = 'maj7';
    else if (suffix === 'm9') quality = 'm9';
    else if (suffix === 'm7b5' || suffix === 'ø' || suffix === 'h7') quality = 'halfdim';
    else if (suffix === 'm6') quality = 'm6';
    else if (suffix.includes('min') || suffix === 'm' || suffix === '-') quality = 'minor';
    else if (suffix === 'o7' || (suffix === 'o' && is7th) || suffix === 'dim7') { quality = 'dim'; is7th = true; }
    else if (suffix === 'o' || suffix === 'dim') quality = 'dim';
    else if (suffix.includes('aug') || suffix === '+') quality = 'aug';
    else if (suffix === 'sus4') quality = 'sus4';
    else if (suffix === 'sus2') quality = 'sus2';
    else if (suffix === 'add9') quality = 'add9';
    else if (suffix === '7b9') quality = '7b9';
    else if (suffix === '7#9') quality = '7#9';
    else if (suffix === '9') quality = '9';
    else if (suffix === '6') quality = '6';
    else if (suffix === '5') quality = '5';

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
 * Generates a musically coherent random progression.
 * @returns {string} The generated progression string.
 */
export function generateRandomProgression() {
    const tonics = ['I', 'I', 'Imaj7', 'vi', 'vi7'];
    const subdominants = ['IV', 'ii', 'ii7', 'IVmaj7'];
    const dominants = ['V', 'V7', 'viiø7'];
    const flavor = ['bVII', 'bVI', 'III7', 'VI7'];

    const getRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    
    const generate4Bars = (isFinal = true) => {
        let p = [];
        p.push(getRand(tonics)); // Tonic start
        
        // Slot 2: Any diatonic or flavor
        p.push(getRand([...tonics, ...subdominants, flavor[0], flavor[1]]));
        
        // Slot 3: Subdominant or Dominant
        p.push(getRand([...subdominants, ...dominants, flavor[2]]));
        
        // Slot 4: Cadence
        if (isFinal) {
            p.push(Math.random() > 0.3 ? getRand(dominants) : getRand(['IV', 'iv', 'bVII']));
        } else {
            // Half cadence or deceptive
            p.push(Math.random() > 0.5 ? getRand(dominants) : getRand(['vi', 'vi7', 'IV']));
        }
        return p;
    };

    const length = Math.random() > 0.5 ? 8 : 4;
    let progression = [];

    if (length === 4) {
        progression = generate4Bars(true);
    } else {
        // 8 bars: usually two 4-bar phrases
        const phrase1 = generate4Bars(false);
        const phrase2 = generate4Bars(true);
        
        // 40% chance to make them related (AA' form)
        if (Math.random() < 0.4) {
            phrase2[0] = phrase1[0];
            phrase2[1] = phrase1[1];
        }
        
        progression = [...phrase1, ...phrase2];
    }

    return progression.join(' | ');
}

export function resolveChordRoot(part, keyRootMidi, baseOctave) {
    const romanMatch = part.match(ROMAN_REGEX);
    const nnsMatch = part.match(NNS_REGEX);
    const noteMatch = part.match(NOTE_REGEX);
    
    let rootMidi = keyRootMidi; 
    let rootPart = "";

    if (romanMatch) {
        rootPart = romanMatch[0];
        const accidental = romanMatch[1] || "", numeral = romanMatch[2];
        let rootOffset = ROMAN_VALS[numeral.toUpperCase()];
        if (accidental === 'b') rootOffset -= 1;
        if (accidental === '#') rootOffset += 1;
        rootMidi = keyRootMidi + rootOffset;
    } else if (nnsMatch) {
        rootPart = nnsMatch[0];
        const accidental = nnsMatch[1] || "", number = parseInt(nnsMatch[2]);
        let rootOffset = NNS_OFFSETS[number - 1];
        if (accidental === 'b') rootOffset -= 1;
        if (accidental === '#') rootOffset += 1;
        rootMidi = keyRootMidi + rootOffset;
    } else if (noteMatch) {
        rootPart = noteMatch[0];
        const note = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
        rootMidi = baseOctave + KEY_ORDER.indexOf(note);
    }

    return { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch };
}

export function getIntervals(quality, is7th, density) {
    let intervals = [0, 4, 7];
    if (quality === 'minor') intervals = [0, 3, 7];
    else if (quality === 'dim') intervals = [0, 3, 6];
    else if (quality === 'halfdim') intervals = [0, 3, 6];
    else if (quality === 'aug') intervals = [0, 4, 8];
    else if (quality === 'sus4') intervals = [0, 5, 7];
    else if (quality === 'sus2') intervals = [0, 2, 7];
    else if (quality === 'add9') intervals = [0, 4, 7, 14];
    else if (quality === '6') intervals = [0, 4, 7, 9];
    else if (quality === 'm6') intervals = [0, 3, 7, 9];
    else if (quality === '9') intervals = [0, 4, 7, 10, 14];
    else if (quality === 'maj9') intervals = [0, 4, 7, 11, 14];
    else if (quality === 'm9') intervals = [0, 3, 7, 10, 14];
    else if (quality === '7b9') intervals = [0, 4, 7, 10, 13];
    else if (quality === '7#9') intervals = [0, 4, 7, 10, 15];
    else if (quality === '5') intervals = [0, 7];

    if (is7th || quality === 'halfdim') {
        if (quality === 'maj7' || quality === 'maj9') intervals.push(11);
        else if (quality === 'dim') intervals.push(9); 
        else if (quality === 'halfdim') intervals.push(10);
        else intervals.push(10); 
    }

    // Apply Voicing Density
    if (density === 'thin' && intervals.length >= 4) {
        if (intervals.includes(7)) intervals = intervals.filter(i => i !== 7);
    } else if (density === 'rich' && intervals.length <= 4 && quality !== '5') {
        if (!intervals.includes(14) && !intervals.includes(13) && !intervals.includes(15) && quality !== 'sus2') {
            intervals.push(14);
        }
        if (is7th && quality === 'major' && !intervals.includes(21)) {
            intervals.push(21);
        }
    }
    return intervals;
}

export function getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th) {
    let absSuffix = "", nnsSuffix = "", romSuffix = "";
    if (quality === 'minor') { absSuffix = 'm'; nnsSuffix = '-'; }
    else if (quality === 'dim') { absSuffix = 'dim'; nnsSuffix = '°'; romSuffix = '°'; }
    else if (quality === 'halfdim') { absSuffix = 'm7b5'; nnsSuffix = 'ø'; romSuffix = 'ø'; }
    else if (quality === 'aug') { absSuffix = 'aug'; nnsSuffix = '+'; romSuffix = '+'; }
    else if (quality === 'maj7') { absSuffix = 'maj7'; nnsSuffix = 'maj7'; romSuffix = 'maj7'; }
    else if (quality === 'maj9') { absSuffix = 'maj9'; nnsSuffix = 'maj9'; romSuffix = 'maj9'; }
    else if (quality === 'm9') { absSuffix = 'm9'; nnsSuffix = '-9'; romSuffix = '9'; }
    else if (quality === 'sus4') { absSuffix = 'sus4'; nnsSuffix = 'sus4'; romSuffix = 'sus4'; }
    else if (quality === 'sus2') { absSuffix = 'sus2'; nnsSuffix = 'sus2'; romSuffix = 'sus2'; }
    else if (quality === 'add9') { absSuffix = 'add9'; nnsSuffix = 'add9'; romSuffix = 'add9'; }
    else if (quality === '6') { absSuffix = '6'; nnsSuffix = '6'; romSuffix = '6'; }
    else if (quality === 'm6') { absSuffix = 'm6'; nnsSuffix = '-6'; romSuffix = '6'; }
    else if (quality === '9') { absSuffix = '9'; nnsSuffix = '9'; romSuffix = '9'; }
    else if (quality === '7b9') { absSuffix = '7b9'; nnsSuffix = '7b9'; romSuffix = '7b9'; }
    else if (quality === '7#9') { absSuffix = '7#9'; nnsSuffix = '7#9'; romSuffix = '7#9'; }
    else if (quality === '5') { absSuffix = '5'; nnsSuffix = '5'; romSuffix = '5'; }
    
    if (is7th && !['maj7', 'maj9', 'halfdim', '7b9', '7#9', '9'].includes(quality)) { 
        absSuffix += '7'; nnsSuffix += '7'; romSuffix += '7';
    }

    let romanName;
    if (quality === 'minor' || quality === 'dim' || quality === 'halfdim') {
        romanName = rootRomanBase.toLowerCase();
    } else {
        romanName = rootRomanBase;
    }

    return {
        abs: { root: rootName, suffix: absSuffix },
        nns: { root: rootNNS, suffix: nnsSuffix },
        rom: { root: romanName, suffix: romSuffix }
    };
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
    const keyRootMidi = baseOctave + KEY_ORDER.indexOf(normalizeKey(key));
    
    // Split by pipes but capture them to track indices
    const barParts = input.split(/(\|)/);
    let lastMidis = [];
    let charOffset = 0;

    barParts.forEach(barOrPipe => {
        if (barOrPipe === '|') {
            charOffset += 1;
            return;
        }
        
        const barText = barOrPipe;
        const chordTokens = barText.split(/(\s+)/);
        const actualChordParts = chordTokens.filter(t => t.trim() && t !== '|');
        const beatsPerChord = actualChordParts.length > 0 ? 4 / actualChordParts.length : 0;
        
        let barInternalOffset = 0;
        chordTokens.forEach(token => {
            if (token.trim().length > 0) {
                const part = token.trim();
                const [chordPart, bassPart] = part.split('/');
                
                const { rootMidi, rootPart, romanMatch, nnsMatch } = resolveChordRoot(chordPart, keyRootMidi, baseOctave);

                const suffixPart = chordPart.slice(rootPart.length);
                let { quality, is7th } = getChordDetails(suffixPart);
                
                // Adjustment for Roman numerals case/quality
                if (romanMatch) {
                    const numeral = romanMatch[2];
                    if (numeral === numeral.toLowerCase() && quality === 'major') quality = 'minor';
                    if (numeral.toLowerCase() === 'vii' && !suffixPart.match(/(maj|min|m|dim|o|aug|\+)/)) quality = 'dim';
                }

                let intervals = getIntervals(quality, is7th, cb.density);

                // Handle Slash Bass
                let bassMidi = null;
                let bassNameAbs = "", bassNameNNS = "", bassNameRom = "";

                if (bassPart) {
                    const { rootMidi: bMidi } = resolveChordRoot(bassPart, keyRootMidi, baseOctave);
                    bassMidi = bMidi;
                    
                    if (bassMidi !== null) {
                        while (bassMidi >= rootMidi) bassMidi -= 12;
                        while (bassMidi < rootMidi - 12) bassMidi += 12;
                        const bInterval = (bassMidi - keyRootMidi + 24) % 12;
                        bassNameAbs = KEY_ORDER[bassMidi % 12];
                        bassNameNNS = INTERVAL_TO_NNS[bInterval];
                        bassNameRom = INTERVAL_TO_ROMAN[bInterval];
                    }
                }

                let currentMidis = getBestInversion(rootMidi, intervals, lastMidis);
                if (bassMidi !== null) {
                    const bassPC = bassMidi % 12;
                    currentMidis = currentMidis.filter(m => m % 12 !== bassPC);
                    currentMidis.unshift(bassMidi);
                    currentMidis.sort((a, b) => a - b);
                }
                lastMidis = currentMidis;

                const interval = (rootMidi - keyRootMidi + 24) % 12;
                const rootNNS = INTERVAL_TO_NNS[interval];
                const rootRomanBase = INTERVAL_TO_ROMAN[interval];
                const rootName = KEY_ORDER[rootMidi % 12];
                
                const formatted = getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th);

                // Construct strings and display objects
                let finalAbsName = formatted.abs.root + formatted.abs.suffix;
                let finalNNSName = formatted.nns.root + formatted.nns.suffix;
                let finalRomName = formatted.rom.root + formatted.rom.suffix;

                if (bassPart && bassNameAbs) {
                    finalAbsName += `/${bassNameAbs}`;
                    finalNNSName += `/${bassNameNNS}`;
                    finalRomName += `/${bassNameRom}`;
                    
                    // Add bass to display objects
                    formatted.abs.bass = bassNameAbs;
                    formatted.nns.bass = bassNameNNS;
                    formatted.rom.bass = bassNameRom;
                }

                const isMinor = quality === 'minor' || quality === 'dim' || quality === 'halfdim';

                parsed.push({ 
                    romanName: finalRomName, absName: finalAbsName, nnsName: finalNNSName,
                    display: formatted,
                    isMinor: isMinor, beats: beatsPerChord, 
                    freqs: currentMidis.map(getFrequency),
                    rootMidi: rootMidi, intervals: intervals, quality: quality,
                    charStart: charOffset + barInternalOffset,
                    charEnd: charOffset + barInternalOffset + token.length
                });
            }
            barInternalOffset += token.length;
        });
        charOffset += barText.length;
    });

    cb.progression = parsed;
    updateProgressionCache();
    if (renderCallback) renderCallback();
}