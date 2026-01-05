import { getFrequency, getMidi } from './utils.js';
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
    [1, 1, 0, 1], // Bebop-esque 1
    [0, 1, 1, 0], // Offbeat syncopation
];

const CANNED_LICKS = {
    'the_lick': [2, 3, 5, 7, 3, 10, 12], // 2 b3 4 5 b3 b7 1
    'blues_1': [12, 15, 12, 10, 9, 7], // 1 b3 1 b7 6 5
    'rock_1': [0, 3, 5, 5, 3, 0],      // 1 b3 4 4 b3 1
    'bebop_1': [7, 6, 5, 4, 3, 2, 1, 0], // 5 b5 4 3 b3 2 b2 1
    'bird_1': [12, 11, 10, 9, 8, 7, 5, 4, 2, 0], // Chromatic descent to root
    'bird_2': [0, 4, 7, 11, 14, 12], // Arp up to 9th, then root
    'bird_3': [7, 8, 9, 10, 11, 12], // Chromatic approach to root from 5th
    'bird_4': [4, 5, 6, 7, 11, 12], // 3 4 #4 5 7 1
    'shred_1': [0, 4, 7, 12, 16, 19, 24, 19, 16, 12, 7, 4], // Major Arp Sweep
};

/**
 * Generates an enclosure pattern (group of notes surrounding a target).
 * @param {number} targetMidi 
 * @param {number[]} scaleTones 
 * @returns {number[]} relative to targetMidi
 */
function getEnclosure(targetMidi, scaleTones) {
    const type = Math.random();
    if (type < 0.4) {
        // Chromatic: Half step above, half step below, target
        return [1, -1, 0];
    } else if (type < 0.7) {
        // Scale step above, half step below, target
        let above = 2;
        for (let t of scaleTones) {
            let m = t;
            while (m < targetMidi) m += 12;
            if (m > targetMidi && m < targetMidi + 4) {
                above = m - targetMidi;
                break;
            }
        }
        return [above, -1, 0];
    } else {
        // Double chromatic from above: +2, +1, target
        return [2, 1, 0];
    }
}


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
 * Finds a note in the scale based on a starting midi note and a relative scale offset.
 * Optimized to avoid creating large arrays.
 */
function getScaleNote(midi, list, offset) {
    if (!list || list.length === 0) return midi;

    // 1. Find the best matching index in the source list (based on PC)
    const targetPC = midi % 12;
    let bestIdx = 0;
    let minDiff = 100;
    
    // Create a normalized 0-11 list from the input list for comparison
    const normalizedList = list.map(n => n % 12);
    
    for (let i = 0; i < normalizedList.length; i++) {
        let diff = Math.abs(normalizedList[i] - targetPC);
        if (diff > 6) diff = 12 - diff; // Wrap around distance
        if (diff < minDiff) {
            minDiff = diff;
            bestIdx = i;
        }
    }
    
    // 2. Determine the register (octave) of the input note relative to the matched list note
    // We want to shift the list note so it's closest to the input 'midi'
    const baseNoteInList = list[bestIdx];
    const octaveCorrection = Math.round((midi - baseNoteInList) / 12) * 12;
    
    // 3. Apply the offset to the index
    const len = list.length;
    let targetIndex = bestIdx + offset;
    
    // 4. Calculate wrapping
    const octaveShift = Math.floor(targetIndex / len);
    const wrappedIndex = ((targetIndex % len) + len) % len;
    
    // 5. Reconstruct
    // Take the target note from the list, apply the input's register correction, 
    // and then add any octaves gained/lost from the index offset.
    return list[wrappedIndex] + octaveCorrection + (octaveShift * 12);
}


/**
 * Determines the best scale intervals based on chord quality and parent key.
 */
