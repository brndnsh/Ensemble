import { getFrequency, getMidi } from './utils.js';
import { arranger, cb, bb, sb, ctx } from './state.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';

/**
 * Determines the best scale for the bass based on chord and context.
 */
function getScaleForBass(chord, nextChord, isMinor = false) {
    const isV7toMinor = chord.intervals.includes(10) && chord.intervals.includes(4) && 
                        nextChord && (nextChord.quality === 'minor' || nextChord.quality === 'dim' || nextChord.quality === 'halfdim');

    if (isV7toMinor) return [0, 1, 4, 5, 7, 8, 10]; // Phrygian Dominant

    // Mode-aware diatonic scaling
    if (isMinor) {
        if (chord.quality === 'major') return [0, 2, 4, 5, 7, 9, 10]; // Mixolydian (b7 common in minor)
        if (chord.quality === 'minor') return [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
    }

    // Fallback to standard chord-scale
    switch (chord.quality) {
        case 'minor': return [0, 2, 3, 5, 7, 9, 10]; // Dorian
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'maj7': return [0, 2, 4, 5, 7, 9, 11];
        default: 
            if (chord.intervals.includes(10)) return [0, 2, 4, 5, 7, 9, 10]; // Mixolydian
            return [0, 2, 4, 5, 7, 9, 11]; // Major
    }
}

/**
 * Generates a frequency for a bass line.
 */
export function getBassNote(currentChord, nextChord, beatIndex, prevFreq = null, centerMidi = 41, style = 'quarter', chordIndex = 0, step = 0, stepInChord = 0, isMinor = false) {
    if (!currentChord) return null;

    // --- Structural Energy Mapping (Intensity) ---
    const loopStep = step % (arranger.totalSteps || 1);
    let sectionStart = 0;
    let sectionEnd = arranger.totalSteps;
    const currentSectionId = currentChord.sectionId;
    
    for (let i = 0; i < arranger.stepMap.length; i++) {
        if (arranger.stepMap[i].chord.sectionId === currentSectionId) {
            sectionStart = arranger.stepMap[i].start;
            let j = i;
            while (j < arranger.stepMap.length && arranger.stepMap[j].chord.sectionId === currentSectionId) {
                sectionEnd = arranger.stepMap[j].end;
                j++;
            }
            break;
        }
    }
    const sectionLength = sectionEnd - sectionStart;
    const intensity = sectionLength > 0 ? (step - sectionStart) / sectionLength : 0;
    
    const safeCenterMidi = (typeof centerMidi === 'number' && !isNaN(centerMidi)) ? centerMidi : 41;
    const prevMidi = getMidi(prevFreq);

    const absMin = Math.max(26, safeCenterMidi - 15); 
    const absMax = safeCenterMidi + 15;

    const clampAndNormalize = (midi) => {
        if (!Number.isFinite(midi)) return safeCenterMidi;
        let pc = ((midi % 12) + 12) % 12;
        let octave = Math.floor(safeCenterMidi / 12) * 12;
        let best = -1;
        let minDiff = 999999;
        
        const check = (off) => {
            const c = octave + off + pc;
            if (c >= absMin && c <= absMax) {
                const diff = Math.abs(c - safeCenterMidi);
                if (diff < minDiff) { minDiff = diff; best = c; }
            }
        };
        check(-12); check(0); check(12);
        
        if (best !== -1) return best;
        return Math.max(absMin, Math.min(absMax, octave + pc));
    };

    const normalizeToRange = (midi) => {
        if (!Number.isFinite(midi)) return safeCenterMidi;
        const useCommitment = (style === 'quarter' || style === 'funk') && prevMidi !== null;
        const targetRef = useCommitment ? (prevMidi * 0.7 + safeCenterMidi * 0.3) : safeCenterMidi;
        
        let bestCandidate = 0;
        let minDiff = 999999;
        const pc = ((midi % 12) + 12) % 12;
        const baseOctave = Math.floor(targetRef / 12) * 12;

        const check = (offset) => {
             const val = baseOctave + offset + pc;
             const diff = Math.abs(val - targetRef);
             if (diff < minDiff) { minDiff = diff; bestCandidate = val; }
        };
        check(0); check(-12); check(12);
        return clampAndNormalize(bestCandidate);
    };

    // Use slash chord bass note if it exists, otherwise use chord root
    let baseRoot = normalizeToRange(currentChord.bassMidi !== null && currentChord.bassMidi !== undefined ? currentChord.bassMidi : currentChord.rootMidi);

    // Dynamic Register Shift: Move up slightly as intensity builds
    if (intensity > 0.6 && (style === 'funk' || style === 'quarter')) {
        baseRoot = clampAndNormalize(baseRoot + (Math.random() < 0.2 ? 12 : 0));
    }

    const isSameAsPrev = (midi) => {
        if (!prevMidi) return false;
        return midi === prevMidi;
    };

    const withOctaveJump = (note) => {
        if (Math.random() < 0.15 + (intensity * 0.15)) { // More jumps at high intensity
            const direction = Math.random() < 0.5 ? 1 : -1;
            const shifted = note + (12 * direction);
            if (shifted >= absMin && shifted <= absMax) return shifted;
        }
        return note;
    };

    const result = (freq, durationMultiplier = null, velocity = 1.0, muted = false) => {
        let timingOffset = 0;
        if (style === 'neo') timingOffset = 0.015; // 15ms laid-back feel
        return { freq, durationMultiplier, velocity, muted, timingOffset };
    };

    // --- HARMONIC RESET ---
    // Beat 1 of a chord: Always land on Root or 5th
    if (stepInChord === 0) {
        return result(getFrequency(baseRoot), null, 1.15);
    }

    // --- WHOLE NOTE STYLE ---
    if (style === 'whole') return result(getFrequency(baseRoot));

    // --- HALF NOTE STYLE ---
    if (style === 'half') {
        if (beatIndex === 0) return result(getFrequency(baseRoot));
        const beatsInChord = Math.round(currentChord.beats);
        if (beatIndex >= beatsInChord / 2 && nextChord && Math.random() < 0.5) {
            let target = normalizeToRange(nextChord.rootMidi);
            return result(getFrequency(target + (Math.random() < 0.5 ? 1 : -1)));
        }
        const hasFlat5 = currentChord.quality === 'dim' || currentChord.quality === 'halfdim';
        let fifth = baseRoot + (hasFlat5 ? 6 : 7);
        return result(getFrequency(clampAndNormalize(fifth)));
    }

    // --- ARP STYLE ---
    if (style === 'arp') {
        const beatInPattern = Math.floor(beatIndex) % 4;
        if (beatInPattern === 0) return result(getFrequency(baseRoot));
        const intervals = currentChord.intervals; 
        let targetInterval = (beatInPattern === 1 || beatInPattern === 3) ? (intervals[1] || 4) : (intervals[2] || 7);
        return result(getFrequency(clampAndNormalize(baseRoot + targetInterval)));
    }

    // --- ROCK STYLE (8th Note Pedal) ---
    if (style === 'rock') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;
        const beat = Math.floor(stepInMeasure / ts.stepsPerBeat);
        const isDownbeat = stepInMeasure % ts.stepsPerBeat === 0;

        // Palm-muted feel (Cliff Williams / Nate Mendel tightness)
        const dur = 0.7; 

        // Driving 8ths, mostly Root
        // Heavy accents on 1 and 3 (Michael Anthony thunder)
        // 3rd beat index is 2
        // Pulse accent based on meter config
        const isPulse = ts.pulse.includes(stepInMeasure);
        const velocity = isPulse && isDownbeat ? 1.25 : 1.1;

        // Fills/Transitions (Nate Mendel melodic punch)
        // Occurs on the last beat of the measure (Beat 4 in 4/4)
        const lastBeatIndex = ts.beats - 1;
        if (beat === lastBeatIndex) {
            // High energy fill probability
            if (Math.random() < 0.4) {
                 // Mendel often uses higher register fills or drops 
                 // Pattern: 8th notes on (Root -> 5th) or (Octave -> 5th)
                 if (stepInMeasure === (lastBeatIndex * ts.stepsPerBeat)) { // 4
                     const fillNote = Math.random() < 0.5 ? baseRoot + 12 : baseRoot + 7;
                     return result(getFrequency(clampAndNormalize(fillNote)), dur, 1.15);
                 }
                 if (stepInMeasure === (lastBeatIndex * ts.stepsPerBeat) + (ts.stepsPerBeat / 2)) { // 4-and
                     // Return to 5th or chromatic approach to next root
                     const fillNote = Math.random() < 0.5 ? baseRoot + 7 : baseRoot + 5; 
                     return result(getFrequency(clampAndNormalize(fillNote)), dur, 1.1);
                 }
            }
        }
        
        // Grit/Ghost notes (rarely, on the 'and' of weak beats)
        if (!isDownbeat && !isPulse && Math.random() < 0.05) {
             return result(getFrequency(baseRoot), dur, 0.8, true);
        }
        
        return result(getFrequency(baseRoot), dur, velocity);
    }

    // --- BOSSA NOVA STYLE ---
    if (style === 'bossa') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;
        const root = baseRoot;
        const fifth = clampAndNormalize(root + (currentChord.quality.includes('dim') ? 6 : 7));
        
        // Bossa clave is tricky in odd meters. We'll stick to the core pattern for 4/4 and truncate/adapt.
        // Core: 1, (2)and, 3, (4)and -> Steps 0, 6, 8, 14
        
        if (stepInMeasure === 0) return result(getFrequency(root));
        if (stepInMeasure === 6) return result(getFrequency(fifth), 2);
        if (stepInMeasure === 8) return result(getFrequency(fifth));
        if (stepInMeasure === 14) return result(getFrequency(root), 2);
        return null;
    }

    // --- FUNK STYLE ---
    if (style === 'funk') {
        const stepInBeat = stepInChord % 4;
        const intBeat = Math.floor(stepInChord / 4);
        
        // The "One" is sacred - Heavy Root with good sustain
        if (stepInChord === 0) return result(getFrequency(baseRoot), 1.5, 1.25);

        // "Bootsy" Octave Pops on the 'and' (upbeats)
        // High probability on the 'and' of 1 or 2 to lock with the kick/snare interplay
        if (stepInBeat === 2) {
             if (intBeat < 3 && Math.random() < 0.45) {
                 return result(getFrequency(clampAndNormalize(baseRoot + 12)), 0.4, 1.15); // Short, punchy pop
             }
        }

        // Beat 3 (Backbeat) - Sometimes reinforce, sometimes leave space for snare
        if (intBeat === 2 && stepInBeat === 0 && Math.random() < 0.4) {
             return result(getFrequency(baseRoot), 0.8, 1.1);
        }

        // The "Grease" - b7 or 5th usage on weak 16ths ('e' or 'a')
        if ((stepInBeat === 1 || stepInBeat === 3) && Math.random() < 0.3) {
            // Funk loves the b7 (minor 7th) even on major chords (The "James Brown" chord)
            const useFlat7 = currentChord.intervals.includes(10) || Math.random() < 0.6;
            const interval = useFlat7 ? 10 : 7;
            const note = baseRoot + interval; 
            return result(getFrequency(clampAndNormalize(note)), 0.5, 0.95);
        }

        // Beat 4: Turnaround / Fill to lead back to the One
        if (intBeat === 3) {
            // On the 'and' or 'a' of 4
            if (stepInBeat >= 2 && Math.random() < 0.5) {
                // Chromatic approach from below (b2) or above (b2) or 5th
                const approach = Math.random() < 0.5 ? baseRoot - 1 : baseRoot + 7;
                return result(getFrequency(clampAndNormalize(approach)), 0.5, 1.1);
            }
        }

        // Ghost notes (dead notes) for percolation
        // Keep them tight (short duration)
        if (Math.random() < 0.15) {
             return result(getFrequency(prevMidi || baseRoot), 0.25, 0.65, true);
        }

        return null;
    }

    // --- ROCCO STYLE (Tower of Power - Finger Funk) ---
    if (style === 'rocco') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;
        
        // Staccato feel (Left-hand muting)
        const dur = 0.6; 

        // Always anchor the 1 (Heavy Root)
        if (stepInMeasure === 0) return result(getFrequency(baseRoot), dur, 1.25);
        
        // Syncopation Accents: 1(a), 2(&), 3, 4, 4(&)
        // The 'a' of 1 (step 3) and '&' of 2 (step 6) are classic syncopations
        // Filter accents that are out of bounds for the current meter
        const accents = [3, 6, 8, 12, 14].filter(s => s < stepsPerMeasure); 
        const isAccent = accents.includes(stepInMeasure);

        // 1. Tonal Hits (Accents)
        if (isAccent) {
            if (Math.random() < 0.9) {
                let note = baseRoot;
                const r = Math.random();
                
                // Octave jumps common on the syncopated upbeats
                if ([3, 6, 14].includes(stepInMeasure) && r > 0.4) {
                    note = baseRoot + 12;
                } 
                // 5th on the back half
                else if (stepInMeasure >= 8 && r > 0.7) {
                    note = baseRoot + 7;
                }
                
                return result(getFrequency(clampAndNormalize(note)), dur, 1.2);
            }
        }
        
        // 2. The "Chug" (Machine Gun 16ths)
        // High density of notes, mostly muted or pedal roots
        if (Math.random() < 0.85) {
             const isGhost = Math.random() < 0.5; // 50% ghost, 50% tonal pedal
             // If tonal, keep it low (root)
             return result(getFrequency(baseRoot), dur, isGhost ? 0.85 : 0.95, isGhost);
        }

        return null;
    }

    // --- NEO-SOUL STYLE ---
    if (style === 'neo') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;
        // Deep register
        const deepRoot = clampAndNormalize(baseRoot - 12);
        
        if (stepInMeasure === 0) return result(getFrequency(deepRoot), null, 1.1);
        
        // Characteristic 10th or 7th
        if (stepInMeasure === 8 && stepsPerMeasure > 8) {
            const intervals = currentChord.intervals;
            const highNote = clampAndNormalize(baseRoot + (intervals[1] || 4) + 12);
            return result(getFrequency(highNote), null, 0.8);
        }
        
        // Dead notes on syncopated 16ths
        if (step % 4 === 3) return result(getFrequency(deepRoot), 1, 0.5, true);
        
        return result(getFrequency(deepRoot), null, 0.9);
    }

    // --- DISCO STYLE ---
    if (style === 'disco') {
        const stepInBeat = stepInChord % 4; 
        
        // Downbeats (1, 2, 3, 4): Root
        if (stepInBeat === 0) {
            return result(getFrequency(baseRoot), 0.5, 1.15); // Punchy root
        }
        
        // Upbeats ('and'): Octave
        if (stepInBeat === 2) {
             return result(getFrequency(clampAndNormalize(baseRoot + 12)), 0.4, 1.05); // Short octave pop
        }
        
        // Occasional 16th note ghost/pickup
        if (stepInBeat === 3 && Math.random() < 0.2) {
            return result(getFrequency(baseRoot), 0.3, 0.75, true);
        }
        
        return null;
    }

    // --- DUB STYLE ---
    if (style === 'dub') {
        // Deep sub-bass feel.
        const deepRoot = clampAndNormalize(baseRoot - 12); // Force low octave
        
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;

        // Beat 1: Heavy Anchor
        if (stepInMeasure === 0) return result(getFrequency(deepRoot), 1.0, 1.2); 
        
        // Beat 2.5 (the 'and' of 2): Syncopated 5th or Octave
        if (beatIndex === 1.5 && Math.random() < 0.6) {
             return result(getFrequency(deepRoot + 7), 0.8, 1.0);
        }
        
        // Beat 3: often a rest or a lower 5th
        if (beatIndex === 2.0 && Math.random() < 0.5) {
             return result(getFrequency(deepRoot), 1.0, 1.1);
        }
        
        // Beat 4: Fill/Pickup
        if (beatIndex >= 3.0 && stepInChord % 2 === 0) { // 8th notes on beat 4
             if (Math.random() < 0.4) {
                 // b7 or 5th
                 const interval = currentChord.intervals.includes(10) ? 10 : 7;
                 return result(getFrequency(deepRoot + interval), 0.5, 0.9);
             }
        }
        
        return null;
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    
    // Check for eighth-note skip ("and" of a beat)
    if (beatIndex % 1 !== 0) {
        if (Math.random() < 0.3) {
            const skipVel = 0.6 + Math.random() * 0.3;
            const isMuted = Math.random() < 0.2;
            if (Math.random() < 0.7 && prevMidi) {
                const ghostNote = Math.random() < 0.3 ? withOctaveJump(prevMidi) : prevMidi;
                return result(getFrequency(ghostNote), 2, skipVel, isMuted);
            } else {
                const offset = Math.random() < 0.5 ? 1 : -1;
                return result(getFrequency(clampAndNormalize(prevMidi + offset)), 2, skipVel, isMuted);
            }
        }
        return null;
    }

    const intBeat = Math.floor(beatIndex);
    const beatsInChord = Math.round(currentChord.beats);
    const velocity = (intBeat % 2 === 1) ? 1.15 : 1.0;

    // Use smarter scale logic
    const scale = getScaleForBass(currentChord, nextChord, isMinor);

    // Final Beat of Chord: Smart Approach Note
    if (intBeat === beatsInChord - 1 && nextChord) {
        const nextTarget = nextChord.bassMidi !== null && nextChord.bassMidi !== undefined ? nextChord.bassMidi : nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        let candidates = [targetRoot - 1, targetRoot + 1, targetRoot - 5, targetRoot + 7];
        let valid = candidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));
        const approach = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : targetRoot - 5;
        return result(getFrequency(approach), null, velocity);
    }

    // Intermediate beats: Scale-aware walking
    if (intBeat > 0) {
        // Landing on 5th on beat 3 is very common in walking bass
        if (intBeat === 2 && Math.random() < 0.6) {
            const hasFlat5 = currentChord.quality.includes('dim');
            return result(getFrequency(clampAndNormalize(baseRoot + (hasFlat5 ? 6 : 7))), null, velocity);
        }

        // Otherwise, move stepwise using the scale
        const dir = (prevMidi && prevMidi > baseRoot + 12) ? -1 : (prevMidi < baseRoot - 5 ? 1 : (Math.random() > 0.5 ? 1 : -1));
        const currentPC = (prevMidi - baseRoot + 120) % 12;
        const scaleIdx = scale.indexOf(currentPC);
        
        let nextPC;
        if (scaleIdx !== -1) {
            const nextIdx = (scaleIdx + dir + scale.length) % scale.length;
            nextPC = scale[nextIdx];
        } else {
            nextPC = scale[0];
        }
        
        return result(getFrequency(clampAndNormalize(baseRoot + nextPC)), null, velocity);
    }

    return result(getFrequency(baseRoot), null, 1.1);
}

