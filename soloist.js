import { getFrequency, getMidi } from './utils.js';
import { sb, cb, ctx, arranger } from './state.js';
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
    [0, 1, 0, 1], // 10: Pure offbeats
];

const STYLE_CONFIG = {
    scalar: {
        restBase: 0.15,
        restGrowth: 0.05, // per bar of continuous playing
        cells: [0, 2, 10],
        registerSoar: 7,
        tensionScale: 0.5, // How much tension affects note choice
        timingJitter: 12
    },
    shred: {
        restBase: 0.05,
        restGrowth: 0.02,
        cells: [1, 1, 4, 3],
        registerSoar: 14,
        tensionScale: 0.2, // Shredders care less about tension, more about speed
        timingJitter: 5
    },
    blues: {
        restBase: 0.20,
        restGrowth: 0.08,
        cells: [0, 2, 3, 5, 6, 8],
        registerSoar: 7,
        tensionScale: 0.8, // Blues is all about tension/release
        timingJitter: 22
    },
    neo: {
        restBase: 0.25,
        restGrowth: 0.05,
        cells: [6, 10, 0, 9],
        registerSoar: 7,
        tensionScale: 0.6,
        timingJitter: 25
    },
    minimal: {
        restBase: 0.40,
        restGrowth: 0.15,
        cells: [2, 0, 10],
        registerSoar: 10,
        tensionScale: 0.9,
        timingJitter: 35
    },
    bird: {
        restBase: 0.15,
        restGrowth: 0.06,
        cells: [3, 5, 4, 7, 0, 10],
        registerSoar: 5,
        tensionScale: 0.7,
        timingJitter: 15
    }
};

// --- Helpers ---

function getScaleForChord(chord, style) {
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const isDominant = chord.intervals.includes(10) && chord.intervals.includes(4);
    
    // 1. Tension High? Altered/Diminished
    if (sb.tension > 0.7 && isDominant) {
        return [0, 1, 3, 4, 6, 8, 10]; // Altered
    }

    // 2. Style Specifics
    if (style === 'blues') {
        if (['minor', 'halfdim', 'dim'].includes(chord.quality)) return [0, 3, 5, 6, 7, 10]; // Minor Blues
        return [0, 3, 4, 5, 7, 9, 10]; // Major Blues + b3
    }
    
    if (style === 'neo') {
        if (['maj7', 'major'].includes(chord.quality)) return [0, 2, 4, 6, 7, 9, 11]; // Lydian
    }

    // 3. Diatonic Fallback
    const keyRoot = KEY_ORDER.indexOf(arranger.key);
    const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
    const keyNotes = keyIntervals.map(i => (keyRoot + i) % 12);
    const chordRoot = chord.rootMidi % 12;
    const chordTones = chord.intervals.map(i => (chordRoot + i) % 12);
    const isDiatonic = chordTones.every(note => keyNotes.includes(note));
    
    if (isDiatonic) {
        return keyNotes.map(note => (note - chordRoot + 12) % 12).sort((a, b) => a - b);
    }

    // 4. Chord Scale Fallback
    switch (chord.quality) {
        case 'minor': return [0, 2, 3, 5, 7, 8, 10]; 
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'maj7': return [0, 2, 4, 5, 7, 9, 11];
        default: return chord.intervals.includes(10) ? [0, 2, 4, 5, 7, 9, 10] : [0, 2, 4, 5, 7, 9, 11];
    }
}

