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
    [0, 1, 0, 1], // 10: Pure offbeats
];

const STYLE_CONFIG = {
    scalar: {
        restBase: 0.1, // Reduced for less sparsity
        restGrowth: 0.02, // Slower rest growth for longer phrases
        cells: [0, 1, 2], // Focused on 8ths (0), 16ths (1), and Quarters (2) for flow
        registerSoar: 7,
        tensionScale: 0.6, 
        timingJitter: 15
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

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 72, style = 'scalar', stepInChord = 0, bassFreq = null) {
    if (!currentChord) return null;

    if (style === 'smart') {
        if (arranger.lastChordPreset === 'Minor Blues') {
            style = 'blues';
        } else {
            const mapping = { 'Rock': 'shred', 'Jazz': 'bird', 'Funk': 'blues', 'Blues': 'blues', 'Neo-Soul': 'neo' };
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
    
    // --- 1. Cycle & Tension Tracking ---
    
    // Dynamic Cycle length: Match progression if short, else default to 4
    const progressionBars = arranger.progression.length / stepsPerMeasure;
    const CYCLE_BARS = (progressionBars > 0 && progressionBars <= 8) ? progressionBars : 4;
    const stepsPerCycle = stepsPerMeasure * CYCLE_BARS;
    const cycleStep = step % stepsPerCycle;
    
    // Ramp up tension towards the end of the cycle
    const measureIndex = Math.floor(cycleStep / stepsPerMeasure);
    let baseTension = (measureIndex / CYCLE_BARS); 
    
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
    const tempoBreathFactor = Math.max(0, (ctx.bpm - 120) * 0.003); 
    
    // Intensity Scaling: High intensity = fewer rests (more aggressive playing)
    let restProb = (config.restBase * (1.5 - intensity)) + (phraseLengthBars * config.restGrowth) + tempoBreathFactor;
    restProb = Math.max(0.05, restProb);
    
    // Force resolve/breath at end of cycle?
    if (cycleStep > stepsPerCycle - 4) restProb += 0.5;

    // If we are currently resting
    if (sb.isResting) {
        if (Math.random() < 0.4 + (intensity * 0.3)) { // Higher chance to restart phrase at high intensity
            sb.isResting = false;
            sb.currentPhraseSteps = 0;
            
            // Decision: Repeat a Hook or a Motif?
            const hasHook = sb.hookBuffer && sb.hookBuffer.length > 0;
            const hasMotif = sb.motifBuffer && sb.motifBuffer.length > 0;
            
            if ((hasHook || hasMotif) && Math.random() < 0.5) {
                sb.isReplayingMotif = true;
                // Prefer hook on short loops, motif on long ones
                const useHook = hasHook && (progressionBars <= 8 || Math.random() < 0.3);
                sb.activeBuffer = useHook ? sb.hookBuffer : sb.motifBuffer;
                sb.motifReplayIndex = 0;
            } else {
                sb.isReplayingMotif = false;
                // If we didn't replay, maybe move motif to hook if it was long enough
                if (hasMotif && sb.motifBuffer.length > 4 && Math.random() < sb.hookRetentionProb) {
                    sb.hookBuffer = [...sb.motifBuffer];
                }
                sb.motifBuffer = []; // Clear short-term memory
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
    let selectedMidi = null;

    // A. Motif/Hook Replay Logic (Position-Locked)
    if (sb.isReplayingMotif && sb.activeBuffer) {
        // Look for a note in the buffer that matches the current cycleStep
        const storedNote = sb.activeBuffer.find(n => n.step === cycleStep);
        if (storedNote) {
            shouldPlay = true;
            durationMultiplier = storedNote.dur;
            
            // SMART TRANSPOSITION & DEVELOPMENT
            const rootMidi = currentChord.rootMidi;
            let targetMidi = rootMidi + storedNote.interval;
            
            // "Development": 20% chance to shift scale degree
            if (Math.random() < 0.2) {
                const shift = Math.random() > 0.5 ? 1 : -1;
                targetMidi += shift; 
            }

            // Snap to scale
            const scaleIntervals = getScaleForChord(currentChord, style);
            const scaleTones = scaleIntervals.map(i => rootMidi + i);
            
            let bestMidi = targetMidi;
            let minDist = 100;
            for (let m = targetMidi - 6; m <= targetMidi + 6; m++) {
                if (scaleTones.some(s => (s % 12 + 12) % 12 === (m % 12 + 12) % 12)) {
                    const d = Math.abs(m - targetMidi);
                    if (d < minDist) { minDist = d; bestMidi = m; }
                }
            }
            selectedMidi = bestMidi;
        }
    }

    // B. Cell Selection (Rhythm) - strictly strictly only if NOT replaying
    // If we are replaying a motif, we must respect its silence (gaps) and not fill them with random cells
    if (!sb.isReplayingMotif && !selectedMidi && stepInBeat === 0) {
        // New beat, pick a cell
        let cellPool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));

        // SPEED GOVERNOR: At high tempos, 16th notes become unplayable/messy
        if (ctx.bpm > 140 && style !== 'shred') {
             cellPool = cellPool.filter((_, idx) => ![1, 3, 4, 7, 9].includes(idx));
             if (cellPool.length === 0) cellPool = [RHYTHMIC_CELLS[0]]; 
        }
        
        // Tension influence
        if (sb.tension > 0.7 && style === 'shred') cellPool = [RHYTHMIC_CELLS[1]]; 
        if (sb.tension < 0.3 && style === 'minimal') cellPool = [RHYTHMIC_CELLS[2]]; 
        
        sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
        
        // Humanize
        if (Math.random() < 0.1) sb.currentCell = [0, 0, 0, 0];
    }
    
    // Only trigger cell-based play if we are NOT replaying a motif
    if (!sb.isReplayingMotif && !selectedMidi && sb.currentCell[stepInBeat] === 1) shouldPlay = true;

    if (!shouldPlay) return null;


    // --- 4. Pitch Selection (Standard Weighted Generation) ---

    const rootMidi = currentChord.rootMidi;

    if (!selectedMidi) {
        const chordTones = currentChord.intervals.map(i => rootMidi + i);
        const scaleIntervals = getScaleForChord(currentChord, style);
        const scaleTones = scaleIntervals.map(i => rootMidi + i);
        
        // Use the style-specific 'registerSoar' value scaled by Intensity
        const soarAmount = config.registerSoar * (0.5 + intensity); // e.g. 5 * 1.5 = 7.5
        const dynamicCenter = centerMidi + Math.floor(sb.tension * soarAmount);
        
        const minMidi = dynamicCenter - 15; // Reduced range
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

            // Vocal Range Gravity: Prefer the "meat" of the range
            // Penalize upper register to use it sparingly
            if (m > centerMidi + 7) weight -= 4;
            if (m > centerMidi + 12) weight -= 10;

            // Beat Strength & "Sweet Notes"
            if (isStrongBeat) {
                if (isChordTone) {
                    weight += 10;
                    // Target the 3rd on the Downbeat (Sweetness)
                    if (beatInMeasure === 0 && (interval === 3 || interval === 4)) {
                        weight += 15; 
                    }
                } else {
                    // HARMONIC SIEVE: Filter out "Avoid Notes" on strong beats
                    // These are notes that are "in the scale" but clash horribly with chord tones
                    let isClash = false;
                    
                    const isDominant = currentChord.intervals.includes(10) && currentChord.intervals.includes(4);
                    const isMajorLike = ['major', 'maj7'].includes(currentChord.quality) || isDominant;
                    
                    // 1. Avoid 4th (5 semitones) on Major/Dominant chords (Clashes with 3rd)
                    if (isMajorLike && interval === 5) isClash = true;

                    // 2. Avoid b6 (8 semitones) on Minor chords (Clashes with 5th)
                    if (currentChord.quality === 'minor' && interval === 8) isClash = true;

                    // 3. Avoid b2 (1 semitone) generally (unless altered context)
                    if (interval === 1) isClash = true;

                    if (isClash) {
                        weight -= 50; // Hard Veto: Overpowers stepwise bonus
                    } else {
                        weight -= 5; // Soft Penalty: "Tensions" (9, 13) are okay-ish
                    }
                }
            } else {
                if (!isChordTone) weight += 2; 
            }

            // Tension
            if (sb.tension > 0.8) {
                if (!isChordTone && isScaleTone) weight += 5;
            } else if (sb.tension < 0.2) {
                if (interval === 0 || interval === 7) weight += 8;
            }
            
            // Proximity & Melodic Flow
            const dist = Math.abs(m - lastMidi);
            
            if (dist === 0) weight -= 5; // Avoid same note repeated too much
            
            // Step-wise is VERY good (1-2 semi) - Primary movement
            if (dist > 0 && dist <= 2) {
                weight += 15;
                if (style === 'scalar') weight += 20; // Strong bias for smooth lines in scalar mode
            } 
            
            // Small Skips (3rds, 4ths) - Secondary movement
            if (dist >= 3 && dist <= 5) {
                weight += 4;
            }
            
            // Musical Skips (5ths, 6ths) - Use sparingly
            if (dist > 5 && dist <= 9) {
                if (Math.random() < 0.3) weight += 2;
                else weight -= 2;
            }

            // Penalize large leaps heavily
            if (dist > 9) weight -= 20;

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
            selectedMidi = chordTones[0];
            while (selectedMidi < minMidi) selectedMidi += 12;
            while (selectedMidi > maxMidi) selectedMidi -= 12;
        }
    }


    // --- 5. Articulation & Humanization ---
    
    // A. Blue Note Curls & Scoops
    let bendStartInterval = 0;
    const intervalFromRoot = (selectedMidi - rootMidi + 120) % 12;
    
    // 1. Target: Major 3rd (4) -> Curl from Minor 3rd
    if (intervalFromRoot === 4 && ['blues', 'neo', 'bird', 'minimal'].includes(style)) {
        if (Math.random() < 0.4) bendStartInterval = 1; 
    }
    
    // 2. Target: Perfect 5th (7) -> Curl from b5 (Blues only)
    if (intervalFromRoot === 7 && style === 'blues') {
         if (Math.random() < 0.3) bendStartInterval = 1; 
    }

    // 3. Target: Root (0) -> Soulful Scoop (Neo/Soul)
    if (intervalFromRoot === 0 && ['neo', 'bird', 'blues'].includes(style) && isStrongBeat) {
         if (Math.random() < 0.35) bendStartInterval = 0.5; // Quarter-tone scoop
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