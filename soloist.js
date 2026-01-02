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

const CANNED_LICKS = {
    'the_lick': [2, 3, 5, 7, 3, 10, 12], // 2 b3 4 5 b3 b7 1
    'blues_1': [12, 15, 12, 10, 9, 7], // 1 b3 1 b7 6 5
    'rock_1': [0, 3, 5, 5, 3, 0],      // 1 b3 4 4 b3 1
    'bebop_1': [7, 6, 5, 4, 3, 2, 1, 0], // 5 b5 4 3 b3 2 b2 1
    'shred_1': [0, 4, 7, 12, 16, 19, 24, 19, 16, 12, 7, 4], // Major Arp Sweep
};

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

    let durationMultiplier = 1;

    // Skip steps if we are currently playing a sustained note
    if (sb.busySteps > 0) {
        sb.busySteps--;
        return null;
    }

    const beatInMeasure = Math.floor(measureStep / 4);
    const stepInBeat = measureStep % 4;

    // --- Phrasing Logic ---
    if (measureStep === 0 || sb.phraseSteps <= 0) {
        // Decide if we should start a new phrase or rest
        const restProb = style === 'shred' ? 0.15 : 0.4; // Shredders rest less
        if (!sb.isResting && Math.random() < restProb) {
            sb.isResting = true;
            sb.phraseSteps = 4 + Math.floor(Math.random() * 8); // Rest for 1-2 beats
            sb.currentLick = null;
        } else {
            sb.isResting = false;
            const phraseBase = style === 'shred' ? 16 : 8;
            sb.phraseSteps = phraseBase + Math.floor(Math.random() * 16); 
            sb.patternMode = Math.random() < 0.6 ? 'scale' : 'arp';
            
            // 20% chance to trigger a canned lick
            // Canned licks are fixed intervals, so we avoid them in strict diatonic styles
            if (style !== 'scalar' && style !== 'shred' && Math.random() < 0.2) {
                const lickKeys = Object.keys(CANNED_LICKS);
                sb.currentLick = CANNED_LICKS[lickKeys[Math.floor(Math.random() * lickKeys.length)]];
                sb.lickIndex = 0;
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
        if (style === 'minimal') cellPool = [[1, 0, 0, 0], [1, 0, 1, 0]];
        if (style === 'shred') cellPool = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 1, 1]]; // Favor constant 16ths
        sb.currentCell = cellPool[Math.floor(Math.random() * cellPool.length)];
    }

    // Check rhythmic cell for current step
    // If a lick is playing, it overrides the rhythmic cell to ensure the whole lick plays
    if (sb.currentCell[stepInBeat] === 0 && !sb.currentLick) return null;

    // --- Pitch Selection ---
    const minMidi = centerMidi - (style === 'shred' ? 24 : 18);
    const maxMidi = centerMidi + (style === 'shred' ? 30 : 24); 
    const prevMidi = prevFreq ? Math.round(12 * Math.log2(prevFreq / 440) + 69) : centerMidi;
    const rootMidi = currentChord.rootMidi;
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    const scaleIntervals = getScaleForChord(currentChord, style);
    const scaleTones = scaleIntervals.map(i => rootMidi + i);

    let finalMidi = prevMidi;
    let isGraceNote = false;

    // --- Lick Logic ---
    if (sb.currentLick) {
        const lickNote = sb.currentLick[sb.lickIndex];
        let targetMidi = rootMidi + lickNote;
        
        // Ensure it's in a reasonable range
        while (targetMidi < centerMidi - 12) targetMidi += 12;
        while (targetMidi > centerMidi + 12) targetMidi -= 12;
        
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
        return { freq: getFrequency(finalMidi), durationMultiplier };
    } else {
        // --- Shred Specific Logic ---
        if (style === 'shred') {
            if (sb.patternSteps <= 0) {
                sb.patternSteps = 8 + Math.floor(Math.random() * 16); // Longer sweeps
                sb.patternMode = Math.random() < 0.9 ? 'arp' : 'scale'; // 90% arpeggios
                
                if (prevMidi > centerMidi + 12) sb.direction = -1;
                else if (prevMidi < centerMidi - 12) sb.direction = 1;
                else sb.direction = Math.random() > 0.5 ? 1 : -1;
            }
        } else {
            // --- Blues Specific Phrasing ---
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
                
                if (style === 'scalar' || style === 'shred') {
                    // Strict styles: snap directly to the target chord tone
                    finalMidi = targets[0];
                } else {
                    // Approach chromatically or by step
                    if (targets[0] > prevMidi) finalMidi = prevMidi + (Math.random() < 0.5 ? 1 : 2);
                    else if (targets[0] < prevMidi) finalMidi = prevMidi - (Math.random() < 0.5 ? 1 : 2);
                    else finalMidi = targets[0];
                }
            } else {
                // Standard pattern motion
                if (sb.patternSteps <= 0) {
                    sb.patternSteps = 2 + Math.floor(Math.random() * 6);
                    if (prevMidi > centerMidi + 10) sb.direction = -1;
                    else if (prevMidi < centerMidi - 10) sb.direction = 1;
                    else sb.direction = Math.random() > 0.5 ? 1 : -1;
                }
            }
        }
        sb.patternSteps--;

        if (style !== 'shred' || sb.patternSteps >= 0) {
            const findNext = (current, list, dir) => {
                let expanded = [];
                [-36, -24, -12, 0, 12, 24, 36].forEach(o => list.forEach(n => expanded.push(n + o)));
                expanded = [...new Set(expanded)].sort((a, b) => a - b);
                
                let next;
                if (dir > 0) {
                    next = expanded.find(n => n > current && n <= maxMidi);
                } else {
                    next = [...expanded].reverse().find(n => n < current && n >= minMidi);
                }
                
                if (next === undefined) {
                    // Change direction if we hit a boundary
                    sb.direction *= -1;
                    if (sb.direction > 0) {
                        return expanded.find(n => n > current && n <= maxMidi) || current;
                    } else {
                        return [...expanded].reverse().find(n => n < current && n >= minMidi) || current;
                    }
                }
                return next;
            };

            if (sb.patternMode === 'arp') {
                finalMidi = findNext(prevMidi, chordTones, sb.direction);
            } else {
                finalMidi = findNext(prevMidi, scaleTones, sb.direction);
            }
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
        // Shift to the next scale tone instead of chromatic shift
        const currentDir = sb.direction || 1;
        const currentScaleIndex = scaleTones.indexOf(finalMidi);
        
        if (currentScaleIndex !== -1) {
            // If currently in scale, move to next/prev scale tone
            let nextIndex = currentScaleIndex + currentDir;
            // Wrap around logic if needed (though scaleTones are usually one octave, findNext handles registers)
            // But scaleTones here are just one octave [0..11] + root.
            // Wait, scaleTones is defined as: scaleIntervals.map(i => rootMidi + i);
            // This is just one octave. finalMidi might be outside this range.
            
            // Safer approach: find nearest scale tone in direction
            let safeMidi = finalMidi + currentDir;
            let attempts = 0;
            while (attempts < 4) {
                 const norm = (safeMidi % 12);
                 const scaleNorms = scaleTones.map(t => t % 12);
                 if (scaleNorms.includes(norm) && norm !== (rootMidi + 5) % 12) {
                     finalMidi = safeMidi;
                     break;
                 }
                 safeMidi += currentDir;
                 attempts++;
            }
        } else {
             // If not in scale (e.g. chromatic passing tone landing on avoid note), just shift semitone
             finalMidi += currentDir;
        }
    }

    // Final check for phrase endings: avoid ending on a chromatic passing tone
    if (sb.phraseSteps === 0 && !sb.isResting) {
        const keyRoot = KEY_ORDER.indexOf(cb.key);
        const keyIntervals = [0, 2, 4, 5, 7, 9, 11];
        const keyNotes = keyIntervals.map(i => (keyRoot + i) % 12);
        const midiVal = finalMidi % 12;
        
        if (!keyNotes.includes(midiVal) && !chordTones.some(t => (t % 12) === midiVal)) {
            // Resolve to nearest chord tone
            let bestMidi = finalMidi;
            let minDist = 13;
            chordTones.forEach(t => {
                let m = t;
                while (m < finalMidi - 6) m += 12;
                while (m > finalMidi + 6) m -= 12;
                const d = Math.abs(m - finalMidi);
                if (d < minDist) {
                    minDist = d;
                    bestMidi = m;
                }
            });
            finalMidi = bestMidi;
        }
    }

    if (style === 'minimal') {
        // Occasionally hold notes longer in minimal style
        if (Math.random() < 0.4) durationMultiplier = 3 + Math.floor(Math.random() * 5);
        else durationMultiplier = 2;
    } else if (style === 'shred' && sb.phraseSteps <= 1 && !sb.isResting) {
        // Shredders often end a run on a sustained chord tone with vibrato
        // We check <= 1 to catch the very end of the phrase
        if (Math.random() < 0.8) durationMultiplier = 8 + Math.floor(Math.random() * 8);
    }

    sb.busySteps = durationMultiplier - 1;

    return {
        freq: getFrequency(finalMidi),
        durationMultiplier
    };
}