function getScaleForChord(chord, style) {
    if (style === 'blues') {
        if (chord.quality === 'minor' || chord.quality === 'halfdim' || chord.quality === 'dim') {
            return [0, 3, 5, 6, 7, 10]; // Minor Blues
        }
        return [0, 2, 3, 4, 7, 9]; // Major Blues
    }

    if (style === 'neo') {
        // Neo-Soul: Pentatonic + 9th + 11th
        if (chord.quality === 'minor' || chord.quality === 'halfdim') {
            return [0, 2, 3, 5, 7, 10]; // Minor Pentatonic + 2
        }
        return [0, 2, 4, 5, 7, 9]; // Major Pentatonic + 11
    }

    // Bebop Scale Logic (8-note scales)
    if (style === 'bird') {
        switch (chord.quality) {
            case 'maj7': return [0, 2, 4, 5, 7, 8, 9, 11]; // Bebop Major (adds #5)
            case 'minor': return [0, 2, 3, 4, 5, 7, 9, 10]; // Bebop Minor (adds maj3)
            case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];   // Locrian
            default: 
                // Altered Dominant check (look for b5, #5, b9, #9)
                if (chord.intervals.includes(6) || chord.intervals.includes(8) || chord.intervals.includes(1) || chord.intervals.includes(3)) {
                    return [0, 1, 3, 4, 6, 8, 10]; // Altered scale (approx)
                }
                if (chord.intervals.includes(10)) return [0, 2, 4, 5, 7, 9, 10, 11]; // Bebop Dominant (adds maj7)
                return [0, 2, 4, 5, 7, 8, 9, 11];
        }
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

    let durationMultiplier = 1;

    // Skip steps if we are currently playing a sustained note
    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }

    const beatInMeasure = Math.floor(measureStep / 4);
    const stepInBeat = measureStep % 4;

    // --- Dynamic Velocity (Accents) ---
    let velocity = 1.0;
    if (stepInBeat === 0) {
        velocity = (measureStep === 0) ? 1.2 : 1.1; // Accent downbeats
    } else if (stepInBeat === 2) {
        velocity = 1.05; // Slight accent on mid-beat
    } else {
        velocity = 0.85 + Math.random() * 0.1; // "Ghost" or softer off-beats
    }
    
    // Style specific velocity tweaks
    if (style === 'shred') velocity *= (0.9 + Math.random() * 0.2); // More even but with jitter
    if (style === 'minimal') velocity *= 1.1; // Stronger individual notes
    if (style === 'neo') velocity *= (0.8 + Math.random() * 0.25); // Softer, more expressive

    // --- Pitch Selection Bounds & Tones ---
    const minMidi = centerMidi - (style === 'shred' ? 24 : 18);
    const maxMidi = Math.min(centerMidi + (style === 'shred' ? 30 : 24), 91); // Ceiling at G6 (91)
    const prevMidi = prevFreq ? getMidi(prevFreq) : centerMidi;
    const rootMidi = currentChord.rootMidi;
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord, style);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    // --- Phrasing Logic ---
    if (measureStep === 0 || sb.phraseSteps <= 0) {
        // Decide if we should start a new phrase or rest
        const restProb = style === 'shred' ? 0.15 : (style === 'neo' ? 0.5 : 0.4); 
        if (!sb.isResting && Math.random() < restProb) {
            sb.isResting = true;
            sb.phraseSteps = 4 + Math.floor(Math.random() * 8); // Rest for 1-2 beats
            sb.currentLick = null;
            sb.sequenceType = null;
        } else {
            sb.isResting = false;
            const phraseBase = style === 'shred' ? 16 : 8;
            sb.phraseSteps = phraseBase + Math.floor(Math.random() * 16); 
            sb.patternMode = Math.random() < 0.6 ? 'scale' : 'arp';
            sb.sequenceType = null;
            
            // 25% chance to trigger a canned lick (Higher for Bird style)
            const lickProb = style === 'bird' ? 0.35 : 0.2;
            if (style !== 'scalar' && style !== 'shred' && style !== 'neo' && Math.random() < lickProb) {
                const lickKeys = Object.keys(CANNED_LICKS);
                let pool = lickKeys;
                if (style === 'bird') pool = lickKeys.filter(k => k.startsWith('bird') || k === 'bebop_1');
                
                sb.currentLick = CANNED_LICKS[pool[Math.floor(Math.random() * pool.length)]];
                sb.lickIndex = 0;
                sb.lickBaseMidi = rootMidi;
            } else {
                sb.currentLick = null;
                
                // Bird style enclosure chance
                if (style === 'bird' && Math.random() < 0.4) {
                    const target = chordTones[Math.floor(Math.random() * chordTones.length)];
                    let targetMidi = target; // target is already absolute rootMidi + interval
                    while (targetMidi < minMidi) targetMidi += 12;
                    while (targetMidi > maxMidi) targetMidi -= 12;
                    
                    sb.currentLick = getEnclosure(targetMidi, scaleTones);
                    sb.lickIndex = 0;
                    sb.lickBaseMidi = targetMidi;
                }
            }
        }
    }
    sb.phraseSteps--;

    if (sb.isResting) return null;

    // --- Rhythmic Cell Selection ---
    if (stepInBeat === 0) {
        let cellPool = RHYTHMIC_CELLS;
        if (style === 'minimal') cellPool = [[1, 0, 0, 0], [1, 0, 1, 0]];
        if (style === 'shred') cellPool = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 1, 1]]; // Favor constant 16ths
        if (style === 'neo') cellPool = [[1, 0, 0, 1], [0, 1, 0, 1], [1, 0, 1, 0]]; // Laid back
        if (style === 'bird') cellPool = [[1, 1, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 0, 1]]; // Denser bebop rhythms
        sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
        
        // Rhythmic displacement chance for Bird
        if (style === 'bird' && measureStep === 0 && Math.random() < 0.3) {
            sb.busySteps = 1; // Skip the very first 16th for an offbeat start
            return null;
        }
    }

    // Check rhythmic cell for current step
    // If a lick is playing, it overrides the rhythmic cell to ensure the whole lick plays
    if (sb.currentCell[stepInBeat] === 0 && !sb.currentLick) return null;

    // --- Pitch Selection ---
    let finalMidi = prevMidi;
    let isGraceNote = false;
    let bendStartInterval = 0;

    // --- Lick Logic ---
    if (sb.currentLick) {
        const lickNote = sb.currentLick[sb.lickIndex];
        let targetMidi = (sb.lickBaseMidi || rootMidi) + lickNote;
        
        // Ensure it's in a reasonable range
        while (targetMidi < minMidi) targetMidi += 12;
        while (targetMidi > maxMidi) targetMidi -= 12;
        
        finalMidi = targetMidi;
        sb.lickIndex++;
        
        // Licks usually play on 8th notes or triplets, let's assume 8ths (2 steps) for now
        durationMultiplier = 2;
        
        if (sb.lickIndex >= sb.currentLick.length) {
            sb.currentLick = null; // Lick finished
            // Give it a longer sustain at the end of a lick
            durationMultiplier = 4;
        }

        sb.busySteps = durationMultiplier - 1;
        return { freq: getFrequency(finalMidi), durationMultiplier, style };
    } else if (sb.sequenceType) {
        const seq = SEQUENCES[sb.sequenceType];
        const offset = seq.offsets[sb.sequenceIndex];
        const list = (sb.patternMode === 'arp' || (style === 'shred' && Math.random() < 0.7)) ? chordTones : scaleTones;
        
        // For strict styles, ensure sequence base is diatonic before applying offset
        if (style === 'scalar' || style === 'shred') {
            const normBase = sb.sequenceBaseMidi % 12;
            const isDiatonic = scaleIntervals.some(i => (rootMidi + i) % 12 === normBase);
            if (!isDiatonic) {
                // Snap base to nearest scale tone
                let best = sb.sequenceBaseMidi;
                let minD = 13;
                scaleTones.forEach(t => {
                    let m = t;
                    while (m < sb.sequenceBaseMidi - 6) m += 12;
                    while (m > sb.sequenceBaseMidi + 6) m -= 12;
                    if (Math.abs(m - sb.sequenceBaseMidi) < minD) {
                        minD = Math.abs(m - sb.sequenceBaseMidi);
                        best = m;
                    }
                });
                sb.sequenceBaseMidi = best;
            }
        }

        finalMidi = getScaleNote(sb.sequenceBaseMidi, list, offset);
        sb.sequenceIndex++;
        
        if (sb.sequenceIndex >= seq.offsets.length) {
            sb.sequenceIndex = 0;
            sb.sequenceBaseMidi = getScaleNote(sb.sequenceBaseMidi, list, seq.nextBase);
            // End sequence after some cycles or if out of range
            if (Math.random() < 0.25 || sb.sequenceBaseMidi > maxMidi || sb.sequenceBaseMidi < minMidi) {
                sb.sequenceType = null;
            }
        }
        
        durationMultiplier = (style === 'shred') ? 1 : 2;
        sb.busySteps = durationMultiplier - 1;
        
        // One last range check for sequences
        while (finalMidi > maxMidi) finalMidi -= 12;
        while (finalMidi < minMidi) finalMidi += 12;
        
        return { freq: getFrequency(finalMidi), durationMultiplier, style };
    } else {
        // Trigger a sequence sometimes in many modes
        // Shred, Scalar, Bird, and Blues all benefit from sequences
        const sequenceProb = (style === 'shred' || style === 'scalar') ? 0.25 : 0.15;
        if (!sb.sequenceType && Math.random() < sequenceProb) {
            const keys = Object.keys(SEQUENCES);
            sb.sequenceType = keys[Math.floor(Math.random() * keys.length)];
            sb.sequenceIndex = 0;
            
            // Ensure start midi is within bounds
            let startMidi = prevMidi;
            while (startMidi > maxMidi - 12) startMidi -= 12;
            while (startMidi < minMidi + 12) startMidi += 12;
            sb.sequenceBaseMidi = startMidi;
        }

        // --- Shred Specific Logic ---
        if (style === 'shred') {
            if (sb.patternSteps <= 0) {
                sb.patternSteps = 8 + Math.floor(Math.random() * 16); // Longer sweeps
                sb.patternMode = Math.random() < 0.9 ? 'arp' : 'scale'; // 90% arpeggios
                
                if (prevMidi > maxMidi - 12) sb.direction = -1;
                else if (prevMidi < minMidi + 12) sb.direction = 1;
                else sb.direction = Math.random() > 0.5 ? 1 : -1;
            }
        } else {
            // --- Blues Specific Phrasing ---
            if (style === 'blues' && Math.random() < 0.25 && stepInBeat !== 0) {
                // Characteristic blues "slip": quick chromatic note 1 semitone below a target
                isGraceNote = true;
            }

            // Harmonic Targeting
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
                targets.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
                
                if (style === 'scalar' || style === 'shred') {
                    finalMidi = targets[0];
                } else {
                    if (targets[0] > prevMidi) finalMidi = prevMidi + (Math.random() < 0.5 ? 1 : 2);
                    else if (targets[0] < prevMidi) finalMidi = prevMidi - (Math.random() < 0.5 ? 1 : 2);
                    else finalMidi = targets[0];
                }
            } else {
                if (sb.patternSteps <= 0) {
                    sb.patternSteps = 2 + Math.floor(Math.random() * 6);
                    if (prevMidi > maxMidi - 10) sb.direction = -1;
                    else if (prevMidi < minMidi + 10) sb.direction = 1;
                    else sb.direction = Math.random() > 0.5 ? 1 : -1;
                }
            }
        }
        sb.patternSteps--;

        if (style !== 'shred' || sb.patternSteps >= 0) {
            const findNext = (current, list, dir) => {
                // Optimized local search: check list shifted by -1, 0, +1 octaves
                let best = null;
                
                // Since 'list' contains absolute MIDI numbers (e.g., 60, 62, 64), 
                // we simply create virtual candidates by adding/subtracting 12.
                // We check the octave below, current octave, and octave above relative to the list's definition.
                // But specifically, we need to find neighbors to 'current'. 
                // A standard scale list spans ~1 octave. So checking -1, 0, 1 shifts of the list covers the range.
                
                // Center the search around the 'current' note to ensure we cover enough range
                // Determine approximate octave difference between list definition and current note
                const baseShift = Math.floor((current - list[0]) / 12) * 12;

                for (let o = -1; o <= 1; o++) {
                    const octaveOffset = baseShift + (o * 12);
                    
                    for (let i = 0; i < list.length; i++) {
                         const candidate = list[i] + octaveOffset;
                         
                         if (dir > 0) {
                             if (candidate > current && candidate <= maxMidi) {
                                 if (best === null || candidate < best) best = candidate;
                             }
                         } else {
                             if (candidate < current && candidate >= minMidi) {
                                 if (best === null || candidate > best) best = candidate;
                             }
                         }
                    }
                }
                
                if (best !== undefined && best !== null) return best;
                
                // Change direction if we hit a boundary
                sb.direction *= -1;
                // Simple recursive fallback (inline)
                if (Math.abs(sb.direction) === 1) { 
                     let retryBest = null;
                     const newDir = sb.direction;
                     for (let o = -1; o <= 1; o++) {
                        const octaveOffset = baseShift + (o * 12);
                        for (let i = 0; i < list.length; i++) {
                             const candidate = list[i] + octaveOffset;
                             if (newDir > 0) {
                                 if (candidate > current && candidate <= maxMidi) {
                                     if (retryBest === null || candidate < retryBest) retryBest = candidate;
                                 }
                             } else {
                                 if (candidate < current && candidate >= minMidi) {
                                     if (retryBest === null || candidate > retryBest) retryBest = candidate;
                                 }
                             }
                        }
                    }
                    if (retryBest !== null) return retryBest;
                }
                return current;
            };

            if (sb.patternMode === 'arp') {
                finalMidi = findNext(prevMidi, chordTones, sb.direction);
            } else {
                finalMidi = findNext(prevMidi, scaleTones, sb.direction);
            }
        }
    }

    if (isGraceNote) {
        finalMidi -= 1;
    }

    // Bebop chromatic passing tones (Bird style)
    if (style === 'bird' && stepInBeat !== 0 && !sb.currentLick && Math.random() < 0.3) {
        // Approach target scale tone chromatically
        if (sb.direction > 0) finalMidi -= 1;
        else finalMidi += 1;
    }

    // Avoid dissonant "avoid notes" on downbeats
    const intervalFromRoot = (finalMidi - rootMidi + 120) % 12;
    if (stepInBeat === 0 && intervalFromRoot === 5 && !chordTones.some(t => (t % 12) === (finalMidi % 12))) {
        const currentDir = sb.direction || 1;
        const normDist = (finalMidi - rootMidi + 120) % 12;
        const isScaleTone = scaleIntervals.includes(normDist);
        
        if (isScaleTone || style === 'scalar' || style === 'shred' || style === 'bird') {
            let safeMidi = finalMidi + currentDir;
            let attempts = 0;
            while (attempts < 12) {
                 const d = (safeMidi - rootMidi + 120) % 12;
                 if (scaleIntervals.includes(d) && d !== 5 && safeMidi <= maxMidi && safeMidi >= minMidi) {
                     finalMidi = safeMidi;
                     break;
                 }
                 safeMidi += currentDir;
                 attempts++;
            }
        } else {
             finalMidi += currentDir;
        }
    }

    // Final check for phrase endings
    if (sb.phraseSteps === 0 && !sb.isResting) {
        const midiVal = finalMidi % 12;
        const isScaleTone = scaleIntervals.some(i => (rootMidi + i) % 12 === midiVal);
        
        if (!isScaleTone && !chordTones.some(t => (t % 12) === midiVal)) {
            let bestMidi = finalMidi;
            let minDist = 13;
            chordTones.forEach(t => {
                let m = t;
                while (m < finalMidi - 6) m += 12;
                while (m > finalMidi + 6) m -= 12;
                const d = Math.abs(m - finalMidi);
                if (d < minDist && m <= maxMidi && m >= minMidi) {
                    minDist = d;
                    bestMidi = m;
                }
            });
            finalMidi = bestMidi;
        }
    }

    // STRICT MIDI CONSTRAINTS - Final pass
    while (finalMidi > maxMidi) { 
        finalMidi -= 12; 
        sb.direction = -1; 
    }
    while (finalMidi < minMidi) { 
        finalMidi += 12; 
        sb.direction = 1; 
    }

    // Decide if we should bend into this note
    const isTarget = chordTones.some(t => (t % 12) === (finalMidi % 12));
    const isLongNote = (style === 'shred' && durationMultiplier > 4) || style === 'minimal' || sb.phraseSteps <= 0;
    
    const bendProb = style === 'blues' ? 0.35 : (style === 'shred' ? 0.05 : (style === 'neo' ? 0.45 : 0.2));
    if (Math.random() < bendProb && (isTarget || isLongNote)) {
        if (style === 'neo') {
            // Neo-soul 'Slide from below' or 'Scoop'
            bendStartInterval = Math.random() > 0.4 ? 1 : 2;
        } else {
            bendStartInterval = style === 'shred' ? 1 : (Math.random() > 0.6 ? 2 : 1);
        }
    }

    if (style === 'minimal') {
        if (Math.random() < 0.4) durationMultiplier = 3 + Math.floor(Math.random() * 5);
        else durationMultiplier = 2;
    } else if (style === 'shred' && sb.phraseSteps <= 1 && !sb.isResting) {
        if (Math.random() < 0.8) durationMultiplier = 8 + Math.floor(Math.random() * 8);
    } else if (style === 'neo' && isLongNote && Math.random() < 0.3) {
        durationMultiplier = 4 + Math.floor(Math.random() * 4);
    }

    sb.busySteps = durationMultiplier - 1;

    // Double/Triple Stop Logic
    let extraFreq = null;
    let extraMidi = null;
    let extraFreq2 = null;
    let extraMidi2 = null;
    
    const dsProb = style === 'neo' ? 0.35 : 0.25;
    if ((style === 'blues' || style === 'neo') && !isGraceNote && !sb.currentLick && !sb.sequenceType && Math.random() < dsProb) {
        let offset;
        if (style === 'blues') {
            const possibleOffsets = [-2, -3, -4]; 
            offset = possibleOffsets[Math.floor(Math.random() * possibleOffsets.length)];
            extraMidi = getScaleNote(finalMidi, scaleTones, offset);
        } else {
            // Neo-soul: Quartal (Perfect 4th is usually ~3 steps in pentatonic)
            offset = -3;
            extraMidi = getScaleNote(finalMidi, scaleTones, offset);
            
            // 30% chance for a 3rd note (triple stop / cluster) in Neo mode
            if (Math.random() < 0.3) {
                extraMidi2 = getScaleNote(extraMidi, scaleTones, -3);
                if (extraMidi2 !== extraMidi && extraMidi2 >= minMidi) {
                    extraFreq2 = getFrequency(extraMidi2);
                } else {
                    extraMidi2 = null;
                }
            }
        }
        
        if (extraMidi !== finalMidi && extraMidi >= minMidi) {
            extraFreq = getFrequency(extraMidi);
        } else {
            extraMidi = null;
        }
    }

    // Neo-Soul Ghost Note Logic: 
    // Sometimes prefix a target note with a quick chromatic slip
    if (style === 'neo' && stepInBeat !== 0 && !isGraceNote && Math.random() < 0.25) {
        isGraceNote = true;
        velocity *= 0.5; // Very soft ghost note
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