import { getFrequency, getMidi } from './utils.js';
import { sb, cb, ctx, arranger } from './state.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';

/**
 * SOLOIST.JS
 * 
 * Advanced algorithmic improviser implementing Phrasing, Rhythmic Cells,
 * and Harmonic Targeting using a Strategy Pattern.
 */

// --- Constants & Configuration ---

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

const SEQUENCES = {
    'up3': { offsets: [0, 1, 2], nextBase: 1 },
    'down3': { offsets: [0, -1, -2], nextBase: -1 },
    'up4': { offsets: [0, 1, 2, 3], nextBase: 1 },
    'down4': { offsets: [0, -1, -2, -3], nextBase: -1 },
    'up3down1': { offsets: [0, 1, 2, 1], nextBase: 2 },
    'down3up1': { offsets: [0, -1, -2, -1], nextBase: -2 },
    'broken3rdsUp': { offsets: [0, 2, 1, 3], nextBase: 2 },
    'broken3rdsDown': { offsets: [0, -2, -1, -3], nextBase: -2 },
    'up4down2': { offsets: [0, 1, 2, 3, 1, 2, 3, 4], nextBase: 2 },
    'down4up2': { offsets: [0, -1, -2, -3, -1, -2, -3, -4], nextBase: -2 },
    'zigzag': { offsets: [0, 2, -1, 1], nextBase: 1 },
    'broken4ths': { offsets: [0, 3, 1, 4], nextBase: 2 },
    'groupsOf6': { offsets: [0, 1, 2, 3, 2, 1], nextBase: 3 },
};

/**
 * Centralized Style Configuration
 * Defines the "personality" of each soloing style.
 */
const STYLE_CONFIG = {
    scalar: {
        restProb: (intensity) => 0.4 - (intensity * 0.3),
        phraseBase: (intensity) => 8 + Math.floor(intensity * 12),
        registerSoar: 7,
        cells: [0, 2, 10], // Simple, structured
        velocityNoise: 0.1,
        sequenceProb: 0.25,
        bendProb: 0.12,
        doubleStopProb: 0,
        patternModeProb: 0.4 // Chance of 'scale' vs 'arp'
    },
    shred: {
        restProb: () => 0.15, // Shredders don't breathe
        phraseBase: (intensity) => 16 + Math.floor(intensity * 12),
        registerSoar: 14, // Climbs high
        cells: [1, 1, 4], // Mostly 16ths
        velocityNoise: 0.2,
        sequenceProb: 0.25,
        bendProb: 0.04,
        doubleStopProb: 0,
        patternModeProb: 0.1 // Mostly Arps (90%)
    },
    blues: {
        restProb: (intensity) => 0.4 - (intensity * 0.3),
        phraseBase: (intensity) => 8 + Math.floor(intensity * 12),
        registerSoar: 7,
        cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // Full variety
        velocityNoise: 0.1,
        sequenceProb: 0.15,
        bendProb: 0.25,
        doubleStopProb: 0.25,
        patternModeProb: 0.5
    },
    neo: {
        restProb: (intensity) => 0.5 - (intensity * 0.2), // Laid back
        phraseBase: (intensity) => 8 + Math.floor(intensity * 12),
        registerSoar: 7,
        cells: [6, 10, 0], // Syncopated
        velocityNoise: 0.25,
        sequenceProb: 0.15,
        bendProb: 0.3,
        doubleStopProb: 0.35,
        patternModeProb: 0.5
    },
    minimal: {
        restProb: (intensity) => 0.65 - (intensity * 0.4), // Lots of space
        phraseBase: (intensity) => 6 + Math.floor(intensity * 12),
        registerSoar: 10, // Gilmour-esque highs
        cells: [2, 0, 10, 8], // Sparse
        velocityNoise: 0.3, // High dynamic range
        sequenceProb: 0.15,
        bendProb: 0.12, // Lower prob, but high impact logic below
        doubleStopProb: 0.35,
        patternModeProb: 0.0 // Always Arp/Chord tones
    },
    bird: {
        restProb: (intensity) => (ctx.bpm > 150 ? 0.45 : 0.25) - (intensity * 0.2),
        phraseBase: (intensity) => (ctx.bpm > 150 ? 12 : 24) + Math.floor(intensity * (ctx.bpm > 150 ? 8 : 12)),
        registerSoar: 5, // Contained range
        cells: [3, 5, 4, 7, 0, 10], // Bebop vocabulary
        velocityNoise: 0.1,
        sequenceProb: 0.15,
        bendProb: 0.12,
        doubleStopProb: 0,
        patternModeProb: 0.4
    }
};

