import { getFrequency, getMidi } from './utils.js';
import { sb, cb, ctx, arranger, gb } from './state.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';

/**
 * SOLOIST.JS
 * 
 * Refactored implementation focusing on "Expressive Musicality".
 * Features:
 * - Phrasing & Humanization ("Breath" Logic)
 * - Motif Retention & Variation (Smart Transposition)
 * - Harmonic Context (Beat Strength & Tension Cycles)
 * - Dynamic Arcs (Storytelling Velocity)
 * - Blue Note Curls (Soulful Articulation)
 */

// --- Constants ---

const RHYTHMIC_CELLS = [
    [1, 0, 1, 0], // 0: 8ths
    [1, 1, 1, 1], // 1: 16ths
    [1, 0, 0, 0], // 2: Quarter
    [1, 1, 1, 0], // 3: Gallop
    [1, 0, 1, 1], // 4: Reverse gallop
    [0, 1, 1, 1], // 5: Offbeat start
    [1, 0, 0, 1], // 6: Syncopated
    [1, 1, 0, 1], // 7: Bebop-esque 1
    [0, 1, 1, 0], // 8: Offbeat syncopation
    [1, 0, 1, 1], // 9: Syncopated 2
    [0, 1, 0, 1], // 10: Pure offbeats (16th offbeats)
    [1, 0, 0, 0, 0, 0, 0, 0], // 11: Half note (if 8 steps used)
    [0, 0, 1, 0], // 12: Single Offbeat 8th (the "And")
    [1, 0, 1, 0, 1, 0], // 13: Triplet-esque (Quarter + 8th feel)
    [0, 1, 0, 0]  // 14: Single Syncopated 16th (the "e")
];

/**
 * Lick Library: Pre-baked "hooky" melodic/rhythmic fragments.
 * 'i' = interval from root, 'd' = duration in steps, 'o' = step offset from start of lick
 */
const LICK_LIBRARY = {
    blues: [
        { name: 'The Box', notes: [{o:0, i:3, d:2}, {o:2, i:5, d:2}, {o:4, i:0, d:4}] },
        { name: 'Soul Slide', notes: [{o:0, i:7, d:1}, {o:1, i:6, d:1}, {o:2, i:5, d:2}, {o:4, i:3, d:4}] },
        { name: 'Root Pivot', notes: [{o:0, i:0, d:2}, {o:2, i:10, d:2}, {o:4, i:0, d:4}] }
    ],
    jazz: [
        { name: 'ii-V Enclosure', notes: [{o:0, i:2, d:1}, {o:1, i:1, d:1}, {o:2, i:0, d:2}] },
        { name: 'Arp Up', notes: [{o:0, i:0, d:2}, {o:2, i:4, d:2}, {o:4, i:7, d:2}, {o:6, i:11, d:2}] }
    ],
    rock: [
        { name: 'Pentatonic Run', notes: [{o:0, i:7, d:1}, {o:1, i:5, d:1}, {o:2, i:3, d:1}, {o:3, i:0, d:5}] },
        { name: 'Octave Jump', notes: [{o:0, i:0, d:2}, {o:4, i:12, d:4}] }
    ],
    disco: [
        { name: 'Octave Pump', notes: [{o:0, i:0, d:2}, {o:2, i:12, d:2}, {o:4, i:0, d:2}, {o:6, i:12, d:2}] },
        { name: 'Syncopated Triad', notes: [{o:1, i:4, d:1}, {o:3, i:7, d:1}, {o:5, i:12, d:3}] }
    ],
    bird: [
        { name: 'Root Enclosure', notes: [{o:0, i:2, d:1}, {o:1, i:-1, d:1}, {o:2, i:0, d:2}] },
        { name: '5th Enclosure', notes: [{o:0, i:8, d:1}, {o:1, i:6, d:1}, {o:2, i:7, d:2}] },
        { name: 'Bebop Run', notes: [{o:0, i:11, d:1}, {o:1, i:10, d:1}, {o:2, i:9, d:1}, {o:3, i:7, d:1}] },
        { name: 'Double Chromatic', notes: [{o:0, i:2, d:1}, {o:1, i:1, d:1}, {o:2, i:-1, d:1}, {o:3, i:0, d:1}] }
    ],
    bossa: [
        { name: 'Lyrical 3rd', notes: [{o:0, i:4, d:4}, {o:6, i:3, d:2}, {o:8, i:2, d:4}] },
        { name: 'Syncopated Triad', notes: [{o:0, i:0, d:2}, {o:3, i:4, d:2}, {o:6, i:7, d:4}] },
        { name: 'Descending 9th', notes: [{o:0, i:14, d:2}, {o:2, i:11, d:2}, {o:4, i:7, d:4}] }
    ],
    funk: [
        { name: 'JB Stabs', notes: [{o:0, i:0, d:1}, {o:1, i:0, d:1}, {o:2, i:0, d:2}, {o:4, i:10, d:1}, {o:5, i:0, d:3}] },
        { name: 'The Box', notes: [{o:0, i:10, d:1}, {o:1, i:0, d:1}, {o:2, i:3, d:1}, {o:3, i:0, d:1}] },
        { name: 'Horn Line', notes: [{o:0, i:7, d:2}, {o:2, i:9, d:2}, {o:4, i:10, d:2}, {o:6, i:0, d:2}] }
    ],
    neo: [
        { name: 'Dilla Drag', notes: [{o:0, i:2, d:2}, {o:2, i:0, d:4}, {o:6, i:10, d:2}] },
        { name: 'Quartal Rise', notes: [{o:0, i:0, d:2}, {o:2, i:5, d:2}, {o:4, i:10, d:4}] }
    ]
};