/**
 * Determines if the bass should play at a specific step.
 */
export function isBassActive(style, step, stepInChord) {
    if (style === 'whole') return stepInChord === 0;
    if (style === 'half') return stepInChord % 8 === 0;
    if (style === 'arp') return stepInChord % 4 === 0;
    if (style === 'rock') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        return stepInChord % (ts.stepsPerBeat / 2) === 0; // 8th notes
    }
    if (style === 'bossa') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        return [0, 6, 8, 14].filter(s => s < stepsPerMeasure).includes(step % stepsPerMeasure);
    }
    
    // For these styles, we largely rely on getBassNote to decide (return null for silence),
    // but we can provide a broad filter to save cycles, or just return true to delegate.
    
    if (style === 'quarter') {
        // Quarter notes always, plus random 8ths
        if (stepInChord % 4 === 0) return true;
        if (stepInChord % 2 === 0) return true; // Allow chance for 8ths
        return false;
    }
    
    if (style === 'funk') {
        // Allow all 16ths to be potential candidates
        return true;
    }

    if (style === 'rocco') return true;
    if (style === 'disco') return true;
    if (style === 'dub') return true;

    if (style === 'neo') {
        if (stepInChord === 0) return true;
        if (stepInChord % 8 === 0) return true;
        if (step % 4 === 3) return true; // Syncopated 16ths
        return false;
    }

    return false;
}