// --- Helper Functions ---

/**
 * Finds a note in the scale based on a starting midi note and a relative scale offset.
 */
function getScaleNote(midi, list, offset) {
    if (!list || list.length === 0) return midi;

    const targetPC = midi % 12;
    let bestIdx = 0;
    let minDiff = 100;
    const normalizedList = list.map(n => n % 12);
    
    for (let i = 0; i < normalizedList.length; i++) {
        let diff = Math.abs(normalizedList[i] - targetPC);
        if (diff > 6) diff = 12 - diff;
        if (diff < minDiff) {
            minDiff = diff;
            bestIdx = i;
        }
    }
    
    const baseNoteInList = list[bestIdx];
    const octaveCorrection = Math.round((midi - baseNoteInList) / 12) * 12;
    const len = list.length;
    let targetIndex = bestIdx + offset;
    const octaveShift = Math.floor(targetIndex / len);
    const wrappedIndex = ((targetIndex % len) + len) % len;
    
    return list[wrappedIndex] + octaveCorrection + (octaveShift * 12);
}

/**
 * Determines harmonic scale based on chord quality and style.
 */
function getScaleForChord(chord, style, nextChord) {
    const isV7toMinor = chord.intervals.includes(10) && chord.intervals.includes(4) && 
                        nextChord && ['minor', 'dim', 'halfdim'].includes(nextChord.quality);

    if (style === 'blues') {
        if (['minor', 'halfdim', 'dim'].includes(chord.quality)) return [0, 3, 5, 6, 7, 10];
        const scale = [0, 2, 3, 4, 7, 9];
        if (chord.intervals.includes(10)) scale.push(10);
        return scale;
    }

    if (style === 'neo') {
        if (['minor', 'halfdim'].includes(chord.quality)) return [0, 2, 3, 5, 7, 10];
        return [0, 2, 4, 6, 7, 9, 11]; // Lydian
    }

    if (style === 'bird') {
        if (chord.intervals.includes(10)) {
            if (isV7toMinor) return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant
            return [0, 2, 4, 5, 7, 9, 10, 11]; // Dominant Bebop
        }
        if (chord.quality === 'halfdim') return [0, 1, 2, 3, 5, 6, 8, 10];
        if (chord.quality === 'minor') return [0, 2, 3, 4, 5, 7, 9, 10];
        return [0, 2, 4, 5, 7, 8, 9, 11]; // Major Bebop
    }

    if (isV7toMinor && (style === 'scalar' || style === 'shred')) {
        return [0, 1, 4, 5, 7, 8, 10];
    }

    const keyRoot = KEY_ORDER.indexOf(arranger.key);
    const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
    const keyNotes = keyIntervals.map(i => (keyRoot + i) % 12);
    const chordRoot = chord.rootMidi % 12;
    const chordTones = chord.intervals.map(i => (chordRoot + i) % 12);
    const isDiatonic = chordTones.every(note => keyNotes.includes(note));
    
    if (isDiatonic) {
        return keyNotes.map(note => (note - chordRoot + 12) % 12).sort((a, b) => a - b);
    }

    // Fallbacks
    switch (chord.quality) {
        case 'minor': return [0, 2, 3, 5, 7, 8, 10]; 
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'maj7': return [0, 2, 4, 5, 7, 9, 11];
        default: return chord.intervals.includes(10) ? [0, 2, 4, 5, 7, 9, 10] : [0, 2, 4, 5, 7, 9, 11];
    }
}

function handleBebopEnclosure(style, chordTones, minMidi, maxMidi) {
    if (style === 'bird' && Math.random() < 0.25 && !sb.enclosureNotes) {
        const target = chordTones[Math.floor(Math.random() * chordTones.length)];
        let m = target;
        while (m < minMidi) m += 12;
        while (m > maxMidi) m -= 12;
        sb.enclosureNotes = [m + 1, m - 1, m]; // Above -> Below -> Target
        sb.enclosureIndex = 0;
    }
}

