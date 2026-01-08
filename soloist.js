import { getFrequency, getMidi } from './utils.js';
import { sb, cb, ctx, arranger } from './state.js';
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
    [1, 0, 1, 1], // Syncopated 2
    [0, 1, 0, 1], // Pure offbeats
];

const CANNED_LICKS = {
    'the_lick': { notes: [2, 3, 5, 7, 3, 10, 12], quality: ['minor', 'halfdim'] },
    'blues_1': { notes: [12, 15, 12, 10, 9, 7], quality: ['minor', 'major'] },
    'blues_2': { notes: [12, 10, 7, 6, 5, 3, 0], quality: ['minor', 'major'] },
    'blues_3': { notes: [0, 2, 3, 4, 7, 9, 7, 4], quality: ['major'] },
    'blues_4': { notes: [12, 10, 7, 10, 12, 15, 17], quality: ['minor', 'major'] },
    'rock_1': { notes: [0, 3, 5, 5, 3, 0], quality: ['minor', 'major'] },
    'bebop_1': { notes: [7, 6, 5, 4, 3, 2, 1, 0], quality: ['major'] },
    'parker_1': { notes: [0, 4, 7, 11, 10, 8, 7, 5, 4], quality: ['major', 'dom'] },
    'parker_2': { notes: [12, 10, 9, 7, 6, 5, 3, 2, 0], quality: ['minor', 'dom'] },
    'bird_enclosure': { notes: [5, 4, 2, 3], quality: ['major', 'minor', 'dom'] },
    'blues_5': { notes: [12, 15, 17, 18, 17, 15, 12], quality: ['minor', 'major'] },
    'neo_1': { notes: [12, 14, 12, 9, 7, 5, 7], quality: ['major', 'minor'] },
    'neo_2': { notes: [17, 14, 12, 14, 17, 19, 17], quality: ['major', 'minor'] },
    'neo_quartal': { notes: [17, 12, 10, 5, 7], quality: ['major', 'minor'] },
    'shred_1': { notes: [0, 4, 7, 12, 16, 19, 24, 19, 16, 12, 7, 4], quality: ['major'] },
    'bb_box': { notes: [12, 14, 15, 14, 12, 10, 12], quality: ['minor', 'major'] },
    'albert_king': { notes: [12, 15, 17, 15, 12], quality: ['minor', 'major'] },
    'turnaround_1': { notes: [12, 11, 10, 9, 8, 7, 7], quality: ['major'] },
    'turnaround_2': { notes: [0, 4, 7, 10, 11, 12], quality: ['major'] },
};

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
function getScaleForChord(chord, style, nextChord) {
    // 1. Shared Harmonic Context (V7 resolving to Minor)
    const isV7toMinor = chord.intervals.includes(10) && chord.intervals.includes(4) && 
                        nextChord && (nextChord.quality === 'minor' || nextChord.quality === 'dim' || nextChord.quality === 'halfdim');

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

    if (style === 'bird') {
        // Bebop Scales: Adding chromatic passing tones
        if (chord.intervals.includes(10)) {
            if (isV7toMinor) return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant
            return [0, 2, 4, 5, 7, 9, 10, 11]; // Dominant Bebop
        }
        if (chord.quality === 'halfdim') return [0, 1, 2, 3, 5, 6, 8, 10];
        if (chord.quality === 'minor') return [0, 2, 3, 4, 5, 7, 9, 10];
        return [0, 2, 4, 5, 7, 8, 9, 11]; // Major Bebop
    }

    if (isV7toMinor && (style === 'scalar' || style === 'shred')) {
        return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant
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

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 77, style = 'scalar', stepInChord = 0) {
    if (!currentChord) return null;

    let durationMultiplier = 1;

    // Harmonic Reset: If we just switched chords, clear any stale melodic state
    if (stepInChord === 0) {
        sb.currentLick = null;
        sb.enclosureNotes = null;
        sb.busySteps = 0;
    }

    // Skip steps if we are currently playing a sustained note
    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }

    const measureStep = step % 16;
    const beatInMeasure = Math.floor(measureStep / 4);
    const stepInBeat = measureStep % 4;

    // --- Structural Energy Mapping ---
    const loopStep = step % (arranger.totalSteps || 1);
    let sectionStart = 0;
    let sectionEnd = arranger.totalSteps;
    const currentSectionId = currentChord.sectionId;
    
    // Find boundaries of the current section in the flattened progression
    for (let i = 0; i < arranger.stepMap.length; i++) {
        if (arranger.stepMap[i].chord.sectionId === currentSectionId) {
            sectionStart = arranger.stepMap[i].start;
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
    
    // Intensity factor: 0.0 at start, 1.0 at end of section
    const intensity = progressInSection;
    
    // Shift register up as intensity builds
    let registerSoar = 7;
    if (style === 'minimal') registerSoar = 10;
    if (style === 'shred') registerSoar = 14; // Shreddy climbs more than an octave
    if (style === 'bird') registerSoar = 5;  // Bebop stays more contained
    
    const dynamicCenterMidi = centerMidi + Math.floor(intensity * registerSoar);

    // --- Dynamic Velocity (Accents) ---
    let velocity = 1.0 + (intensity * 0.2); // Build base volume with intensity
    if (stepInBeat === 0) {
        velocity *= (measureStep === 0) ? 1.2 : 1.1; // Accent downbeats
    } else if (stepInBeat === 2) {
        velocity *= 1.05; // Slight accent on mid-beat
    } else {
        velocity *= 0.85 + Math.random() * 0.1; // "Ghost" or softer off-beats
    }
    
    // Style specific velocity tweaks
    if (style === 'shred') velocity *= (0.9 + Math.random() * 0.2); 
    if (style === 'minimal') {
        // Wider dynamic range for more soulful touch
        velocity = (Math.random() < 0.3 ? 0.6 : 1.1) + (Math.random() * 0.3 - 0.15);
    }
    if (style === 'neo') velocity *= (0.8 + Math.random() * 0.25);

    // --- Pitch Selection Bounds & Tones ---
    const minMidi = dynamicCenterMidi - (style === 'shred' ? 24 : 18);
    const maxMidi = Math.min(dynamicCenterMidi + (style === 'shred' ? 30 : 24), 91); // Ceiling at G6 (91)
    const prevMidi = prevFreq ? getMidi(prevFreq) : dynamicCenterMidi;
    const rootMidi = currentChord.rootMidi;
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord, style, nextChord);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    // --- Phrasing Logic ---
    if (measureStep === 0 || sb.phraseSteps <= 0) {
        // Decide if we should start a new phrase or rest
        // Intensity reduces resting probability
        let restProb = 0.4 - (intensity * 0.3); 
        if (style === 'shred') restProb = 0.15;
        if (style === 'neo') restProb = 0.5 - (intensity * 0.2);
        if (style === 'minimal') restProb = 0.65 - (intensity * 0.4); 
        if (style === 'bird') restProb = (ctx.bpm > 150 ? 0.45 : 0.25) - (intensity * 0.2);

        if (!sb.isResting && Math.random() < restProb) {
            sb.isResting = true;
            sb.phraseSteps = (style === 'bird' ? (ctx.bpm > 150 ? 4 : 2) : (style === 'minimal' ? 6 : 4)) + Math.floor(Math.random() * 8); 
            sb.currentLick = null;
            sb.sequenceType = null;
        } else {
            sb.isResting = false;
            // Higher intensity leads to longer phrases
            let phraseBase = (style === 'bird' ? 24 : (style === 'shred' ? 16 : 8)) + Math.floor(intensity * 12);
            if (style === 'bird' && ctx.bpm > 150) phraseBase = 12 + Math.floor(intensity * 8);
            sb.phraseSteps = phraseBase + Math.floor(Math.random() * 16); 
            
            // Bird/Bebop uses a mix of scalar runs and arpeggio extensions
            sb.patternMode = (style === 'bird') ? (Math.random() < 0.4 ? 'arp' : 'scale') : (style === 'minimal' ? 'arp' : (Math.random() < 0.6 ? 'scale' : 'arp'));
            sb.sequenceType = null;
            
            // --- Turnaround Logic ---
            const loopStep = step % (arranger.totalSteps || 1);
            const isTurnaround = (arranger.totalSteps > 16) && loopStep >= (arranger.totalSteps - 16);
            
            // Style-aware lick selection
            let lickProb = 0.15 + (intensity * 0.2); // More licks as energy builds
            if (style === 'blues') lickProb = isTurnaround ? 0.6 : 0.35;
            if (style === 'neo') lickProb = 0.25;
            if (style === 'minimal') lickProb = 0; // David Gilmour style: no canned licks, just melody

            if (style !== 'scalar' && style !== 'shred' && style !== 'minimal' && Math.random() < lickProb) {
                let pool = Object.keys(CANNED_LICKS).filter(name => {
                    const lick = CANNED_LICKS[name];
                    const q = currentChord.quality;
                    const isMajor = q === 'major' || q.startsWith('maj') || q === 'add9' || q === '6' || q === '5';
                    const isMinor = q === 'minor' || q.startsWith('m') || q.includes('dim') || q === 'halfdim';
                    const isDom = currentChord.intervals.includes(10) || ['7', '9', '7b9', '7#9'].includes(q);

                    let qualityMatch = false;
                    if (isMajor && lick.quality.includes('major')) qualityMatch = true;
                    if (isMinor && lick.quality.includes('minor')) qualityMatch = true;
                    if (q === 'halfdim' && lick.quality.includes('halfdim')) qualityMatch = true;
                    if (isDom && (lick.quality.includes('major') || lick.quality.includes('minor'))) qualityMatch = true;

                    if (style === 'blues') {
                        if (isTurnaround) return ['turnaround_1', 'turnaround_2'].includes(name) && qualityMatch;
                        return ['the_lick', 'blues_1', 'blues_2', 'blues_3', 'blues_4', 'blues_5', 'bb_box', 'albert_king'].includes(name) && qualityMatch;
                    }
                    if (style === 'neo') {
                        return ['neo_1', 'neo_2', 'neo_quartal', 'the_lick'].includes(name) && qualityMatch;
                    }
                    if (style === 'bird') {
                        return ['the_lick', 'bebop_1', 'parker_1', 'parker_2', 'bird_enclosure'].includes(name) && qualityMatch;
                    }
                    return qualityMatch;
                });

                if (pool.length > 0) {
                    const lickData = CANNED_LICKS[pool[Math.floor(Math.random() * pool.length)]];
                    sb.currentLick = lickData.notes;
                    sb.lickIndex = 0;
                    sb.lickBaseMidi = rootMidi;
                } else {
                    sb.currentLick = null;
                }
            } else {
                sb.currentLick = null;
            }
        }
    }
    sb.phraseSteps--;

    if (sb.isResting) return null;

    // --- Rhythmic Cell Selection ---
    if (stepInBeat === 0) {
        let cellPool = RHYTHMIC_CELLS;

        // Tempo-based density: reduce busy patterns at high BPM
        if (ctx.bpm >= 150) {
            cellPool = RHYTHMIC_CELLS.filter((_, idx) => ![1, 3, 4, 5, 7, 9].includes(idx));
        } else if (ctx.bpm >= 120) {
            cellPool = RHYTHMIC_CELLS.filter((_, idx) => ![1].includes(idx));
        }
        
        // Intensity-based density: favor busier cells as we approach the end of a section
        if (intensity > 0.7 && ctx.bpm < 150) {
             // Favor 16ths and syncopation
             const busyIndices = [0, 1, 3, 4, 7];
             cellPool = cellPool.filter((_, idx) => busyIndices.includes(idx % cellPool.length));
        }

        if (style === 'scalar' && ctx.bpm > 150) {
            // Further reduce scalar density at very high tempos
            cellPool = [[1, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 1]];
        }
        
        if (style === 'minimal') cellPool = [[1, 0, 0, 0], [1, 0, 1, 0], [0, 0, 1, 0], [0, 1, 0, 0]];
        if (style === 'bird') {
            cellPool = [[1, 1, 1, 0], [0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1]];
            if (ctx.bpm < 150) cellPool.push([1, 1, 1, 1]); // Only 16th streams at lower tempos
        }
        if (style === 'shred') cellPool = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 1, 1]]; 
        if (style === 'neo') cellPool = [[1, 0, 0, 1], [0, 1, 0, 1], [1, 0, 1, 0]];


        // Motivic Development Logic
        const isNewPhrase = measureStep === 0 || sb.phraseSteps >= 20; // Heuristic for phrase start
        
        if (isNewPhrase && !sb.motifCell) {
            // Start of a new idea: Establish a motif
            sb.motifCell = cellPool[Math.floor(Math.random() * cellPool.length)];
            sb.motifCounter = 2 + Math.floor(Math.random() * 3); // Repeat/vary for 2-4 beats
            sb.currentCell = sb.motifCell;
        } else if (sb.motifCounter > 0) {
            // Call and Response: Repeat or vary the motif
            sb.motifCounter--;
            
            if (Math.random() < 0.7) {
                // Exact repetition (The "Call")
                sb.currentCell = sb.motifCell;
            } else {
                // Slight variation (The "Response")
                const variation = [...sb.motifCell];
                const flipIdx = Math.floor(Math.random() * 4);
                variation[flipIdx] = variation[flipIdx] === 1 ? 0 : 1;
                sb.currentCell = variation;
            }
            
            // If counter hits 0, we might clear the motif to allow a new idea next beat
            if (sb.motifCounter === 0 && Math.random() < 0.5) {
                sb.motifCell = null;
            }
        } else {
            // Free development: pick a random cell and occasionally start a new motif
            sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
            if (Math.random() < 0.2) {
                sb.motifCell = sb.currentCell;
                sb.motifCounter = 2;
            }
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
        finalMidi = sb.lickBaseMidi + lickNote;
        sb.lickIndex++;
        if (sb.lickIndex >= sb.currentLick.length) {
            sb.currentLick = null;
        }
        
        // Neo-soul licks often have a very soft, "ghosted" touch
        if (style === 'neo') velocity *= (0.7 + Math.random() * 0.4);

        return { freq: getFrequency(finalMidi), durationMultiplier, velocity, style };
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
        } else if (style === 'bird') {
             // Bebop specific behavior: Chromatic enclosures
             if (Math.random() < 0.25 && !sb.enclosureNotes) {
                 // Pick a target chord tone
                 const target = chordTones[Math.floor(Math.random() * chordTones.length)];
                 let m = target;
                 while (m < minMidi) m += 12;
                 while (m > maxMidi) m -= 12;
                 
                 // Classic enclosure: Above -> Below -> Target
                 sb.enclosureNotes = [m + 1, m - 1, m];
                 sb.enclosureIndex = 0;
             }
             
             if (sb.enclosureNotes) {
                 finalMidi = sb.enclosureNotes[sb.enclosureIndex];
                 sb.enclosureIndex++;
                 if (sb.enclosureIndex >= sb.enclosureNotes.length) {
                     sb.enclosureNotes = null;
                 }
                 durationMultiplier = 1;
                 sb.busySteps = 0;
                 return { freq: getFrequency(finalMidi), durationMultiplier, style };
             }

             if (sb.patternSteps <= 0) {
                sb.patternSteps = 4 + Math.floor(Math.random() * 12);
                if (prevMidi > maxMidi - 10) sb.direction = -1;
                else if (prevMidi < minMidi + 10) sb.direction = 1;
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
                // Optimized local search
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
                    // 30% chance to skip a note in the scale for melodic variety
                    const idx = (Math.random() < 0.3 && candidates.length > 1) ? 1 : 0;
                    return candidates[idx];
                }
                
                // Change direction if we hit a boundary
                sb.direction *= -1;
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

    // Avoid dissonant "avoid notes" on strong beats
    const isStrongBeat = (stepInBeat === 0 || stepInBeat === 2);
    const intervalFromRoot = (finalMidi - rootMidi + 120) % 12;
    if (isStrongBeat && !chordTones.some(t => (t % 12) === (finalMidi % 12))) {
        const currentDir = sb.direction || 1;
        
        // Avoid 4th (11) on Major chords
        const isAvoid11 = (currentChord.quality === 'maj7' || currentChord.quality === 'dom') && intervalFromRoot === 5;
        // Avoid Major 7th on Dominant chords
        const isAvoidMaj7 = (currentChord.quality === 'dom' && intervalFromRoot === 11);

        if (isAvoid11 || isAvoidMaj7) {
            let safeMidi = finalMidi + currentDir;
            let attempts = 0;
            while (attempts < 12) {
                 const d = (safeMidi - rootMidi + 120) % 12;
                 if (scaleIntervals.includes(d) && d !== 5 && d !== 11 && safeMidi <= maxMidi && safeMidi >= minMidi) {
                     finalMidi = safeMidi;
                     break;
                 }
                 safeMidi += currentDir;
                 attempts++;
            }
        }
    }

    // Final check for phrase endings
    if (sb.phraseSteps <= 0 && !sb.isResting) {
        const midiVal = finalMidi % 12;
        const targetTones = [0, chord.intervals[1], chord.intervals[2] || 7].map(i => (rootMidi + i) % 12);
        const isStable = targetTones.includes(midiVal);
        
        if (!isStable) {
            let bestMidi = finalMidi;
            let minDist = 13;
            // Target Root, 3rd, or 5th
            const stableMidis = [];
            [0, chord.intervals[1], chord.intervals[2] || 7].forEach(i => {
                let m = rootMidi + i;
                while (m < finalMidi - 6) m += 12;
                while (m > finalMidi + 6) m -= 12;
                stableMidis.push(m);
            });

            stableMidis.forEach(m => {
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
        } else if (style === 'blues') {
            // Target-specific bends for blues
            if (intervalFromRoot === 7) bendStartInterval = 2; // Bend into 5th from 4th
            else if (intervalFromRoot === 4) bendStartInterval = 1; // Bend into 3rd from b3
            else if (intervalFromRoot === 0) bendStartInterval = 2; // Bend into Root from b7
            else bendStartInterval = Math.random() > 0.5 ? 2 : 1;
        } else if (style === 'minimal') {
            // Gilmour-style expressive bends
            const r = Math.random();
            if (r < 0.3) bendStartInterval = 2; // Full step bend
            else if (r < 0.6) bendStartInterval = 1; // Half step bend
            else bendStartInterval = 0.5; // Subtle scoop
        } else {
            bendStartInterval = style === 'shred' ? 1 : (Math.random() > 0.6 ? 2 : 1);
        }
    }

    if (style === 'minimal') {
        if (Math.random() < 0.6) durationMultiplier = 4 + Math.floor(Math.random() * 8); // Very long, deliberate notes
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
    
    const dsProb = (style === 'neo' || style === 'minimal') ? 0.35 : 0.25;
    if ((style === 'blues' || style === 'neo' || style === 'minimal') && !isGraceNote && !sb.currentLick && !sb.sequenceType && Math.random() < dsProb) {
        let offset;
        if (style === 'blues') {
            const possibleOffsets = [-2, -3, -4]; 
            offset = possibleOffsets[Math.floor(Math.random() * possibleOffsets.length)];
            extraMidi = getScaleNote(finalMidi, scaleTones, offset);
        } else if (style === 'minimal') {
            // Gilmour-style perfect intervals (4th or 5th)
            offset = Math.random() > 0.5 ? -3 : -4; 
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