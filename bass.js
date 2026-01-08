import { getFrequency, getMidi } from './utils.js';
import { arranger, cb, bb, sb, ctx } from './state.js';
import { KEY_ORDER } from './config.js';

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

    // --- BOSSA NOVA STYLE ---
    if (style === 'bossa') {
        const stepInMeasure = step % 16;
        const root = baseRoot;
        const fifth = clampAndNormalize(root + (currentChord.quality.includes('dim') ? 6 : 7));
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
        const intervals = currentChord.intervals;
        
        // Syncopated ghost notes
        if (stepInBeat === 2 || stepInBeat === 3) {
            return result(getFrequency(prevMidi || baseRoot), 2, 0.6, true);
        }

        // Bass 1st and 3rd beats are usually strong
        if (intBeat === 0 || intBeat === 2) {
            return result(getFrequency(baseRoot), null, 1.1);
        }

        // Octave jumps or 7ths/4ths
        const funkIntervals = [0, 12, intervals[intervals.length - 1], 5];
        const choice = funkIntervals[Math.floor(Math.random() * funkIntervals.length)];
        return result(getFrequency(clampAndNormalize(baseRoot + choice)), null, 0.9 + Math.random() * 0.2);
    }

    // --- NEO-SOUL STYLE ---
    if (style === 'neo') {
        const stepInMeasure = step % 16;
        // Deep register
        const deepRoot = clampAndNormalize(baseRoot - 12);
        
        if (stepInMeasure === 0) return result(getFrequency(deepRoot), null, 1.1);
        
        // Characteristic 10th or 7th
        if (stepInMeasure === 8) {
            const intervals = currentChord.intervals;
            const highNote = clampAndNormalize(baseRoot + (intervals[1] || 4) + 12);
            return result(getFrequency(highNote), null, 0.8);
        }
        
        // Dead notes on syncopated 16ths
        if (step % 4 === 3) return result(getFrequency(deepRoot), 1, 0.5, true);
        
        return result(getFrequency(deepRoot), null, 0.9);
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    
    // Check for eighth-note skip ("and" of a beat)
    if (beatIndex % 1 !== 0) {
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