function getSafeMidi(candidate, currentChord, scaleIntervals, minMidi, maxMidi, direction) {
    // Avoid dissonant "avoid notes" on strong beats
    const intervalFromRoot = (candidate - currentChord.rootMidi + 120) % 12;
    const hasMaj3 = currentChord.intervals.includes(4);
    const hasP5 = currentChord.intervals.includes(7);
    
    const isAvoid11 = hasMaj3 && intervalFromRoot === 5;
    const isAvoidMaj7 = (currentChord.quality === 'dom' && intervalFromRoot === 11);
    const isAvoidMin3 = hasMaj3 && intervalFromRoot === 3 && currentChord.quality !== '7#9'; 
    const isAvoidb5 = hasP5 && intervalFromRoot === 6; // Context aware elsewhere

    if (isAvoid11 || isAvoidMaj7 || isAvoidMin3 || isAvoidb5) {
        let safeMidi = candidate + direction;
        let attempts = 0;
        while (attempts < 12) {
            const d = (safeMidi - currentChord.rootMidi + 120) % 12;
            const isStillMin3 = hasMaj3 && d === 3;
            if (scaleIntervals.includes(d) && d !== 5 && d !== 11 && !isStillMin3 && safeMidi <= maxMidi && safeMidi >= minMidi) {
                return safeMidi;
            }
            safeMidi += direction;
            attempts++;
        }
    }
    return candidate;
}

