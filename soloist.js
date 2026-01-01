import { getFrequency } from './utils.js';
import { sb } from './state.js';

/**
 * Advanced Soloist Logic
 * Implements phrasing, rhythmic cells, and harmonic targeting.
 */

// Phrasing and Rhythmic Cells
const RHYTHMIC_CELLS = [
    [1, 0, 1, 0], // 8ths
    [1, 1, 1, 1], // 16ths
    [1, 0, 0, 0], // Quarter
    [1, 1, 1, 0], // Gallop
    [1, 0, 1, 1], // Reverse gallop
    [0, 1, 1, 1], // Offbeat start
    [1, 0, 0, 1], // Syncopated
];

/**
 * Determines the best scale intervals based on chord quality.
 */
function getScaleForChord(chord) {
    // Basic mapping of chord qualities to scales
    switch (chord.quality) {
        case 'minor': return [0, 2, 3, 5, 7, 8, 10]; // Dorian/Aeolian mix
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11]; // Octatonic
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10]; // Locrian
        case 'aug': return [0, 2, 4, 6, 8, 10]; // Whole Tone
        case 'maj7': return [0, 2, 4, 5, 7, 9, 11]; // Ionian
        default: 
            // If it's a dominant 7th (not maj7 but is7th)
            if (chord.intervals.includes(10)) return [0, 2, 4, 5, 7, 9, 10]; // Mixolydian
            return [0, 2, 4, 5, 7, 9, 11]; // Major
    }
}

export function getSoloistNote(currentChord, nextChord, measureStep, prevFreq = null, centerMidi = 77, style = 'scalar') {
    if (!currentChord) return null;

    // --- State Initialization ---
    if (sb.phraseSteps === undefined) {
        sb.phraseSteps = 0;
        sb.isResting = false;
        sb.currentCell = RHYTHMIC_CELLS[0];
    }

    const beatInMeasure = Math.floor(measureStep / 4);
    const stepInBeat = measureStep % 4;

    // --- Phrasing Logic ---
    if (measureStep === 0 || sb.phraseSteps <= 0) {
        // Decide if we should start a new phrase or rest
        if (!sb.isResting && Math.random() < 0.4) {
            sb.isResting = true;
            sb.phraseSteps = 4 + Math.floor(Math.random() * 8); // Rest for 1-2 beats
        } else {
            sb.isResting = false;
            sb.phraseSteps = 8 + Math.floor(Math.random() * 16); // Phrase for 2-4 beats
            sb.patternMode = Math.random() < 0.6 ? 'scale' : 'arp';
        }
    }
    sb.phraseSteps--;

    if (sb.isResting) return null;

    // --- Rhythmic Cell Selection ---
    if (stepInBeat === 0) {
        let cellPool = RHYTHMIC_CELLS;
        if (style === 'minimal') cellPool = [[1, 0, 0, 0], [1, 0, 1, 0]];
        sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
    }

    // Check rhythmic cell for current step
    if (sb.currentCell[stepInBeat] === 0) return null;

    // --- Pitch Selection ---
    const minMidi = centerMidi - 18;
    const maxMidi = centerMidi + 18;
    const prevMidi = prevFreq ? Math.round(12 * Math.log2(prevFreq / 440) + 69) : centerMidi;
    const rootMidi = currentChord.rootMidi;
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    let finalMidi = prevMidi;

    // Harmonic Targeting: If we are at the end of a measure and a new chord is coming,
    // target a strong note (3rd or 7th) of the next chord.
    const isApproachingChange = measureStep >= 12 && nextChord && nextChord !== currentChord;
    
    if (isApproachingChange && Math.random() < 0.7) {
        const nextRoot = nextChord.rootMidi;
        const targetIntervals = [nextChord.intervals[1], nextChord.intervals[nextChord.intervals.length-1]]; // 3rd or 7th
        const targets = targetIntervals.map(i => {
            let m = nextRoot + i;
            while (m < minMidi) m += 12;
            while (m > maxMidi) m -= 12;
            return m;
        });
        // Pick target closest to current
        targets.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
        
        // Approach chromatically or by step
        if (targets[0] > prevMidi) finalMidi = prevMidi + (Math.random() < 0.5 ? 1 : 2);
        else if (targets[0] < prevMidi) finalMidi = prevMidi - (Math.random() < 0.5 ? 1 : 2);
        else finalMidi = targets[0];
    } else {
        // Standard pattern motion
        if (sb.patternSteps <= 0) {
            sb.patternSteps = 2 + Math.floor(Math.random() * 6);
            if (prevMidi > centerMidi + 10) sb.direction = -1;
            else if (prevMidi < centerMidi - 10) sb.direction = 1;
            else sb.direction = Math.random() > 0.5 ? 1 : -1;
        }
        sb.patternSteps--;

        const findNext = (current, list, dir) => {
            let expanded = [];
            [-24, -12, 0, 12, 24].forEach(o => list.forEach(n => expanded.push(n + o)));
            expanded = [...new Set(expanded)].sort((a, b) => a - b);
            
            if (dir > 0) {
                return expanded.find(n => n > current) || current;
            } else {
                return [...expanded].reverse().find(n => n < current) || current;
            }
        };

        if (sb.patternMode === 'arp') {
            finalMidi = findNext(prevMidi, chordTones, sb.direction);
        } else {
            finalMidi = findNext(prevMidi, scaleTones, sb.direction);
        }
    }

    // Add some Bebop "Enclosure" logic for 'bird' style
    if (sb.style === 'bird' && Math.random() < 0.2 && stepInBeat !== 0) {
        finalMidi += (Math.random() > 0.5 ? 1 : -1);
    }

    // Constrain to range
    if (finalMidi > maxMidi) { finalMidi -= 12; sb.direction = -1; }
    if (finalMidi < minMidi) { finalMidi += 12; sb.direction = 1; }

    // Avoid dissonant "avoid notes" on downbeats
    const intervalFromRoot = (finalMidi - rootMidi + 120) % 12;
    if (stepInBeat === 0 && !currentChord.isMinor && intervalFromRoot === 5) {
        finalMidi += (sb.direction || 1);
    }

    return getFrequency(finalMidi);
}