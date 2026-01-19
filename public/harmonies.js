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
        timingJitter: 0.005, // Tightened for focus
        velocity: 0.85,
        octaveOffset: 0,
        padProb: 0.2 // Probability of playing a pad even if style is stabs
    },
    strings: {
        density: 3,
        rhythmicStyle: 'pads',
        timingJitter: 0.02, // Reduced for focus
        velocity: 0.6,
        octaveOffset: 0,
        padProb: 0.9
    },
    smart: {
        density: 2,
        rhythmicStyle: 'auto', // Depends on genre
        timingJitter: 0.008, // Tightened for focus
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
let lastPlayedStep = -1;

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(chord, nextChord, step, octave, style, stepInChord, soloistResult = null) {
    if (!chord) return [];

    // AUTO-DUCK: If intensity is very low, we treat the module as disabled
    // to provide a "Delayed Bloom" where horns/strings only join when the jam builds up.
    if (ctx.bandIntensity < 0.22) return [];

    // Stab Termination: If we are at the start of a chord, ensure any hanging stabs are cleared
    // This provides the "Anchor" feel by ensuring chord changes are clean
    const isChordStart = stepInChord === 0;

    // Debounce: Prevent rapid-fire re-triggering on consecutive steps (common in latch mode)
    if (step === lastPlayedStep + 1 && soloistResult) {
        return [];
    }

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
            intervals: [0, 4, 7] 
        });
    }
    const motif = motifCache.get(sectionId);

    // --- 3. Rhythm Logic ---
    let shouldPlay = false;
    let durationSteps = 1;
    let isLatched = false;

    // LATCH LOGIC: Reinforce Soloist Hooks
    // If the soloist is replaying a hook and intensity is high, "Latch on" to their rhythm
    if (sb.enabled && sb.isReplayingMotif && ctx.bandIntensity > 0.4 && soloistResult) {
        // Optimization: Only latch if the soloist is playing a note on a "strong" step of their rhythmic cell
        // This prevents the harmony from playing every single note in a fast run (16ths), 
        // which sounds glitchy/distracting.
        const stepInCell = step % 4;
        const isStrongStep = stepInCell === 0 || (stepInCell === 2 && ctx.bandIntensity > 0.7);
        
        const hasSoloNote = Array.isArray(soloistResult) ? soloistResult.length > 0 : !!soloistResult;
        if (hasSoloNote && isStrongStep) {
            shouldPlay = true;
            durationSteps = 2; // Match the stab duration
            isLatched = true;
        }
    }

    if (!shouldPlay) {
        if (rhythmicStyle === 'pads') {
            if (stepInChord === 0 || measureStep === 0) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
            }
        } else {
            const genrePatterns = RHYTHMIC_PATTERNS[gb.genreFeel] || RHYTHMIC_PATTERNS['Pop'];
            const pattern = genrePatterns[motif.patternIdx % genrePatterns.length];
            if (pattern && pattern[measureStep] === 1) {
                shouldPlay = true;
                durationSteps = 2;
            }
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
    
    // If latched, thicken the reinforcement over time (based on session steps)
    if (isLatched) {
        const buildUp = Math.min(2, Math.floor(sb.sessionSteps / 64)); // Add 1-2 voices every 4 bars
        density = Math.max(density, 1 + buildUp);
    }

    // Select notes based on Genre-Specific Theory
    let intervals = [0, 4, 7]; 

    if (feel === 'Jazz' || feel === 'Blues') {
        const third = scale.find(i => i === 3 || i === 4);
        const seventh = scale.find(i => i === 10 || i === 11);
        if (third !== undefined && seventh !== undefined) {
            intervals = [third, seventh];
        } else {
            const isMinor = chord.type?.includes('m') || chord.symbol?.includes('m');
            intervals = [isMinor ? 3 : 4, 10];
        }
        if (density > 2) {
            const extension = scale.find(i => i === 2 || i === 9);
            if (extension !== undefined) intervals.push(extension);
            else if (scale.includes(7)) intervals.push(7);
        }
    } 
    else if (feel === 'Rock' || feel === 'Metal') {
        intervals = [0, 7];
        if (density > 2) intervals.push(12);
    }
    else if (feel === 'Neo-Soul') {
        intervals = [0, 5, 10]; 
        if (density > 3) intervals.push(15);
    }
    else {
        const colorTones = [0, 4, 7, 10, 2, 9].filter(i => scale.includes(i));
        intervals = colorTones.slice(0, density);
    }

    const isDisco = feel === 'Disco';
    if (isDisco && ctx.bandIntensity > 0.7) density = Math.max(density, 2);

    // --- 5. Melodic Trend (Soaring) ---
    const cycleMeasure = Math.floor(step / stepsPerMeasure) % 4;
    const liftShift = isDisco ? (cycleMeasure * 2) : 0; 

    if (isDisco && ctx.bandIntensity > 0.6 && rhythmicStyle === 'stabs' && !isLatched) {
        intervals = [intervals[0], intervals[0] + 12];
    }

    const currentMidis = getBestInversion(rootMidi, intervals, lastMidis, stepInChord === 0);
    lastMidis = currentMidis;
    
    if (currentMidis.length > 0) {
        lastPlayedStep = step;
    }

    // --- 6. Velocity Normalization (Anti-Clutter Scaling) ---
    // If playing multiple notes (Double Stops/Chords), we must reduce per-voice velocity
    // to keep the total acoustic energy constant and prevent volume spikes.
    // Formula: v = base_v * (1 / sqrt(num_voices))
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);
    
    currentMidis.forEach((midi, i) => {
        const finalMidi = midi + liftShift;
        
        // Soft Latch: Reinforcement should be felt, not heard as a solo instrument.
        // We reduce the accent multiplier from 1.2 to 1.1 and apply the polyphony compensation.
        const baseVol = config.velocity * (0.8 + Math.random() * 0.2);
        const latchMult = isLatched ? 1.05 : 1.0; 
        
        notes.push({
            midi: finalMidi,
            velocity: baseVol * latchMult * polyphonyComp,
            durationSteps: durationSteps,
            timingOffset: (i * 0.005) + (Math.random() * config.timingJitter), // Tightened inter-voice timing
            style: rhythmicStyle,
            isLatched: isLatched,
            isChordStart: isChordStart // Signal to kill previous stabs if needed
        });
    });

    return notes;
}