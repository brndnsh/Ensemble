import { getFrequency, getMidi } from './utils.js';
import { arranger, cb, bb, sb, ctx, gb } from './state.js';
import { KEY_ORDER, TIME_SIGNATURES, REGGAE_RIDDIMS } from './config.js';

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
export function getBassNote(currentChord, nextChord, beatIndex, prevFreq = null, centerMidi = 38, style = 'quarter', chordIndex = 0, step = 0, stepInChord = 0, isMinor = false) {
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    if (style === 'smart') {
        const mapping = { 
            'Rock': 'rock', 'Jazz': 'quarter', 'Funk': 'funk', 'Blues': 'quarter', 'Neo-Soul': 'neo',
            'Bossa Nova': 'bossa', 'Bossa': 'bossa', 'Latin/Clave': 'bossa', 'Reggae': 'dub', 'Afrobeat': 'funk',
            'Disco': 'disco', 'Acoustic': 'half'
        };
        style = mapping[gb.genreFeel] || mapping[gb.lastDrumPreset] || 'rock';
    }

    // --- Structural Energy Mapping (Intensity) ---
    const loopStep = step % (arranger.totalSteps || 1);
    let sectionStart = 0;
    let sectionEnd = arranger.totalSteps;
    const currentSectionId = currentChord.sectionId;
    
    // Safeguard: Ensure stepMap exists to prevent infinite loop
    if (arranger.stepMap && arranger.stepMap.length > 0) {
        for (let i = 0; i < arranger.stepMap.length; i++) {
            if (arranger.stepMap[i].chord.sectionId === currentSectionId) {
                sectionStart = arranger.stepMap[i].start;
                let j = i;
                let iterations = 0;
                // Add safety limit to internal while loop
                while (j < arranger.stepMap.length && arranger.stepMap[j].chord.sectionId === currentSectionId && iterations < 1000) {
                    sectionEnd = arranger.stepMap[j].end;
                    j++;
                    iterations++;
                }
                break; // Found the section, no need to keep searching
            }
        }
    }
    const sectionLength = sectionEnd - sectionStart;
    const intensity = sectionLength > 0 ? (step - sectionStart) / sectionLength : 0;
    
    let safeCenterMidi = (typeof centerMidi === 'number' && !isNaN(centerMidi)) ? centerMidi : 38;

    // --- Genre-Specific Register Offsets ---
    if (style === 'dub' || gb.genreFeel === 'Reggae') safeCenterMidi = 32;
    else if (style === 'disco' || gb.genreFeel === 'Disco') safeCenterMidi = 45;

    const prevMidi = getMidi(prevFreq);

    let absMin = Math.max(26, safeCenterMidi - 15); 
    let absMax = safeCenterMidi + 15;

    // --- Sweet Spot Constraints ---
    if (style === 'rock' || style === 'funk') {
        absMin = Math.max(28, absMin);
        absMax = Math.min(52, absMax);
    }
    
    // Final Range Safety
    if (absMax < absMin) absMax = absMin + 1;

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
            // Restrict jumps to stay below MIDI 55 to avoid clashing with Piano LH
            if (shifted >= absMin && shifted <= Math.min(absMax, 55)) return shifted;
        }
        return note;
    }

    const result = (freq, durationMultiplier = null, velocity = 1.0, muted = false) => {
        let timingOffset = 0;
        if (style === 'neo') timingOffset = 0.025; // 25ms laid-back "Dilla" feel
        
        // Convert freq to midi
        const midi = getMidi(freq);
        
        // Calculate standard duration in steps if not provided
        let durationSteps = durationMultiplier; 
        
        if (durationSteps === null) {
             if (style === 'whole') durationSteps = currentChord.beats * ts.stepsPerBeat;
             else if (style === 'half') durationSteps = (stepsPerMeasure / 2);
             else if (style === 'arp') durationSteps = (ts.stepsPerBeat); // Quarter note
             else if (style === 'rock') durationSteps = (ts.stepsPerBeat * 0.75); // Dotted 8th-ish
             else if (style === 'funk') durationSteps = (ts.stepsPerBeat * 0.5); // 8th
             else durationSteps = ts.stepsPerBeat; // Quarter default
        } else {
             if (style === 'rock') durationSteps = ts.stepsPerBeat * 0.7; 
             else if (style === 'funk') durationSteps = ts.stepsPerBeat * 0.4;
             else if (style === 'bossa') durationSteps = durationMultiplier ? durationMultiplier * (ts.stepsPerBeat / 4) : ts.stepsPerBeat; 
             else durationSteps = durationMultiplier;
        }
        
        return { 
            midi, 
            velocity, 
            durationSteps: durationSteps || ts.stepsPerBeat, 
            bendStartInterval: 0, 
            ccEvents: [], 
            muted, 
            timingOffset 
        };
    };

    const grouping = arranger.grouping || ts.grouping || [ts.beats];
    const stepInMeasure = step % stepsPerMeasure;
    
    // Use the structural metadata to identify important anchors
    const isDownbeat = stepInChord % ts.stepsPerBeat === 0;
    const isGroupStart = (() => {
        let accumulated = 0;
        for (let g of grouping) {
            if (stepInMeasure === accumulated) return true;
            accumulated += g * ts.stepsPerBeat;
        }
        return false;
    })();

    // --- HARMONIC RESET ---
    // Beat 1 of a chord: Always land on Root or 5th
    // Only force this for straight styles; syncopated styles (Bossa, Funk, Reggae) 
    // should maintain their rhythmic integrity.
    const isStraightStyle = ['rock', 'half', 'whole', 'arp', 'quarter', 'disco'].includes(style);
    if (stepInChord === 0 && isStraightStyle && gb.genreFeel !== 'Reggae') {
        return result(getFrequency(baseRoot), null, 1.15);
    }

    // --- WHOLE NOTE STYLE ---
    if (style === 'whole') return result(getFrequency(baseRoot));

    // --- HALF NOTE STYLE ---
    if (style === 'half') {
        const halfStep = Math.floor(stepsPerMeasure / 2);
        if (stepInChord % halfStep === 0) {
            if (stepInChord === 0) return result(getFrequency(baseRoot));
            const hasFlat5 = currentChord.quality === 'dim' || currentChord.quality === 'halfdim';
            let fifth = baseRoot + (hasFlat5 ? 6 : 7);
            return result(getFrequency(clampAndNormalize(fifth)));
        }
        return null;
    }

    // --- ARP STYLE ---
    if (style === 'arp') {
        if (!isDownbeat) return null;
        const beatInMeasure = Math.floor(stepInMeasure / ts.stepsPerBeat);
        const beatInPattern = beatInMeasure % 4;
        if (beatInPattern === 0 || isGroupStart) return result(getFrequency(baseRoot));
        const intervals = currentChord.intervals; 
        let targetInterval = (beatInPattern === 1 || beatInPattern === 3) ? (intervals[1] || 4) : (intervals[2] || 7);
        return result(getFrequency(clampAndNormalize(baseRoot + targetInterval)));
    }

    // --- ROCK STYLE (8th Note Pedal) ---
    if (style === 'rock') {
        const dur = 0.7; 
        const isPulse = ts.pulse.includes(stepInMeasure);
        const velocity = (isGroupStart || (isPulse && isDownbeat)) ? 1.25 : 1.1;

        const lastBeatIndex = ts.beats - 1;
        const beat = Math.floor(stepInMeasure / ts.stepsPerBeat);

        if (beat === lastBeatIndex) {
            if (Math.random() < 0.4) {
                 if (stepInMeasure === (lastBeatIndex * ts.stepsPerBeat)) { 
                     const fillNote = Math.random() < 0.5 ? baseRoot + 12 : baseRoot + 7;
                     return result(getFrequency(clampAndNormalize(fillNote)), dur, 1.15);
                 }
            }
        }
        
        return result(getFrequency(baseRoot), dur, velocity);
    }

    // --- BOSSA NOVA / SAMBA STYLE ---
    if (style === 'bossa') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const stepInMeasure = step % stepsPerMeasure;
        const root = baseRoot;
        const fifth = clampAndNormalize(root + (currentChord.quality.includes('dim') ? 6 : 7));
        const intensity = ctx.bandIntensity;
        
        // High Intensity: Samba variation (Driving 8th notes with syncopated accents)
        if (intensity > 0.65) {
            // Driving surdo-style pattern
            if (stepInMeasure === 0) return result(getFrequency(root), 2, 1.1);
            if (stepInMeasure === 4) return result(getFrequency(root), 2, 0.95);
            if (stepInMeasure === 8) return result(getFrequency(root), 2, 1.1);
            if (stepInMeasure === 12) return result(getFrequency(root), 2, 0.95);
            
            // Synco-accents (the "pull")
            if (stepInMeasure === 6 || stepInMeasure === 14) {
                const note = Math.random() < 0.7 ? fifth : root + 12;
                return result(getFrequency(clampAndNormalize(note)), 2, 1.25);
            }
            
            // Random 16th ghosting for "percolation"
            if (intensity > 0.85 && (stepInMeasure % 2 === 1) && Math.random() < 0.2) {
                return result(getFrequency(prevMidi || root), 1, 0.6, true);
            }
        } else {
            // Standard Bossa Nova: 1, (2)&, 3, (4)&
            if (stepInMeasure === 0) return result(getFrequency(root), 4, 1.05);
            if (stepInMeasure === 6) return result(getFrequency(fifth), 2, 1.1);
            if (stepInMeasure === 8) return result(getFrequency(root), 4, 1.05);
            if (stepInMeasure === 14) return result(getFrequency(fifth), 2, 1.1);
            
            // Subtle ghost notes at medium intensity
            if (intensity > 0.4 && stepInMeasure === 15 && Math.random() < 0.3) {
                return result(getFrequency(root), 1, 0.55, true);
            }
        }
        return null;
    }

    // --- FUNK STYLE ---
    if (style === 'funk') {
        const stepInBeat = stepInChord % 4;
        const intBeat = Math.floor(stepInChord / 4);
        
        // The "One" is sacred - Heavy Root with good sustain
        if (stepInChord === 0) return result(getFrequency(baseRoot), 1.5, 1.25);

        // "Bootsy" Octave Pops on the 'and' (upbeats)
        if (stepInBeat === 2) {
             if (intBeat < 3 && Math.random() < 0.45) {
                 return result(getFrequency(clampAndNormalize(baseRoot + 12)), 0.4, 1.15); 
             }
        }

        // Beat 3 (Backbeat) 
        if (intBeat === 2 && stepInBeat === 0 && Math.random() < 0.4) {
             return result(getFrequency(baseRoot), 0.8, 1.1);
        }

        // The "Grease" - b7 or 5th usage on weak 16ths
        if ((stepInBeat === 1 || stepInBeat === 3) && Math.random() < 0.3) {
            const useFlat7 = currentChord.intervals.includes(10) || Math.random() < 0.6;
            const interval = useFlat7 ? 10 : 7;
            const note = baseRoot + interval; 
            return result(getFrequency(clampAndNormalize(note)), 0.5, 0.95);
        }

        // Beat 4: Turnaround / Fill
        if (intBeat === 3) {
            if (stepInBeat >= 2 && Math.random() < 0.5) {
                const approach = Math.random() < 0.5 ? baseRoot - 1 : baseRoot + 7;
                return result(getFrequency(clampAndNormalize(approach)), 0.5, 1.1);
            }
        }

        // Ghost notes (dead notes)
        if (Math.random() < 0.15) {
             return result(getFrequency(prevMidi || baseRoot), 0.25, 0.65, true);
        }

        return null;
    }

    // --- DUB STYLE (Reggae) ---
    if (style === 'dub') {
        const deepRoot = clampAndNormalize(baseRoot - 12); 
        const measureStep = step % 16; // Standardize to 4/4 riddims
        
        let selectedRiddim = 'One Drop';
        if (ctx.bandIntensity > 0.8) selectedRiddim = 'Steppers';
        else if (ctx.bandIntensity > 0.6) selectedRiddim = 'Stalag';
        else if (ctx.bandIntensity > 0.4) selectedRiddim = '54-46';
        else if (ctx.bandIntensity > 0.2) selectedRiddim = 'Real Rock';

        const riddim = REGGAE_RIDDIMS[selectedRiddim];
        const match = riddim.find(r => r[0] === measureStep);

        if (match) {
            const [s, interval, vel, dur] = match;
            const note = clampAndNormalize(deepRoot + interval);
            return result(getFrequency(note), dur, vel * (0.9 + Math.random() * 0.2));
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
        
        // Prioritize chromatic approach if distance is significant (>= 2 semitones)
        const diff = Math.abs(prevMidi - targetRoot);
        let approach;

        if (diff >= 2 && Math.random() < 0.8) {
            // Strong pull: pick chromatic neighbor (half-step away from target)
            // Choose the direction that is most "on the way" or creates a nice contour
            const below = targetRoot - 1;
            const above = targetRoot + 1;
            
            if (prevMidi < targetRoot) {
                // Moving up: approach from below or above depending on leap
                approach = (targetRoot - prevMidi > 5) ? above : below;
            } else {
                // Moving down: approach from above or below
                approach = (prevMidi - targetRoot > 5) ? below : above;
            }
            
            // Validate range
            if (approach < absMin || approach > absMax) {
                 approach = (approach < absMin) ? targetRoot + 1 : targetRoot - 1;
            }
        } else {
            // Standard approach candidates
            let candidates = [targetRoot - 1, targetRoot + 1, targetRoot - 5, targetRoot + 7];
            let valid = candidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));
            approach = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : targetRoot - 5;
        }
        
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
    if (style === 'smart') {
        const mapping = { 
            'Rock': 'rock', 'Jazz': 'quarter', 'Funk': 'funk', 'Blues': 'quarter', 'Neo-Soul': 'neo',
            'Bossa Nova': 'bossa', 'Bossa': 'bossa', 'Latin/Clave': 'bossa', 'Reggae': 'dub', 'Afrobeat': 'funk',
            'Disco': 'disco', 'Acoustic': 'half'
        };
        style = mapping[gb.genreFeel] || mapping[gb.lastDrumPreset] || 'rock';
    }
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
        const mStep = step % stepsPerMeasure;
        const intensity = ctx.bandIntensity;
        
        if (intensity > 0.65) {
            // Samba pattern steps: 1, 2, "&" of 2, 3, 4, "&" of 4
            const sambaSteps = [0, 4, 6, 8, 12, 14];
            if (sambaSteps.includes(mStep)) return true;
            // Allow all 16ths at extremely high intensity for potential ghost notes
            if (intensity > 0.85) return true; 
        }
        
        return [0, 6, 8, 14].filter(s => s < stepsPerMeasure).includes(mStep);
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