const STYLE_CONFIG = {
    scalar: { // Standard Rock/Pop
        restBase: 0.2, // More driving, less resting than Blues
        restGrowth: 0.05,
        cells: [0, 2, 11, 1], // Added 16ths (1) for energy
        registerSoar: 10, // Wider range (Arena Rock)
        tensionScale: 0.6, 
        timingJitter: 8, // Tighter than Blues
        maxNotesPerPhrase: 16,
        doubleStopProb: 0.1,
        anticipationProb: 0.1,
        targetExtensions: [2, 9],
        deviceProb: 0.15,
        allowedDevices: ['run', 'slide', 'guitarDouble']
    },
    shred: {
        restBase: 0.1,
        restGrowth: 0.02,
        cells: [1, 3, 4, 7, 0], 
        registerSoar: 16,
        tensionScale: 0.3,
        timingJitter: 4,
        maxNotesPerPhrase: 32,
        doubleStopProb: 0.05,
        anticipationProb: 0.05,
        targetExtensions: [2],
        deviceProb: 0.4,
        allowedDevices: ['run', 'guitarDouble']
    },
    blues: {
        restBase: 0.6, 
        restGrowth: 0.15,
        cells: [2, 11, 0, 12, 6], 
        registerSoar: 4, 
        tensionScale: 0.8,
        timingJitter: 25, 
        maxNotesPerPhrase: 5, 
        doubleStopProb: 0.35, // Increased from 0.2
        anticipationProb: 0.3,
        targetExtensions: [9, 10],
        deviceProb: 0.3,
        allowedDevices: ['slide', 'enclosure', 'guitarDouble']
    },
    neo: {
        restBase: 0.45,
        restGrowth: 0.12,
        cells: [11, 2, 6, 10, 12, 14], // Added 14 (Syncopated 16th)
        registerSoar: 6,
        tensionScale: 0.7,
        timingJitter: 45, // Extremely laid back ("Drunken")
        maxNotesPerPhrase: 8,
        doubleStopProb: 0.15,
        anticipationProb: 0.45,
        targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.25,
        allowedDevices: ['quartal', 'slide', 'guitarDouble']
    },
    funk: {
        restBase: 0.35, // Balanced spacing
        restGrowth: 0.08,
        cells: [1, 10, 14, 0, 6], // 16ths, Offbeat 16ths, Syncopated 'e', 8ths
        registerSoar: 5, // Stay in the pocket
        tensionScale: 0.4,
        timingJitter: 5, // Tight!
        maxNotesPerPhrase: 16, // Busy bursts
        doubleStopProb: 0.15,
        anticipationProb: 0.2,
        targetExtensions: [9, 13], // 2 (9) and 6 (13)
        deviceProb: 0.2,
        allowedDevices: ['slide', 'run']
    },
    minimal: {
        restBase: 0.65,
        restGrowth: 0.2,
        cells: [11, 2, 12], // Added 12
        registerSoar: 10,
        tensionScale: 0.9,
        timingJitter: 35,
        maxNotesPerPhrase: 4,
        doubleStopProb: 0.0,
        anticipationProb: 0.1,
        targetExtensions: [2, 7],
        deviceProb: 0.1,
        allowedDevices: ['slide']
    },
    bird: {
        restBase: 0.3, 
        restGrowth: 0.05,
        cells: [0, 12, 2, 7, 1], // 8ths, offbeat 8th, quarters, bebop syncopation, and 16ths
        registerSoar: 5,
        tensionScale: 0.7,
        timingJitter: 15,
        maxNotesPerPhrase: 16, 
        doubleStopProb: 0.1,
        anticipationProb: 0.5,
        targetExtensions: [2, 5, 9], // 9, 11, 13
        deviceProb: 0.5,
        allowedDevices: ['enclosure', 'run', 'guitarDouble']
    },
    disco: {
        restBase: 0.25,
        restGrowth: 0.06,
        cells: [0, 2, 5, 10],
        registerSoar: 12,
        tensionScale: 0.5,
        timingJitter: 8,
        maxNotesPerPhrase: 12,
        doubleStopProb: 0.05,
        anticipationProb: 0.2,
        targetExtensions: [2, 9],
        deviceProb: 0.1,
        allowedDevices: ['run']
    },
    bossa: {
        restBase: 0.4,
        restGrowth: 0.08,
        cells: [11, 2, 0, 6, 8], 
        registerSoar: 8,
        tensionScale: 0.7,
        timingJitter: 15,
        maxNotesPerPhrase: 8,
        doubleStopProb: 0.08,
        anticipationProb: 0.35,
        targetExtensions: [2, 6, 9], // 9, #11, 13
        deviceProb: 0.2,
        allowedDevices: ['enclosure', 'slide', 'guitarDouble']
    }
};

// --- Helpers ---

