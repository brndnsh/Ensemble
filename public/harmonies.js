import { getScaleForChord } from './soloist.js';
import { getBestInversion } from './chords.js';
import { ctx, gb, hb, sb, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getMidi, getFrequency } from './utils.js';

/**
 * HARMONIES.JS
 * 
 * Generates background "hooks" and "pads" (Horns, Strings, Synths).
 * Logic highlights:
 * - Motif Memory: Generates a 2-bar "hook" per section and repeats it.
 * - Soloist Awareness: Plays "pads" when soloist is busy, "stabs/hooks" when resting.
 * - Voice Leading: Anchors voices to minimize movement between chords.
 * - Genre Styles: Stabs (Funk/Jazz), Pads (Pop/Rock/Soul), Counter-melodies (Bossa).
 */

const STYLE_CONFIG = {
    horns: {
        density: 2, // Number of voices
        rhythmicStyle: 'stabs',
        timingJitter: 0.01,
        velocity: 0.85,
        octaveOffset: 0,
        padProb: 0.2 // Probability of playing a pad even if style is stabs
    },
    strings: {
        density: 3,
        rhythmicStyle: 'pads',
        timingJitter: 0.03,
        velocity: 0.6,
        octaveOffset: 0,
        padProb: 0.9
    },
    smart: {
        density: 2,
        rhythmicStyle: 'auto', // Depends on genre
        timingJitter: 0.015,
        velocity: 0.75,
        octaveOffset: 0,
        padProb: 0.5
    }
};

const RHYTHMIC_PATTERNS = {
    'Funk': [
        [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // The "And of 1" and "The 3"
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // The "2" and "4"
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated
    ],
    'Jazz': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // "Charleston" beat 2
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Beats 1 and 2
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // Syncopated "And of 2"
    ],
    'Pop': [
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 1 and 3
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Whole notes
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]  // 2 and 4
    ],
    'Neo-Soul': [
        [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Dilla-esque syncopation
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    ],
    'Bossa Nova': [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Clave-adjacent
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]
    ]
};

// Internal memory for motif consistency
const motifCache = new Map(); // Key: sectionId, Value: { patternIdx, noteIntervals }
let lastMidis = [];

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(chord, nextChord, step, octave, style, stepInChord) {
    if (!chord) return [];

    const notes = [];
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const sectionId = chord.sectionId || 'default';
    
    // --- 1. Decide on Pad vs Stab ---
    let config = STYLE_CONFIG[style] || STYLE_CONFIG.smart;
    let rhythmicStyle = config.rhythmicStyle;
    
    if (rhythmicStyle === 'auto') {
        const isPadGenre = ['Rock', 'Acoustic', 'Neo-Soul'].includes(gb.genreFeel);
        rhythmicStyle = isPadGenre ? 'pads' : 'stabs';
    }

    // Soloist Awareness: If soloist is busy, prefer pads
    const isSoloistBusy = sb.enabled && !sb.isResting && sb.notesInPhrase > 2;
    if (isSoloistBusy) rhythmicStyle = 'pads';

    // --- 2. Motif / Pattern Selection ---
    if (!motifCache.has(sectionId)) {
        const genrePatterns = RHYTHMIC_PATTERNS[gb.genreFeel] || RHYTHMIC_PATTERNS['Pop'];
        motifCache.set(sectionId, {
            patternIdx: Math.floor(Math.random() * genrePatterns.length),
            // Select 2-3 intervals from the scale for this section's "hook"
            // We'll update actual midis per chord, but keep the "scale degree" logic consistent
            intervals: [0, 4, 7] // Tonic triad as base
        });
    }
    const motif = motifCache.get(sectionId);

    // --- 3. Rhythm Logic ---
    let shouldPlay = false;
    let durationSteps = 1;

    if (rhythmicStyle === 'pads') {
        // Pads play on the downbeat of a chord or measure
        if (stepInChord === 0 || measureStep === 0) {
            shouldPlay = true;
            durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
        }
    } else {
        // Stabs/Hooks use the genre pattern
        const genrePatterns = RHYTHMIC_PATTERNS[gb.genreFeel] || RHYTHMIC_PATTERNS['Pop'];
        const pattern = genrePatterns[motif.patternIdx % genrePatterns.length];
        
        if (pattern && pattern[measureStep] === 1) {
            shouldPlay = true;
            durationSteps = 2; // Short stabs
        }
    }

    if (!shouldPlay) return [];

    // --- 4. Voicing Selection ---
    const scale = getScaleForChord(chord, nextChord, 'smart');
    const rootMidi = chord.rootMidi;
    
    // Intensity and local complexity scale the number of voices
    const baseDensity = config.density || 2;
    const density = Math.max(1, Math.floor(baseDensity * (0.4 + ctx.bandIntensity * 0.3 + hb.complexity * 0.3)));
    
    // Select notes from scale: Root, 3rd, 5th, 7th depending on density
    // For Harmonies, we focus on smooth voice leading of color tones
    const colorTones = [0, 4, 7, 10, 2, 9].filter(i => scale.includes(i));
    const intervals = colorTones.slice(0, density);

    const currentMidis = getBestInversion(rootMidi, intervals, lastMidis, stepInChord === 0);
    lastMidis = currentMidis;

    currentMidis.forEach((midi, i) => {
        notes.push({
            midi: midi,
            velocity: config.velocity * (0.8 + Math.random() * 0.2),
            durationSteps: durationSteps,
            timingOffset: (i * 0.01) + (Math.random() * config.timingJitter),
            style: rhythmicStyle
        });
    });

    return notes;
}