// --- Main Generator Function ---

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 77, style = 'scalar', stepInChord = 0, bassFreq = null) {
    if (!currentChord) return null;

    // Harmonic Reset
    if (stepInChord === 0) {
        sb.currentLick = null;
        sb.enclosureNotes = null;
        sb.busySteps = 0;
    }

    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }

    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = tsConfig.beats * tsConfig.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % tsConfig.stepsPerBeat;

    // --- Intensity & Register ---
    const loopStep = step % (arranger.totalSteps || 1);
    let sectionStart = 0;
    let sectionEnd = arranger.totalSteps;
    const currentSectionId = currentChord.sectionId;
    
    // Calculate intensity based on section progress
    for (const s of arranger.stepMap) {
        if (s.chord.sectionId === currentSectionId) {
            sectionStart = s.start;
            break;
        }
    }
    for (let i = arranger.stepMap.length - 1; i >= 0; i--) {
        if (arranger.stepMap[i].chord.sectionId === currentSectionId) {
            sectionEnd = arranger.stepMap[i].end;
            break;
        }
    }
    
    const sectionLength = Math.max(1, sectionEnd - sectionStart);
    const progressInSection = Math.max(0, Math.min(1, (loopStep - sectionStart) / sectionLength));
    const intensity = progressInSection;
    const dynamicCenterMidi = centerMidi + Math.floor(intensity * config.registerSoar);

    // --- Pitch Bounds ---
    const minMidi = dynamicCenterMidi - (style === 'shred' ? 24 : 18);
    const maxMidi = Math.min(dynamicCenterMidi + (style === 'shred' ? 30 : 24), 91);
    const prevMidi = prevFreq ? getMidi(prevFreq) : dynamicCenterMidi;
    const rootMidi = currentChord.rootMidi;
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord, style, nextChord);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    // --- Phrasing Logic ---
    if (measureStep === 0 || sb.phraseSteps <= 0) {
        let restProb = config.restProb(intensity);
        if (ctx.bpm > 160) restProb += 0.15; // Breathe more at high tempos

        if (!sb.isResting && Math.random() < restProb) {
            sb.isResting = true;
            sb.phraseSteps = (style === 'bird' && ctx.bpm > 150 ? 4 : 4) + Math.floor(Math.random() * 8);
            sb.currentLick = null;
            sb.sequenceType = null;
        } else {
            sb.isResting = false;
            let phraseBase = config.phraseBase(intensity);
            if (ctx.bpm > 160) phraseBase = Math.min(phraseBase, 8);
            
            sb.phraseSteps = phraseBase + Math.floor(Math.random() * 16);
            if (ctx.bpm > 160) sb.phraseSteps = Math.min(sb.phraseSteps, 12);

            sb.patternMode = Math.random() < config.patternModeProb ? 'scale' : 'arp';
            sb.sequenceType = null;
            sb.currentLick = null;
        }
    }
    sb.phraseSteps--;

    if (sb.isResting) return null;

    // --- Rhythm Selection ---
    if (stepInBeat === 0) {
        let cellPool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));
        
        // Tempo checks
        if (ctx.bpm >= 150) cellPool = cellPool.filter((_, idx) => ![1, 3, 4, 5, 7, 9].includes(idx));
        else if (ctx.bpm >= 120) cellPool = cellPool.filter((_, idx) => ![1].includes(idx));
        
        // Add 16ths back for Bird at low tempos
        if (style === 'bird' && ctx.bpm < 150) cellPool.push([1, 1, 1, 1]);

        // Default if pool empty
        if (cellPool.length === 0) cellPool = [[1, 0, 1, 0]];

        // Motivic Development
        const isNewPhrase = measureStep === 0 || sb.phraseSteps >= 20;
        if (isNewPhrase && !sb.motifCell) {
            sb.motifCell = cellPool[Math.floor(Math.random() * cellPool.length)];
            sb.motifCounter = (style === 'blues' ? 4 : 2) + Math.floor(Math.random() * 3);
            sb.currentCell = sb.motifCell;
        } else if (sb.motifCounter > 0) {
            sb.motifCounter--;
            // Call (same) or Response (variation)
            if (Math.random() < 0.7) {
                sb.currentCell = sb.motifCell;
            } else {
                const variation = [...sb.motifCell];
                const flipIdx = Math.floor(Math.random() * 4);
                variation[flipIdx] = variation[flipIdx] === 1 ? 0 : 1;
                sb.currentCell = variation;
            }
            if (sb.motifCounter === 0 && Math.random() < 0.5) sb.motifCell = null;
        } else {
            sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
            if (Math.random() < 0.2) {
                sb.motifCell = sb.currentCell;
                sb.motifCounter = 2;
            }
        }
    }

    if (sb.currentCell[stepInBeat] === 0) return null;

    // --- Note Selection ---
    let finalMidi = prevMidi;
    let isGraceNote = false;
    let durationMultiplier = 1;

    // 1. Enclosures (Bebop)
    handleBebopEnclosure(style, chordTones, minMidi, maxMidi);
    
    if (sb.enclosureNotes) {
        finalMidi = sb.enclosureNotes[sb.enclosureIndex];
        sb.enclosureIndex++;
        if (sb.enclosureIndex >= sb.enclosureNotes.length) sb.enclosureNotes = null;
        return { freq: getFrequency(finalMidi), durationMultiplier: 1, style };
    }

    // 2. Sequences (Math)
    if (!sb.sequenceType && Math.random() < config.sequenceProb) {
        const keys = Object.keys(SEQUENCES);
        sb.sequenceType = keys[Math.floor(Math.random() * keys.length)];
        sb.sequenceIndex = 0;
        let startMidi = prevMidi;
        while (startMidi > maxMidi - 12) startMidi -= 12;
        while (startMidi < minMidi + 12) startMidi += 12;
        sb.sequenceBaseMidi = startMidi;
    }

    if (sb.sequenceType) {
        const seq = SEQUENCES[sb.sequenceType];
        const offset = seq.offsets[sb.sequenceIndex];
        const list = (sb.patternMode === 'arp' || (style === 'shred' && Math.random() < 0.7)) ? chordTones : scaleTones;
        
        // Diatonic snap for base
        if (style === 'scalar' || style === 'shred') {
            const normBase = sb.sequenceBaseMidi % 12;
            if (!scaleIntervals.some(i => (rootMidi + i) % 12 === normBase)) {
                 // Snap to nearest
                 let best = sb.sequenceBaseMidi, minD = 13;
                 scaleTones.forEach(t => {
                     let m = t;
                     while (m < sb.sequenceBaseMidi - 6) m += 12;
                     while (m > sb.sequenceBaseMidi + 6) m -= 12;
                     if (Math.abs(m - sb.sequenceBaseMidi) < minD) { minD = Math.abs(m - sb.sequenceBaseMidi); best = m; }
                 });
                 sb.sequenceBaseMidi = best;
            }
        }

        finalMidi = getScaleNote(sb.sequenceBaseMidi, list, offset);
        sb.sequenceIndex++;
        
        if (sb.sequenceIndex >= seq.offsets.length) {
            sb.sequenceIndex = 0;
            sb.sequenceBaseMidi = getScaleNote(sb.sequenceBaseMidi, list, seq.nextBase);
            if (Math.random() < 0.25 || sb.sequenceBaseMidi > maxMidi || sb.sequenceBaseMidi < minMidi) sb.sequenceType = null;
        }

        durationMultiplier = (style === 'shred') ? 1 : 2;
        sb.busySteps = durationMultiplier - 1;
        while (finalMidi > maxMidi) finalMidi -= 12;
        while (finalMidi < minMidi) finalMidi += 12;
        
        return { freq: getFrequency(finalMidi), durationMultiplier, style };
    }

    // 3. Standard Melodic Generation
    if (style === 'blues' && Math.random() < 0.25 && stepInBeat !== 0) isGraceNote = true;

    // Change direction / targeting
    const isApproachingChange = measureStep >= (stepsPerMeasure - tsConfig.stepsPerBeat) && nextChord && nextChord !== currentChord;
    if (isApproachingChange && Math.random() < 0.7) {
        // Target next chord tone
        const nextRoot = nextChord.rootMidi;
        const targetIntervals = [nextChord.intervals[1], nextChord.intervals[nextChord.intervals.length-1]];
        const targets = targetIntervals.map(i => {
            let m = nextRoot + i;
            while (m < minMidi) m += 12;
            while (m > maxMidi) m -= 12;
            return m;
        });
        targets.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
        finalMidi = targets[0];
        if (style !== 'scalar' && style !== 'shred') {
             // Decorate target
             if (targets[0] > prevMidi) finalMidi = prevMidi + (Math.random() < 0.5 ? 1 : 2);
             else if (targets[0] < prevMidi) finalMidi = prevMidi - (Math.random() < 0.5 ? 1 : 2);
        }
    } else {
        if (sb.patternSteps <= 0) {
            sb.patternSteps = (style === 'shred' ? 8 : 2) + Math.floor(Math.random() * 6);
            if (prevMidi > maxMidi - 10) sb.direction = -1;
            else if (prevMidi < minMidi + 10) sb.direction = 1;
            else sb.direction = Math.random() > 0.5 ? 1 : -1;
        }
        sb.patternSteps--;

        const findNext = (current, list, dir) => {
            let candidates = [];
            const baseShift = Math.floor((current - list[0]) / 12) * 12;
            for (let o = -1; o <= 1; o++) {
                const octaveOffset = baseShift + (o * 12);
                for (let i = 0; i < list.length; i++) {
                     const candidate = list[i] + octaveOffset;
                     if (dir > 0 && candidate > current && candidate <= maxMidi) candidates.push(candidate);
                     else if (dir < 0 && candidate < current && candidate >= minMidi) candidates.push(candidate);
                }
            }
            if (candidates.length > 0) {
                candidates.sort((a, b) => dir > 0 ? a - b : b - a);
                const idx = (Math.random() < 0.3 && candidates.length > 1) ? 1 : 0;
                return candidates[idx];
            }
            sb.direction *= -1;
            return current;
        };

        if (sb.patternMode === 'arp') finalMidi = findNext(prevMidi, chordTones, sb.direction);
        else finalMidi = findNext(prevMidi, scaleTones, sb.direction);
    }

    if (isGraceNote) finalMidi -= 1;

    // --- Safety & Articulation ---
    
    // Safety
    if (stepInBeat === 0 || stepInBeat === 2) {
        finalMidi = getSafeMidi(finalMidi, currentChord, scaleIntervals, minMidi, maxMidi, sb.direction);
    }
    
    // Bass Dissonance Avoidance
    if (bassFreq && (step % 4 === 0)) {
        const bassMidi = getMidi(bassFreq);
        if ((finalMidi - bassMidi + 120) % 12 === 1) finalMidi += (sb.direction || 1);
    }

    // Range Clamp
    while (finalMidi > maxMidi) { finalMidi -= 12; sb.direction = -1; }
    while (finalMidi < minMidi) { finalMidi += 12; sb.direction = 1; }

    // Velocity & Dynamics
    let velocity = 1.0 + (intensity * 0.2);
    if (stepInBeat === 0) velocity *= (measureStep === 0 ? 1.2 : 1.1);
    else if (stepInBeat === 2) velocity *= 1.05;
    else velocity *= 0.85 + Math.random() * 0.1;
    
    if (style === 'minimal') {
        velocity = (Math.random() < 0.3 ? 0.6 : 1.1) + (Math.random() * config.velocityNoise - (config.velocityNoise/2));
    } else {
        velocity *= (1.0 - config.velocityNoise/2) + Math.random() * config.velocityNoise;
    }
    if (style === 'neo' && stepInBeat !== 0 && !isGraceNote && Math.random() < 0.25) {
        isGraceNote = true;
        velocity *= 0.5; // Ghost note
    }

    // Bends
    let bendStartInterval = 0;
    const isTarget = chordTones.some(t => (t % 12) === (finalMidi % 12));
    const isLongNote = (style === 'shred' && durationMultiplier > 4) || style === 'minimal' || sb.phraseSteps <= 0;
    
    if (Math.random() < config.bendProb && (isTarget || isLongNote)) {
        if (style === 'neo') bendStartInterval = Math.random() > 0.4 ? 1 : 2;
        else if (style === 'blues') {
             const intervalFromRoot = (finalMidi - rootMidi + 120) % 12;
             if (intervalFromRoot === 7) bendStartInterval = 2;
             else if (intervalFromRoot === 4) bendStartInterval = 1;
             else if (intervalFromRoot === 0) bendStartInterval = 2;
             else bendStartInterval = Math.random() > 0.5 ? 2 : 1;
        } else if (style === 'minimal') {
             const r = Math.random();
             if (r < 0.4) bendStartInterval = 2;
             else if (r < 0.7) bendStartInterval = 1;
             else bendStartInterval = 0.5;
        } else {
             bendStartInterval = 1;
        }
    }

    // Duration Logic
    if (style === 'minimal') {
        if (Math.random() < 0.6) durationMultiplier = 4 + Math.floor(Math.random() * 8);
        else durationMultiplier = 2;
    } else if (style === 'shred' && sb.phraseSteps <= 1 && !sb.isResting) {
        if (Math.random() < 0.8) durationMultiplier = 8 + Math.floor(Math.random() * 8);
    } else if (style === 'neo' && isLongNote && Math.random() < 0.3) {
        durationMultiplier = 4 + Math.floor(Math.random() * 4);
    }
    if (style === 'blues' && durationMultiplier > 1 && Math.random() < 0.6) durationMultiplier = 1; // Staccato

    sb.busySteps = durationMultiplier - 1;

    // Double/Triple Stops
    let extraFreq = null, extraMidi = null, extraFreq2 = null, extraMidi2 = null;
    if (config.doubleStopProb > 0 && Math.random() < config.doubleStopProb && !isGraceNote && !sb.sequenceType) {
        let offset = -3;
        if (style === 'blues') offset = [-2, -3, -4][Math.floor(Math.random() * 3)];
        else if (style === 'minimal') offset = Math.random() > 0.5 ? -3 : -4;
        
        extraMidi = getScaleNote(finalMidi, scaleTones, offset);
        
        if (style === 'neo' && Math.random() < 0.3) {
             extraMidi2 = getScaleNote(extraMidi, scaleTones, -3); // Cluster
             if (extraMidi2 !== extraMidi && extraMidi2 >= minMidi) extraFreq2 = getFrequency(extraMidi2);
             else extraMidi2 = null;
        }
        
        if (extraMidi !== finalMidi && extraMidi >= minMidi) extraFreq = getFrequency(extraMidi);
        else extraMidi = null;
    }

    return {
        freq: getFrequency(finalMidi),
        midi: finalMidi,
        extraFreq,
        extraMidi,
        extraFreq2,
        extraMidi2,
        durationMultiplier,
        bendStartInterval,
        velocity,
        style
    };
}