export function getScaleForChord(chord, nextChord, style) {
    if (style === 'smart') {
        const mapping = { 
            'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 
            'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 
            'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal'
        };
        style = mapping[gb.genreFeel] || 'scalar';
    }

    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const isDominant = chord.quality.startsWith('7') || 
                       ['13', '11', '9', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(chord.quality) ||
                       (chord.intervals.includes(10) && chord.intervals.includes(4));
    
    // 1. Tension High? Altered/Diminished
    if (sb.tension > 0.7 && isDominant) {
        return [0, 1, 3, 4, 6, 8, 10]; // Altered
    }

    // 2. Style Specifics
    if (style === 'blues' || style === 'disco' || style === 'funk') {
        const base = ['minor', 'halfdim', 'dim'].includes(chord.quality) 
            ? [0, 2, 3, 5, 6, 7, 10] 
            : [0, 2, 3, 4, 5, 6, 7, 9, 10];
        
        // BB Box Logic: Add Major 3rd (4) and 6th (9) availability over Major chords
        // allowing the soloist to choose between b3 (3) and 3 (4) for expression.
        if ((style === 'blues' || style === 'funk') && !['minor', 'halfdim', 'dim'].includes(chord.quality)) {
            if (!base.includes(4)) base.push(4); // Major 3rd
            if (!base.includes(9)) base.push(9); // Major 6th
        }

        // If tension is high, allow Major 7th (11) for that sophisticated blues "crunch"
        if (sb.tension > 0.7) base.push(11);
        return base.sort((a,b)=>a-b);
    }
    
    if (style === 'neo') {
        const keyRoot = KEY_ORDER.indexOf(arranger.key);
        const relativeRoot = (chord.rootMidi - keyRoot + 120) % 12;

        if (chord.quality.startsWith('maj') || chord.quality === 'major') {
            // Tonic Maj7 in Neo-Soul often sounds better with Ionian than Lydian to avoid #11 clash with melody
            if (relativeRoot === 0 && !arranger.isMinor) return [0, 2, 4, 5, 7, 9, 11]; 
            return [0, 2, 4, 6, 7, 9, 11]; // Lydian for others (like IV)
        }
        
        if (chord.quality === 'minor') {
            // Natural Minor (Aeolian) for the vi chord, Dorian for ii/iii/v
            if (relativeRoot === 9 && !arranger.isMinor) return [0, 2, 3, 5, 7, 8, 10];
            return [0, 2, 3, 5, 7, 9, 10]; // Dorian
        }
    }

    if (style === 'bossa' && (chord.quality.startsWith('maj') || chord.quality === 'major')) {
        return [0, 2, 4, 6, 7, 9, 11]; // Lydian (classic Bossa color)
    }

    // 3. Chord Scale Logic (Prioritize Specific Qualities)
    switch (chord.quality) {
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'sus4': return [0, 2, 5, 7, 9, 10]; // Mixolydian sus4
        case '7alt': return [0, 1, 3, 4, 6, 8, 10];
        case '7#9': return [0, 1, 3, 4, 6, 8, 10]; // Altered
        case '7b9': return [0, 1, 4, 5, 7, 8, 10];
        case '7b13': return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant
        case '7#11': return [0, 2, 4, 6, 7, 9, 10]; // Lydian Dominant
        case '9': return [0, 2, 4, 5, 7, 9, 10];
        case '13': return [0, 2, 4, 5, 7, 9, 10]; // Mixolydian
    }

    // 4. Resolution Logic (Secondary Dominants)
    // Only apply generic resolution logic to plain dominant 7ths.
    // Specific qualities handled above (like 7alt) should keep their intended flavor.
    const isMinorQuality = (q) => (q.startsWith('m') && !q.startsWith('maj')) || q.includes('minor') || q.includes('dim') || q.includes('halfdim');
    
    if (chord.quality === '7' && nextChord) {
        const resolvingDownFifth = ((nextChord.rootMidi - chord.rootMidi + 120) % 12 === 5);
        
        if (resolvingDownFifth) {
            // V7 -> im7 (or iiø7) resolution
            if (isMinorQuality(nextChord.quality)) return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant
            
            // V7 -> Imaj7 resolution (ensure Mixolydian for secondary doms)
            return [0, 2, 4, 5, 7, 9, 10]; 
        }
    }

    if (chord.quality === 'minor') {
        if (style === 'bird' || gb.genreFeel === 'Jazz' || style === 'neo' || gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Funk' || style === 'bossa' || gb.genreFeel === 'Bossa Nova') {
            return [0, 2, 3, 5, 7, 9, 10]; // Dorian
        }
        // Fall through to Diatonic check
    }

    if (isDominant || chord.quality === 'major') {
        const keyRoot = KEY_ORDER.indexOf(arranger.key);
        const relativeRoot = (chord.rootMidi - keyRoot + 120) % 12;

        // V in Minor Key -> Phrygian Dominant
        if (arranger.isMinor && relativeRoot === 7) return [0, 1, 4, 5, 7, 8, 10];

        if (isDominant) {
            // II7 (Major II) -> Lydian Dominant (#11)
            if (relativeRoot === 2 && !arranger.isMinor) return [0, 2, 4, 6, 7, 9, 10]; 

            // bVII7 (Backdoor Dominant) -> Lydian Dominant
            if (relativeRoot === 10 && !arranger.isMinor) return [0, 2, 4, 6, 7, 9, 10];

            return [0, 2, 4, 5, 7, 9, 10]; // Mixolydian fallback
        }
    }
    // 4. Diatonic Fallback (Only for simple triads that fit the key)
    const keyRoot = KEY_ORDER.indexOf(arranger.key);
    const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
    const keyNotes = keyIntervals.map(i => (keyRoot + i) % 12);
    const chordRoot = chord.rootMidi % 12;
    const chordTones = chord.intervals.map(i => (chordRoot + i) % 12);
    const isDiatonic = chordTones.every(note => keyNotes.includes(note));
    
    if (isDiatonic) {
        return keyNotes.map(note => (note - chordRoot + 12) % 12).sort((a, b) => a - b);
    }

    // 5. Final Fallback
    if (chord.quality === 'minor') return [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
    return chord.intervals.includes(11) ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 4, 5, 7, 9, 10];
}

// --- Main Generator ---

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 72, style = 'scalar', stepInChord = 0, bassFreq = null, isPriming = false) {
    if (!currentChord) return null;

    if (style === 'smart') {
        if (arranger.lastChordPreset === 'Minor Blues') {
            style = 'blues';
        } else {
            const mapping = { 
                'Rock': 'scalar', 
                'Jazz': 'bird', 
                'Funk': 'funk', 
                'Blues': 'blues', 
                'Neo-Soul': 'neo', 
                'Disco': 'disco', 
                'Bossa': 'bossa', 
                'Bossa Nova': 'bossa',
                'Afrobeat': 'funk',
                'Acoustic': 'minimal'
            };
            style = mapping[gb.genreFeel] || 'scalar';
        }
    }
    
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
    const intensity = ctx.bandIntensity || 0.5;
    
    // --- 0. Warm-up Logic ---
    // Prevent "guns-blazing" starts by scaling activity for the first few measures.
    if (!isPriming) {
        sb.sessionSteps = (sb.sessionSteps || 0) + 1;
    }
    const WARMUP_DURATION = stepsPerMeasure * 2; 
    const warmupFactor = isPriming ? 1.0 : Math.min(1.0, sb.sessionSteps / WARMUP_DURATION);
    
    // --- 1. Melodic Device Buffer Gate ---
    // If we have a queued sequence (like a Bebop enclosure), play the next note in the sequence.
    // We check this BEFORE the busySteps gate to allow sequence consumption to bypass physical gaps.
    if (sb.deviceBuffer && sb.deviceBuffer.length > 0) {
        const devNote = sb.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        sb.busySteps = (primaryNote.durationSteps || 1) - 1;
        sb.notesInPhrase++;
        if (!primaryNote.isDoubleStop) sb.lastFreq = getFrequency(primaryNote.midi);
        return devNote;
    }

    // --- 1.5 Physical Duration Gate ---
    // If we are still "busy" from the previous note's duration, decrement and skip.
    // This is the primary mechanism for preventing overlapping monophonic notes.
    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }
    
    // --- 2. Cycle & Tension Tracking ---
    
    const progressionBars = (arranger.progression && arranger.progression.length > 0) ? arranger.progression.length / stepsPerMeasure : 4;
    const CYCLE_BARS = (progressionBars > 0 && progressionBars <= 8) ? progressionBars : 4;
    const stepsPerCycle = stepsPerMeasure * CYCLE_BARS;
    const cycleStep = step % stepsPerCycle;
    
    const measureIndex = Math.floor(cycleStep / stepsPerMeasure);
    let baseTension = (measureIndex / CYCLE_BARS) * (0.5 + intensity * 0.5); 
    
    // --- Section Build-up Tracking ---
    const totalStepsArr = arranger.totalSteps || 0;
    const modStepArr = step % (totalStepsArr || 1);
    const entry = (arranger.stepMap || []).find(e => modStepArr >= e.start && modStepArr < e.end);
    const sectionProgress = entry ? (modStepArr - entry.start) / (entry.end - entry.start) : 0;
    
    // Solos should build tension towards the end of a section
    baseTension += sectionProgress * 0.25 * intensity;

    const grouping = arranger.grouping || tsConfig.grouping || [tsConfig.beats];
    const isGroupStart = (() => {
        let accumulated = 0;
        for (let g of grouping) {
            if (measureStep === accumulated) return true;
            accumulated += g * stepsPerBeat;
        }
        return false;
    })();

    const isStrongBeat = isGroupStart || (beatInMeasure === 0 && stepInBeat === 0);
    const isOffbeat = stepInBeat !== 0;

    if (isStrongBeat) baseTension -= (0.15 * intensity);
    if (isOffbeat) baseTension += (0.1 * intensity);
    
    sb.tension = Math.max(0, Math.min(1, baseTension));


    // --- 2. Breath & Phrasing Logic ---
    
    if (typeof sb.currentPhraseSteps === 'undefined' || (step === 0 && !sb.isResting)) {
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
        sb.qaState = 'Question';
        sb.isResting = true; 
        return null; 
    }
    
    if (typeof sb.contourSteps === 'undefined') {
        sb.contourSteps = 0;
        sb.melodicTrend = 'Static';
    }

    if (sb.contourSteps <= 0) {
        const trends = ['Up', 'Down', 'Static'];
        sb.melodicTrend = trends[Math.floor(Math.random() * trends.length)];
        if (sb.qaState === 'Answer' && Math.random() < 0.7) {
            sb.melodicTrend = Math.random() < 0.5 ? 'Down' : 'Static';
        }
        sb.contourSteps = 4 + Math.floor(Math.random() * 5); 
    }
    sb.contourSteps--;
    
    const phraseLengthBars = sb.currentPhraseSteps / stepsPerMeasure;
    const tempoBreathFactor = Math.max(0, (ctx.bpm - 120) * 0.003); 
    let restProb = (config.restBase * (2.0 - intensity * 1.5)) + (phraseLengthBars * config.restGrowth) + tempoBreathFactor;
    
    // Scale rest probability based on warmup (Higher rest prob at start)
    restProb = restProb + (1.0 - warmupFactor) * 0.4;

    // Decrease rest probability as section ends to build "Storytelling" energy
    restProb -= sectionProgress * 0.25 * intensity;

    const tempoBudgetFactor = Math.max(0.5, 1.0 - (ctx.bpm - 100) * 0.004);
    if (sb.notesInPhrase >= config.maxNotesPerPhrase * tempoBudgetFactor) restProb += 0.4;

    if (isGroupStart) restProb *= 0.3;
    restProb = Math.max(0.05, restProb);
    
    if (cycleStep > stepsPerCycle - (stepsPerBeat * 2)) restProb += (0.5 * (1.1 - intensity));

    if (sb.isResting) {
        const startBias = step < 8 ? 0.3 : 1.0;
        const tempoStartBias = Math.max(0.4, 1.0 - (ctx.bpm - 120) * 0.005);
        
        if (Math.random() < (0.4 + (intensity * 0.3)) * startBias * tempoStartBias) { 
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            sb.notesInPhrase = 0;
            sb.qaState = sb.qaState === 'Question' ? 'Answer' : 'Question';

            const hasHook = sb.hookBuffer && sb.hookBuffer.length > 0;
            const hasMotif = sb.motifBuffer && sb.motifBuffer.length > 0;
            const rand = Math.random();

            if (rand < 0.2 && LICK_LIBRARY[style]) {
                const licks = LICK_LIBRARY[style];
                const selectedLick = licks[Math.floor(Math.random() * licks.length)];
                sb.activeBuffer = selectedLick.notes.map(n => ({
                    interval: n.i,
                    dur: n.d,
                    step: cycleStep + n.o
                }));
                sb.isReplayingMotif = true;
                sb.motifReplayIndex = 0;
            } else if ((hasHook || hasMotif) && rand < 0.6) {
                sb.isReplayingMotif = true;
                const useHook = hasHook && (progressionBars <= 8 || Math.random() < 0.3);
                sb.activeBuffer = useHook ? sb.hookBuffer : sb.motifBuffer;
                sb.motifReplayIndex = 0;
            } else {
                sb.isReplayingMotif = false;
                if (hasMotif && sb.motifBuffer.length > 4 && Math.random() < sb.hookRetentionProb) {
                    sb.hookBuffer = [...sb.motifBuffer];
                }
                sb.motifBuffer = []; 
            }
        } else {
            return null; 
        }
    }

    if (!sb.isResting && sb.currentPhraseSteps > 4 && Math.random() < restProb) {
        sb.isResting = true;
        sb.currentPhraseSteps = 0;
        return null;
    }
    
    sb.currentPhraseSteps++;

    // --- 3. Harmonization Context (Target Chord) ---

    const chordLengthSteps = Math.round(currentChord.beats * stepsPerBeat);
    const isAnticipationStep = (stepInChord >= chordLengthSteps - 2);
    let targetChord = currentChord;
    if (isAnticipationStep && nextChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const rootMidi = targetChord.rootMidi;

    // --- 4. Rhythm Generation & Motif Replay ---

    let shouldPlay = false;
    let durationMultiplier = 1;
    let selectedMidi = null;

    if (sb.isReplayingMotif && sb.activeBuffer) {
        const storedNote = sb.activeBuffer.find(n => n.step === cycleStep);
        if (storedNote) {
            shouldPlay = true;
            durationMultiplier = storedNote.dur || 1;
            
            let interval = storedNote.interval;
            const currentScale = getScaleForChord(targetChord, (targetChord === currentChord ? nextChord : null), style);
            
            if (interval === 4 && !currentScale.includes(4) && currentScale.includes(3)) interval = 3;
            else if (interval === 3 && !currentScale.includes(3) && currentScale.includes(4)) interval = 4;
            else if (!currentScale.includes(interval % 12)) {
                const pc = interval % 12;
                const isExpressive = ['bird', 'blues', 'neo'].includes(style) || ['Jazz', 'Blues', 'Neo-Soul'].includes(gb.genreFeel);
                let shouldNudge = true;
                if (isExpressive) {
                    const neighbors = [(pc - 1 + 12) % 12, (pc + 1 + 12) % 12];
                    if (neighbors.some(n => currentScale.includes(n))) shouldNudge = false;
                }
                if (shouldNudge) {
                    let best = currentScale[0];
                    let minDiff = 12;
                    for (const s of currentScale) {
                        const diff = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc));
                        if (diff < minDiff) { minDiff = diff; best = s; }
                    }
                    interval = (interval - pc) + best;
                }
            }

            // MOTIF RESOLUTION: If replaying a motif during an "Answer" phase on a tonic chord,
            // ensure any spicy extensions from the original motif are nudged to diatonic tones.
            const keyRoot = KEY_ORDER.indexOf(arranger.key);
            const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
            const pc = (interval % 12 + 12) % 12;
            const isDiatonic = keyIntervals.includes((pc + targetChord.rootMidi - keyRoot + 120) % 12);
            const relativeRoot = (targetChord.rootMidi - keyRoot + 120) % 12;
            const isTonicChord = relativeRoot === 0 || (arranger.isMinor && relativeRoot === 9) || (!arranger.isMinor && relativeRoot === 4);

            if (sb.qaState === 'Answer' && isTonicChord && !isDiatonic) {
                 // Nudge to nearest diatonic scale tone within the current chord scale
                 let best = pc;
                 let minDiff = 12;
                 const chordScale = getScaleForChord(targetChord, (targetChord === currentChord ? nextChord : null), style);
                 for (const s of chordScale) {
                     const isSInKey = keyIntervals.includes((s + targetChord.rootMidi - keyRoot + 120) % 12);
                     if (!isSInKey) continue;
                     const diff = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc));
                     if (diff < minDiff) { minDiff = diff; best = s; }
                 }
                 interval = (interval - pc) + best;
            }

            selectedMidi = targetChord.rootMidi + interval;
        }
    }

    if (!sb.isReplayingMotif && !selectedMidi && stepInBeat === 0) {
        if (sb.currentCell && sb.currentCell.some(v => v === 1) && Math.random() < 0.6) {
            // Inertia
        } else {
            let cellPool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));
            if (ctx.bpm > 140 && style !== 'shred' && style !== 'bird') {
                const forbiddenIdx = [1, 3, 4, 5, 6, 7, 8, 9, 10, 14];
                cellPool = cellPool.filter((_, idx) => !forbiddenIdx.includes(idx));
                if (ctx.bpm > 180) cellPool = cellPool.filter((_, idx) => [2, 11].includes(idx));
                if (cellPool.length === 0) cellPool = [RHYTHMIC_CELLS[2]]; 
            } else if (ctx.bpm > 120 && style !== 'shred' && style !== 'bird') {
                cellPool = cellPool.filter((_, idx) => ![1, 3, 4, 7, 9].includes(idx));
            }
            if (sb.tension > 0.7 && style === 'shred') cellPool = [RHYTHMIC_CELLS[1]]; 
            if (sb.tension < 0.3 && style === 'minimal') cellPool = [RHYTHMIC_CELLS[2]]; 
            sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
        }
        if (Math.random() < 0.1) sb.currentCell = [0, 0, 0, 0];
    }
    
    if (!sb.isReplayingMotif && !selectedMidi && sb.currentCell && sb.currentCell[stepInBeat] === 1) shouldPlay = true;
    if (!shouldPlay && !selectedMidi) return null;                
    
    sb.notesInPhrase++;

    // --- 5. Pitch Selection (Standard Weighted Generation) ---

    if (!selectedMidi) {
        const chordTones = targetChord.intervals.map(i => rootMidi + i);
        const scaleIntervals = getScaleForChord(targetChord, (targetChord === currentChord ? nextChord : null), style);
        const scaleTones = scaleIntervals.map(i => rootMidi + i);
        const soarAmount = config.registerSoar * (0.5 + intensity); 
        const dynamicCenter = centerMidi + Math.floor(sb.tension * soarAmount);
        const minMidi = dynamicCenter - 15; 
        const maxMidi = dynamicCenter + 15;
        const lastMidi = prevFreq ? getMidi(prevFreq) : dynamicCenter;

        let candidates = [];
        for (let m = minMidi; m <= maxMidi; m++) {
            const pc = (m % 12 + 12) % 12;
            const rootPC = (rootMidi % 12 + 12) % 12;
            const interval = (pc - rootPC + 12) % 12;
            let weight = 1.0;
            const isChordTone = chordTones.some(ct => (ct % 12 + 12) % 12 === pc);
            const isScaleTone = scaleTones.some(st => (st % 12 + 12) % 12 === pc);
            
            if (!isScaleTone) continue; 

            // Target Extensions (Color Notes) - used more sparingly now
            if (config.targetExtensions && config.targetExtensions.includes(interval)) {
                weight += 8; // Reduced from 12
            }

            if (isStrongBeat) {
                if (isChordTone) {
                    weight += 15; // Increased from 10
                    // Target the 3rd or 7th on ANY strong beat (Harmonic Anchors)
                    if (interval === 3 || interval === 4 || interval === 10 || interval === 11) {
                        weight += 20; // Increased from 15 and expanded beyond just beat 0
                    }
                } else {
                    let isClash = false;
                    const isDominant = targetChord.quality.startsWith('7') || 
                                     ['13', '11', '9', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(targetChord.quality) ||
                                     (targetChord.intervals.includes(10) && targetChord.intervals.includes(4));
                    const isMajorLike = ['major', 'maj7', 'maj9', 'maj11', 'maj13', 'maj7#11'].includes(targetChord.quality) || isDominant;
                    if (isMajorLike && interval === 5) isClash = true;
                    if (targetChord.quality === 'minor' && interval === 8) isClash = true;
                    const isAlteredOrPhrygian = scaleIntervals.includes(1) && (scaleIntervals.includes(3) || scaleIntervals.includes(8));
                    if (interval === 1 && !isAlteredOrPhrygian) isClash = true;
                    if (isClash) weight -= 50; else weight -= 5; 
                }
            } else {
                if (!isChordTone) weight += 2; 
            }

            // 2. Quartal Harmony Logic (Neo-Soul)
            // Modern/Neo-Soul styles often favor stacks of 4ths over traditional 3rds.
            if (style === 'neo' && Math.abs(m - lastMidi) === 5) {
                weight += 100; // Increased to ensure it out-competes aggregate stepwise movement
            }

            // 3. Rhythmic Call and Response (Conversational Logic)
            // 'Question' phase builds tension with extensions, 'Answer' phase resolves to anchors.
            if (sb.qaState === 'Question') {
                if (interval === 6 || interval === 10) weight += 30; // #11 or b7
            } else if (sb.qaState === 'Answer') {
                if (interval === 0) weight += 60; // Root (Strong Resolution)
                if (interval === 7) weight += 30; // 5th (Stable Anchor)
            }

            if (sb.tension > 0.8) {
                if (!isChordTone && isScaleTone) weight += 5;
            } else if (sb.tension < 0.2) {
                if (interval === 0 || interval === 7) weight += 8;
            }
            
            const dist = Math.abs(m - lastMidi);
            if (dist === 0) weight -= 15; 
            
            if (dist > 0 && dist <= 2) {
                const tempoStepBias = (ctx.bpm / 100) * 20;
                weight += (45 + tempoStepBias); // Increased from 25
                if (style === 'scalar') weight += 30; // Increased from 20
            } else if (dist >= 3 && dist <= 4) {
                weight += 5; // Reduced from 10
            } else if (dist >= 5 && dist <= 7) {
                weight -= 15; // Increased penalty from -5
            } else if (dist > 7 && dist <= 12) {
                weight -= 60; // Increased penalty from -40
            } else if (dist > 12) {
                weight -= 150; // Increased penalty from -100
            }

            if (sb.melodicTrend === 'Up' && m > lastMidi) weight += 15;
            if (sb.melodicTrend === 'Down' && m < lastMidi) weight += 15;
            if (sb.melodicTrend === 'Static' && dist <= 2) weight += 10;
            
            const distFromCenter = Math.abs(m - dynamicCenter);
            if (distFromCenter > 7) weight -= (distFromCenter - 7) * 3; 
            
            // 4. Harmonic Role Awareness (Key-based Filtering)
            // Penalize non-diatonic notes on Tonic/Resolution chords during "Answer" phrases.
            const keyRoot = KEY_ORDER.indexOf(arranger.key);
            const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
            const isDiatonic = keyIntervals.includes((pc - keyRoot + 12) % 12);
            const relativeRoot = (targetChord.rootMidi - keyRoot + 120) % 12;
            const isTonicChord = relativeRoot === 0 || (arranger.isMinor && relativeRoot === 9) || (!arranger.isMinor && relativeRoot === 4);

            if (sb.qaState === 'Answer' && isTonicChord && !isDiatonic) {
                weight -= 40; // Heavy penalty for non-diatonic tones on resolution
            }

            candidates.push({ midi: m, weight: Math.max(0.1, weight) });
        }

        let totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
        let randomVal = Math.random() * totalWeight;
        selectedMidi = lastMidi;
        for (const cand of candidates) {
            randomVal -= cand.weight;
            if (randomVal <= 0) { selectedMidi = cand.midi; break; }
        }
        
        if (cycleStep === 0 && isStrongBeat) {
            selectedMidi = chordTones[0];
            let safety = 0;
            while (selectedMidi < minMidi && safety < 10) { selectedMidi += 12; safety++; }
            safety = 0;
            while (selectedMidi > maxMidi && safety < 10) { selectedMidi -= 12; safety++; }
        }
    }

    // --- 6. Articulation & Humanization ---
    
    let bendStartInterval = 0;
    const intervalFromRoot = (selectedMidi - rootMidi + 120) % 12;
    if (intervalFromRoot === 4 && ['blues', 'neo', 'bird', 'minimal', 'funk'].includes(style)) {
        if (Math.random() < 0.4) bendStartInterval = 1; 
    }
    // Blues Curl: Bend b3 slightly sharp (Quarter tone or Half tone)
    if (intervalFromRoot === 3 && (style === 'blues' || style === 'funk')) {
         if (Math.random() < 0.5) bendStartInterval = 0.5; // Quarter tone curl
    }
    if (intervalFromRoot === 7 && (style === 'blues' || style === 'funk')) {
         if (Math.random() < 0.3) bendStartInterval = 1; 
    }
    if (intervalFromRoot === 0 && ['neo', 'bird', 'blues', 'funk'].includes(style) && isStrongBeat) {
         if (Math.random() < 0.35) bendStartInterval = 0.5; 
    }
    // Rock Unison Bend Simulation (Bend 4th to 5th or b7 to Root)
    if ((intervalFromRoot === 5 || intervalFromRoot === 10) && (style === 'scalar' || style === 'shred')) {
        if (Math.random() < 0.3) bendStartInterval = 2; // Whole tone bend
    }

    const phraseProg = Math.min(1, sb.currentPhraseSteps / 32);
    const arch = Math.sin(phraseProg * Math.PI); 
    let baseVel = 0.7;
    let dynRange = 0.3;
    if (style === 'minimal') { baseVel = 0.5; dynRange = 0.5; }
    let velocity = baseVel + (arch * dynRange);
    velocity += (Math.random() - 0.5) * 0.1;
    if (isStrongBeat) velocity *= 1.1;

    // Jazz Ghost Notes
    if (style === 'bird' && !isStrongBeat && Math.random() < 0.25) {
        velocity *= 0.4; // Ghost note
    }
    // Funk Ghost Notes (more frequent)
    if (style === 'funk' && !isStrongBeat && Math.random() < 0.35) {
        velocity *= 0.3; 
    }

    let timingOffset = (Math.random() - 0.5) * config.timingJitter;

    if (!sb.isReplayingMotif) {
        const cellType = sb.currentCell.join('');
        const cellDurs = {
            '1010': 2, '1111': 1, '1000': 4, '1110': 1, '1011': 1, '0111': 1, '1001': 1,
            '1101': 1, '0110': 1, '0101': 1, '10000000': 8, '0010': 2, '0100': 1
        };
        durationMultiplier = cellDurs[cellType] || 1;
        
        // FUNK/DISCO STACCATO ENFORCEMENT
        if (style === 'funk' || style === 'disco') {
            // Force short durations for that "pecking" sound
            if (Math.random() < 0.8 && durationMultiplier > 1) {
                durationMultiplier = 1;
            }
        }
        
        if (durationMultiplier >= 2 && ['blues', 'neo', 'bossa', 'minimal', 'bird'].includes(style)) {
            if (Math.random() < 0.4) durationMultiplier *= 1.5;
        }
    }    
    durationMultiplier = Math.max(1, Math.round(durationMultiplier || 1));
    sb.busySteps = durationMultiplier - 1;

    // --- 7. Advanced Melodic Devices ---
    
    if (!sb.isReplayingMotif && isStrongBeat && Math.random() < (config.deviceProb * warmupFactor)) {
        const deviceType = config.allowedDevices ? config.allowedDevices[Math.floor(Math.random() * config.allowedDevices.length)] : null;
        
        // FUNK REPETITIVE STAB (The "James Brown" Hit)
        // If we are playing Funk, sometimes we just want to hit the same note 3-4 times.
        if (style === 'funk' && Math.random() < 0.35) {
             const stabCount = 3 + Math.floor(Math.random() * 3); // 3-5 hits
             sb.deviceBuffer = [];
             for(let i=0; i<stabCount; i++) {
                 sb.deviceBuffer.push({ 
                     midi: selectedMidi, 
                     velocity: velocity * (i===0 ? 1.1 : 0.9), 
                     durationSteps: 1, 
                     style, 
                     timingOffset: 0 
                 });
             }
             sb.busySteps = 0;
             sb.lastFreq = getFrequency(selectedMidi);
             return sb.deviceBuffer.shift();
        }
        
        if (deviceType === 'enclosure') {
            const aboveMidi = selectedMidi + (Math.random() < 0.5 ? 1 : 2);
            const belowMidi = selectedMidi - 1;
            
            // SCALE CHECK: Ensure enclosure notes are either in-scale or chromatic leading tones
            const scaleIntervals = getScaleForChord(targetChord, nextChord, style);
            const isNoteSafe = (m) => {
                const pc = (m % 12 + 12) % 12;
                const rootPC = (targetChord.rootMidi % 12 + 12) % 12;
                const interval = (pc - rootPC + 12) % 12;
                return scaleIntervals.includes(interval);
            };

            sb.deviceBuffer = [
                { midi: isNoteSafe(belowMidi) ? belowMidi : selectedMidi - 1, velocity: velocity * 0.85, durationSteps: 1, style, timingOffset: 0 },
                { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, bendStartInterval, style, timingOffset: 0 }
            ];
            sb.busySteps = 0;
            sb.lastFreq = getFrequency(isNoteSafe(aboveMidi) ? aboveMidi : selectedMidi + 1);
            return { midi: isNoteSafe(aboveMidi) ? aboveMidi : selectedMidi + 1, velocity: velocity * 0.85, durationSteps: 1, style, timingOffset: timingOffset / 1000 };
        } 
        
        if (deviceType === 'quartal' && sb.doubleStops) {
            // Stack of 4ths (Neo-Soul style)
            const midMidi = selectedMidi + 5;
            const topMidi = selectedMidi + 10;
            sb.deviceBuffer = [
                { midi: midMidi, velocity: velocity * 0.9, durationSteps: 1, style, timingOffset: 0, isDoubleStop: true },
                { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, style, timingOffset: 0, isDoubleStop: false }
            ];
            sb.busySteps = 0;
            sb.lastFreq = getFrequency(topMidi);
            return { midi: topMidi, velocity: velocity * 0.9, durationSteps: 1, style, timingOffset: timingOffset / 1000, isDoubleStop: true };
        }

        if (deviceType === 'run') {
            // Scalar run leading to target
            const stepSize = Math.random() < 0.5 ? 1 : 2;
            const n1 = selectedMidi - (stepSize * 3);
            const n2 = selectedMidi - (stepSize * 2);
            const n3 = selectedMidi - (stepSize * 1);
            sb.deviceBuffer = [
                { midi: n2, velocity: velocity * 0.8, durationSteps: 1, style, timingOffset: 0 },
                { midi: n3, velocity: velocity * 0.9, durationSteps: 1, style, timingOffset: 0 },
                { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, style, timingOffset: 0 }
            ];
            sb.busySteps = 0;
            sb.lastFreq = getFrequency(n1);
            return { midi: n1, velocity: velocity * 0.7, durationSteps: 1, style, timingOffset: timingOffset / 1000 };
        }

        if (deviceType === 'slide') {
            // Chromatic slide/grace note (Blues/Rock)
            // SCALE CHECK: For non-blues styles, ensure grace note is in scale or a half-step below target
            const graceMidi = selectedMidi - 1;
            sb.deviceBuffer = [
                { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, style, timingOffset: 0 }
            ];
            sb.busySteps = 0;
            sb.lastFreq = getFrequency(graceMidi);
            return { midi: graceMidi, velocity: velocity * 0.7, durationSteps: 1, style, timingOffset: timingOffset / 1000 };
        }

        if (deviceType === 'guitarDouble' && sb.doubleStops) {
            const rand = Math.random();
            const currentScale = getScaleForChord(targetChord, nextChord, style);
            let dsInterval = (style === 'blues' || style === 'scalar') ? (Math.random() < 0.7 ? 5 : 7) : (Math.random() < 0.5 ? 3 : 4);
            
            // SCALE CHECK: Ensure the second note is in the scale
            if (!currentScale.includes((dsInterval) % 12)) {
                 // Nudge to nearest scale tone
                 let best = dsInterval;
                 let minDiff = 12;
                 for (const s of currentScale) {
                     const diff = Math.min(Math.abs(s - (dsInterval % 12)), 12 - Math.abs(s - (dsInterval % 12)));
                     if (diff < minDiff) { minDiff = diff; best = s; }
                 }
                 dsInterval = best;
            }

            const secondMidi = selectedMidi + dsInterval;

            if (rand < 0.4) {
                // Variation 1: Hendrix Hammer (Hold one note, hammer the other)
                sb.deviceBuffer = [
                    [{ midi: secondMidi, velocity: velocity * 0.9, durationSteps: durationMultiplier, style, timingOffset: 0, isDoubleStop: true },
                     { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, style, timingOffset: 0, isDoubleStop: false }]
                ];
                sb.busySteps = 0;
                sb.lastFreq = getFrequency(selectedMidi);
                return [{ midi: secondMidi - 2, velocity: velocity * 0.7, durationSteps: 1, style, timingOffset: 0, isDoubleStop: true },
                        { midi: selectedMidi, velocity: velocity * 0.8, durationSteps: 1, style, timingOffset: 0, isDoubleStop: false }];
            } else if (rand < 0.7) {
                // Variation 2: Slide In (Chromatic slide on both notes)
                sb.deviceBuffer = [
                    [{ midi: secondMidi, velocity: velocity * 0.9, durationSteps: durationMultiplier, style, timingOffset: 0, isDoubleStop: true },
                     { midi: selectedMidi, velocity: velocity, durationSteps: durationMultiplier, style, timingOffset: 0, isDoubleStop: false }]
                ];
                sb.busySteps = 0;
                sb.lastFreq = getFrequency(selectedMidi - 1);
                return [{ midi: secondMidi - 1, velocity: velocity * 0.6, durationSteps: 1, style, timingOffset: 0, isDoubleStop: true },
                        { midi: selectedMidi - 1, velocity: velocity * 0.7, durationSteps: 1, style, timingOffset: 0, isDoubleStop: false }];
            } else {
                // Variation 3: Rhythmic Punctuations (Double stop hits)
                return [{ midi: secondMidi, velocity: velocity, durationSteps: 1, style, timingOffset: 0, isDoubleStop: true },
                        { midi: selectedMidi, velocity: velocity * 1.1, durationSteps: 1, style, timingOffset: 0, isDoubleStop: false }];
            }
        }
    }

    let notes = [];
    if (sb.doubleStops && !sb.isReplayingMotif) {
        const isUpbeat = stepInBeat === 2;
        const isPhraseEnd = sb.notesInPhrase > (config.maxNotesPerPhrase * 0.7);
        const dsMod = (isUpbeat || isPhraseEnd) ? 1.2 : 0.6; // Increased from 0.3 to be less restrictive

        if (Math.random() < (config.doubleStopProb * dsMod * warmupFactor)) {
            let dsIntervals = [5, 7, 9, 12];
            if (style === 'blues') dsIntervals = [3, 4, 5, 9, 10, 12]; 
            if (style === 'scalar' || style === 'shred') dsIntervals = [7, 12, 5]; 
            if (style === 'neo') dsIntervals = [4, 5, 10, 11]; 
            if (style === 'bossa') dsIntervals = [4, 9, 5]; 

            // Chord Awareness: If chord has a strong b7 or 3rd, try to include it
            const currentPC = (selectedMidi % 12 + 12) % 12;
            const rootPC = (targetChord.rootMidi % 12 + 12) % 12;
            const currentInterval = (currentPC - rootPC + 12) % 12;

            if (targetChord.quality.includes('7') && currentInterval === 0) {
                // If we are on the root, adding the b7 (10) or 4th (5) is very guitaristic
                dsIntervals = [10, 5, 12];
            }

            const dsInt = dsIntervals[Math.floor(Math.random() * dsIntervals.length)];
            const secondMidi = selectedMidi + (Math.random() > 0.5 ? dsInt : -dsInt);
            if (secondMidi > 40 && secondMidi < 100) {
                notes.push({ midi: secondMidi, velocity: velocity * 0.8, isDoubleStop: true });
            }
        }
    }

    if (!sb.isReplayingMotif) {
        if (sb.motifBuffer) {
            sb.motifBuffer.push({
                interval: selectedMidi - rootMidi,
                dur: durationMultiplier,
                step: cycleStep 
            });
            if (sb.motifBuffer.length > 32) sb.motifBuffer.shift();
        }
    }
    
    sb.lastFreq = getFrequency(selectedMidi);
    if (style === 'neo') timingOffset += (0.01 + Math.random() * 0.035) * 1000; 

    const resultNote = {
        midi: selectedMidi,
        velocity,
        durationSteps: durationMultiplier,
        bendStartInterval, 
        ccEvents: [],
        timingOffset: timingOffset / 1000,
        style,
        isDoubleStop: false
    };

    if (notes.length > 0 && sb.doubleStops) {
        // LEAD PRIORITIZATION: Return harmony notes first, then the lead note.
        // This ensures the lead note 'wins' in monophonic voice-stealing scenarios.
        return [...notes.map(n => ({...resultNote, ...n})), resultNote];
    }

    return resultNote;
}