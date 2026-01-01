import { getFrequency } from './utils.js';
import { sb, cb } from './state.js';
import { KEY_ORDER } from './config.js';

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
 * Determines the best scale intervals based on chord quality and parent key.
 */
function getScaleForChord(chord, style) {
    if (style === 'blues') {
        // Blues scales are often used regardless of the underlying chord's diatonic function
        if (chord.quality === 'minor' || chord.quality === 'halfdim' || chord.quality === 'dim') {
            return [0, 3, 5, 6, 7, 10]; // Minor Blues Scale (1, b3, 4, #4, 5, b7)
        }
        return [0, 2, 3, 4, 7, 9]; // Major Blues Scale (1, 2, b3, 3, 5, 6)
    }

    const keyRoot = KEY_ORDER.indexOf(cb.key);
    const keyIntervals = [0, 2, 4, 5, 7, 9, 11]; // Major Scale
    const keyNotes = keyIntervals.map(i => (keyRoot + i) % 12);
    
    const chordRoot = chord.rootMidi % 12;
    const chordTones = chord.intervals.map(i => (chordRoot + i) % 12);
    
    // Check if chord is primarily diatonic
    const isDiatonic = chordTones.every(note => keyNotes.includes(note));
    
    if (isDiatonic) {
        // Return intervals of the parent key scale relative to the chord root
        return keyNotes.map(note => (note - chordRoot + 12) % 12).sort((a, b) => a - b);
    }

    // Fallback for chromatic chords: use standard chord-scale theory
    switch (chord.quality) {
        case 'minor': return [0, 2, 3, 5, 7, 8, 10]; 
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'maj7': return [0, 2, 4, 5, 7, 9, 11];
        default: 
            if (chord.intervals.includes(10)) return [0, 2, 4, 5, 7, 9, 10];
            return [0, 2, 4, 5, 7, 9, 11];
    }
}

export function getSoloistNote(currentChord, nextChord, measureStep, prevFreq = null, centerMidi = 77, style = 'scalar') {
    if (!currentChord) return null;

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
    const scaleIntervals = getScaleForChord(currentChord, style);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    let finalMidi = prevMidi;

    // --- Blues Specific Phrasing ---
    let isGraceNote = false;
    if (style === 'blues' && Math.random() < 0.25 && stepInBeat !== 0) {
        // Characteristic blues "slip": quick chromatic note 1 semitone below a target
        isGraceNote = true;
    }

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

    if (isGraceNote) {
        // Slip from 1 semitone below the target
        finalMidi -= 1;
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
    // Avoid the 4th (interval 5) on downbeats for major and minor chords unless it's a chord tone
    if (stepInBeat === 0 && intervalFromRoot === 5 && !chordTones.includes(finalMidi)) {
        finalMidi += (sb.direction || 1);
    }

    return getFrequency(finalMidi);
}