// --- Main Generator ---

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 77, style = 'scalar', stepInChord = 0, bassFreq = null) {
    if (!currentChord) return null;
    
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
    
    // --- 1. Cycle & Tension Tracking ---
    
    // Assuming 4-bar cycles for tension resolution
    const CYCLE_BARS = 4;
    const stepsPerCycle = stepsPerMeasure * CYCLE_BARS;
    const cycleStep = step % stepsPerCycle;
    
    // Ramp up tension in bar 4, release in bar 1
    const measureIndex = Math.floor(cycleStep / stepsPerMeasure);
    let baseTension = measureIndex * 0.25; 
    
    // Beat Strength: Strong on 1 & 3 (4/4)
    const isStrongBeat = (beatInMeasure === 0 || beatInMeasure === 2) && stepInBeat === 0;
    const isOffbeat = stepInBeat !== 0;

    if (isStrongBeat) baseTension -= 0.1;
    if (isOffbeat) baseTension += 0.1;
    
    sb.tension = Math.max(0, Math.min(1, baseTension));


    // --- 2. Breath & Phrasing Logic ---
    
    // Initialize phrase tracking if needed
    if (typeof sb.currentPhraseSteps === 'undefined') sb.currentPhraseSteps = 0;
    
    // Check for Breath (Start of new phrase?)
    const phraseLengthBars = sb.currentPhraseSteps / stepsPerMeasure;
    
    // Tempo Scaling: Faster tempo = measures fly by = need to breathe "sooner" in bar count
    // At 180 BPM, we add ~0.18 to the probability
    const tempoBreathFactor = Math.max(0, (ctx.bpm - 120) * 0.003); 
    
    let restProb = config.restBase + (phraseLengthBars * config.restGrowth) + tempoBreathFactor;
    
    // Force resolve/breath at end of cycle?
    if (cycleStep > stepsPerCycle - 4) restProb += 0.5;

    // If we are currently resting
    if (sb.isResting) {
        if (Math.random() < 0.4) { // Chance to start phrase
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            // Decision: Repeat Motif?
            if (sb.motifBuffer && sb.motifBuffer.length > 0 && Math.random() < 0.4) {
                sb.isReplayingMotif = true;
                sb.motifReplayIndex = 0;
            } else {
                sb.isReplayingMotif = false;
                sb.motifBuffer = []; // Clear buffer for new motif
            }
        } else {
            return null; // Continue resting
        }
    }

    // If we are playing, check if we should take a breath
    if (!sb.isResting && sb.currentPhraseSteps > 4 && Math.random() < restProb) {
        sb.isResting = true;
        sb.currentPhraseSteps = 0;
        sb.busySteps = 0;
        return null;
    }
    
    sb.currentPhraseSteps++;

    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }


    // --- 3. Rhythm Generation & Motif Replay ---

    let shouldPlay = false;
    let durationMultiplier = 1;
    let isMotifNote = false;
    let selectedMidi = null;

    // A. Motif Replay Logic
    if (sb.isReplayingMotif && sb.motifBuffer.length > 0) {
        // Try to find a note in the buffer that corresponds to this relative cycle position
        // The buffer stores { interval, dur, cyclePos }
        // We use a loose match logic
        const targetPos = cycleStep % 16; // Use simplified 1-bar cycle relative pos for now to allow looping
        
        // Find stored note close to this relative rhythmic position
        // We iterate through buffer to find the next valid note
        if (sb.motifReplayIndex < sb.motifBuffer.length) {
            const stored = sb.motifBuffer[sb.motifReplayIndex];
            // Simple sequential playback for now, assuming rhythm aligns
            // To make it rhythmically accurate, we'd need to store 'rests' in buffer too.
            // Let's rely on the Cell system for rhythm and just steal the Pitch/Interval.
            
            // Actually, for "Smart Transposition", we need to know IF we play now.
            // Let's stick to the Cell system for *when* to play, but use the Buffer for *what* to play.
        }
    }

    // B. Cell Selection (Rhythm)
    if (stepInBeat === 0) {
        // New beat, pick a cell
        let cellPool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));

        // SPEED GOVERNOR: At high tempos, 16th notes (cells with index 1, 3, 4, 7, 9) become unplayable/messy
        // Exception: Shredders love it.
        if (ctx.bpm > 140 && style !== 'shred') {
             // Filter out 16th-heavy cells
             cellPool = cellPool.filter((_, idx) => ![1, 3, 4, 7, 9].includes(idx));
             if (cellPool.length === 0) cellPool = [RHYTHMIC_CELLS[0]]; // Fallback to 8ths
        }
        
        // Tension influence
        if (sb.tension > 0.7 && style === 'shred') cellPool = [RHYTHMIC_CELLS[1]]; 
        if (sb.tension < 0.3 && style === 'minimal') cellPool = [RHYTHMIC_CELLS[2]]; 
        
        sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
        
        // Humanize
        if (Math.random() < 0.1) sb.currentCell = [0, 0, 0, 0];
    }
    
    if (sb.currentCell[stepInBeat] === 1) shouldPlay = true;

    if (!shouldPlay) return null;


    // --- 4. Pitch Selection (Harmonic Weighting & Smart Transposition) ---

    const rootMidi = currentChord.rootMidi;
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord, style);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);
    const dynamicCenter = centerMidi + Math.floor(sb.tension * 5);
    const minMidi = dynamicCenter - 18;
    const maxMidi = dynamicCenter + 18;
    const lastMidi = prevFreq ? getMidi(prevFreq) : dynamicCenter;


    // SMART TRANSPOSITION LOGIC
    if (sb.isReplayingMotif && sb.motifBuffer.length > sb.motifReplayIndex) {
        const stored = sb.motifBuffer[sb.motifReplayIndex];
        // Calculate target pitch based on stored interval relative to NEW root
        let targetMidi = rootMidi + stored.interval;
        
        // Snap to valid scale tone
        // Find closest scale tone
        let bestMidi = targetMidi;
        let minDist = 100;
        
        // Build full scale range
        const fullScale = [];
        for (let m = minMidi - 12; m <= maxMidi + 12; m++) {
            if (scaleTones.some(s => s % 12 === m % 12)) fullScale.push(m);
        }
        
        fullScale.forEach(m => {
            const d = Math.abs(m - targetMidi);
            if (d < minDist) { minDist = d; bestMidi = m; }
        });
        
        selectedMidi = bestMidi;
        sb.motifReplayIndex = (sb.motifReplayIndex + 1) % sb.motifBuffer.length;
        isMotifNote = true;
    } 
    
    if (!selectedMidi) {
        // Standard Weighted Generation
        let candidates = [];
        
        for (let m = minMidi; m <= maxMidi; m++) {
            const pc = m % 12;
            const rootPC = rootMidi % 12;
            const interval = (pc - rootPC + 12) % 12;
            
            let weight = 1.0;
            
            const isChordTone = chordTones.some(ct => ct % 12 === pc);
            const isScaleTone = scaleTones.some(st => st % 12 === pc);
            
            if (!isScaleTone) continue; 

            // Beat Strength
            if (isStrongBeat) {
                if (isChordTone) weight += 10;
                else weight -= 5;
            } else {
                if (!isChordTone) weight += 2; 
            }

            // Tension
            if (sb.tension > 0.8) {
                if (!isChordTone && isScaleTone) weight += 5;
            } else if (sb.tension < 0.2) {
                if (interval === 0 || interval === 7) weight += 8;
            }
            
            // Proximity
            const dist = Math.abs(m - lastMidi);
            if (dist > 12) weight -= 10; 
            if (dist === 0) weight -= 5; 
            if (dist < 5) weight += 5; 

            candidates.push({ midi: m, weight: Math.max(0.1, weight) });
        }

        // Selection
        let totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
        let randomVal = Math.random() * totalWeight;
        selectedMidi = lastMidi;
        
        for (const cand of candidates) {
            randomVal -= cand.weight;
            if (randomVal <= 0) {
                selectedMidi = cand.midi;
                break;
            }
        }
        
        // Force Root on Cycle Reset
        if (cycleStep === 0 && isStrongBeat) {
            let closest = chordTones[0];
            let minDist = 100;
            chordTones.forEach(ct => {
                let m = ct;
                while (m < minMidi) m += 12;
                while (m > maxMidi) m -= 12;
                let d = Math.abs(m - lastMidi);
                if (d < minDist) { minDist = d; closest = m; }
            });
            selectedMidi = closest;
        }
    }


    // --- 5. Articulation & Humanization ---
    
    // A. Blue Note Curls
    let bendStartInterval = 0;
    const intervalFromRoot = (selectedMidi - rootMidi + 120) % 12;
    
    // Target is Major 3rd (4)
    if (intervalFromRoot === 4 && ['blues', 'neo', 'bird', 'minimal'].includes(style)) {
        // 40% chance to curl up from Minor 3rd
        if (Math.random() < 0.4) {
            bendStartInterval = 1; // Start 1 semitone lower (Minor 3rd)
        }
    }

    // B. Dynamic Arcs (Storytelling Velocity)
    // Parabolic curve: Start med, peak high, end low
    // Phrase progress approx 0 to ~16 (typical phrase length)
    // Normalize to 0-1 assuming 32 step max phrase
    const phraseProg = Math.min(1, sb.currentPhraseSteps / 32);
    const arch = Math.sin(phraseProg * Math.PI); // 0 -> 1 -> 0
    
    let baseVel = 0.7;
    let dynRange = 0.3;
    if (style === 'minimal') { baseVel = 0.5; dynRange = 0.5; }
    
    let velocity = baseVel + (arch * dynRange);
    
    // Add randomness
    velocity += (Math.random() - 0.5) * 0.1;
    
    // Accent strong beats
    if (isStrongBeat) velocity *= 1.1;


    // C. Micro-Timing
    const timingOffset = (Math.random() - 0.5) * config.timingJitter;

    // D. Duration
    if (style === 'minimal') {
        durationMultiplier = Math.random() < 0.3 ? 2 : 1;
    }
    sb.busySteps = durationMultiplier - 1;

    // --- 6. Update State & Motif Buffer ---
    
    // Record to buffer if NOT replaying (to build new motif)
    // We store the INTERVAL relative to root, not absolute pitch
    if (!sb.isReplayingMotif) {
        if (sb.motifBuffer) {
            sb.motifBuffer.push({
                interval: selectedMidi - rootMidi, // Key for smart transposition
                dur: durationMultiplier,
                step: cycleStep 
            });
            if (sb.motifBuffer.length > 32) sb.motifBuffer.shift();
        }
    }
    
    sb.lastFreq = getFrequency(selectedMidi);

    return {
        freq: sb.lastFreq,
        midi: selectedMidi,
        durationMultiplier,
        velocity,
        timingOffset,
        bendStartInterval, // Trigger the curl
        style,
        tension: sb.tension
    };
}