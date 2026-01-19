import { getScaleForChord } from './soloist.js';
import { getBestInversion } from './chords.js';
import { ctx, gb, hb, sb, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';

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
    ],
    'Disco': [
        [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1], // The "And-4" 16th stabs
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight quarters (Chic)
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Offbeat 8ths
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]  // Dotted 8ths (Modern Pop)
    ],
    'Rock': [
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 1 and 3
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated pulse
    ],
    'Metal': [
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Constant 8ths
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // Constant 16ths
    ],
    'Reggae': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Traditional skank (2 and 4)
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]  // Double skank
    ],
    'Country': [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight quarters
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]  // Chugging 8ths
    ],
    'Acoustic': [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Whole notes
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Half notes
    ],
    'Hip Hop': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // 2 and 4
        [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated
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
    const feel = gb.genreFeel;
    
    // Intensity and local complexity scale the number of voices
    const baseDensity = config.density || 2;
    let density = Math.max(1, Math.floor(baseDensity * (0.4 + ctx.bandIntensity * 0.3 + hb.complexity * 0.3)));
    
    // Select notes based on Genre-Specific Theory
    let intervals = [0, 4, 7]; // Fallback triad

    if (feel === 'Jazz' || feel === 'Blues') {
        // Shell Voicings: 3rd and 7th are the priority
        const third = scale.find(i => i === 3 || i === 4) || 4;
        const seventh = scale.find(i => i === 10 || i === 11) || 10;
        intervals = [third, seventh];
        if (density > 2) intervals.push(scale.find(i => i === 2 || i === 9) || 7); // Add color (9 or 13)
    } 
    else if (feel === 'Rock' || feel === 'Metal') {
        // Power chords: 1 and 5
        intervals = [0, 7];
        if (density > 2) intervals.push(12); // Octave
    }
    else if (feel === 'Neo-Soul') {
        // Quartal Stacks: stacks of 4ths
        intervals = [0, 5, 10]; 
        if (density > 3) intervals.push(15);
    }
    else {
        // Default color tones
        const colorTones = [0, 4, 7, 10, 2, 9].filter(i => scale.includes(i));
        intervals = colorTones.slice(0, density);
    }

    // Disco Special: High-octave stabs
    const isDisco = feel === 'Disco';
    if (isDisco && ctx.bandIntensity > 0.7) density = Math.max(density, 2);

    // --- 5. Melodic Trend (Soaring) ---
    // Calculate a 4-bar "Lift" cycle
    const cycleMeasure = Math.floor(step / stepsPerMeasure) % 4;
    const liftShift = isDisco ? (cycleMeasure * 2) : 0; // Soar up by 2 semitones per bar

    // Force octaves for Disco hits
    if (isDisco && ctx.bandIntensity > 0.6 && rhythmicStyle === 'stabs') {
        intervals = [intervals[0], intervals[0] + 12];
    }

    const currentMidis = getBestInversion(rootMidi, intervals, lastMidis, stepInChord === 0);
    lastMidis = currentMidis;

    currentMidis.forEach((midi, i) => {
        const finalMidi = midi + liftShift;
        notes.push({
            midi: finalMidi,
            velocity: config.velocity * (0.8 + Math.random() * 0.2),
            durationSteps: durationSteps,
            timingOffset: (i * 0.01) + (Math.random() * config.timingJitter),
            style: rhythmicStyle
        });
    });

    return notes;
}