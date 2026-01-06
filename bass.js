import { getFrequency, getMidi } from './utils.js';

/**
 * Generates a frequency for a bass line.
 * @param {Object} currentChord - The current chord object.
 * @param {Object} nextChord - The next chord object (for approach notes).
 * @param {number} beatIndex - The current beat within the chord (0, 0.5, 1, 1.5...).
 * @param {number|null} prevFreq - The frequency of the previously played note.
 * @param {number} centerMidi - The desired center pitch for the bass line.
 * @param {string} style - The rhythm style ('whole', 'half', 'quarter', 'arp', 'bossa').
 * @param {number} chordIndex - The index of the chord in the progression.
 * @param {number} step - The global step in sixteenth notes.
 * @returns {Object|number} The frequency and duration info of the bass note.
 */
export function getBassNote(currentChord, nextChord, beatIndex, prevFreq = null, centerMidi = 41, style = 'quarter', chordIndex = 0, step = 0) {
    if (!currentChord) return null;
    
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
        const useCommitment = style === 'quarter' && prevMidi !== null;
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

    let baseRoot = normalizeToRange(currentChord.rootMidi);

    const isSameAsPrev = (midi) => {
        if (!prevMidi) return false;
        return midi === prevMidi;
    };

    const withOctaveJump = (note) => {
        if (Math.random() < 0.15) {
            const direction = Math.random() < 0.5 ? 1 : -1;
            const shifted = note + (12 * direction);
            if (shifted >= absMin && shifted <= absMax) return shifted;
        }
        return note;
    };

    // Helper to return consistent result format
    const result = (freq, durationMultiplier = null, velocity = 1.0, muted = false) => {
        return { freq, durationMultiplier, velocity, muted };
    };

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
        
        // Bossa rhythm: 1, 2&, 3, 4&
        // Steps: 0, 6, 8, 14
        if (stepInMeasure === 0) return result(getFrequency(root));
        if (stepInMeasure === 6) return result(getFrequency(fifth), 2);
        if (stepInMeasure === 8) return result(getFrequency(fifth));
        if (stepInMeasure === 14) return result(getFrequency(root), 2);
        return null;
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    
    // Check for eighth-note skip ("and" of a beat)
    if (beatIndex % 1 !== 0) {
        const skipVel = 0.6 + Math.random() * 0.3;
        // 20% chance of a "Dead Note" (muted thump) on a skip
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
    
    const isBackbeat = (intBeat % 2 === 1);
    const velocity = isBackbeat ? 1.15 : 1.0;

    const patterns = ['scalar', 'arpeggio', 'chromatic', 'dominant'];
    const patternIdx = (chordIndex * 7 + (currentChord.quality === 'minor' ? 3 : 0)) % patterns.length;
    const strategy = patterns[patternIdx];

    // Beat 1: Root (at start of chord OR start of measure)
    if (intBeat === 0 || (style === 'quarter' && step % 16 === 0)) {
        return result(getFrequency(baseRoot), null, 1.1);
    }

    let targetRoot = nextChord ? normalizeToRange(nextChord.rootMidi) : baseRoot;

    // Final Beat of Chord: Approach Note
    if (intBeat === beatsInChord - 1 && nextChord) {
        // Enclosure Logic: If we played an enclosure note on Beat 3, we finish it here.
        // For simplicity, we'll just check if we want a chromatic, scalar, or dominant approach.
        let candidates = [
            targetRoot - 1, targetRoot + 1, // Chromatic
            targetRoot - 5, targetRoot + 7  // Dominant/Subdominant
        ];
        
        // If coming from below, try to approach from below or chromatic above
        let validCandidates = candidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));
        
        const finalApproach = validCandidates.length > 0 
            ? validCandidates[Math.floor(Math.random() * validCandidates.length)]
            : targetRoot - 5;
        return result(getFrequency(finalApproach), null, velocity);
    }

    // Intermediate beats (Beat 2 & 3 for 4-beat chords)
    if (beatsInChord === 4) {
        const intervals = currentChord.intervals;
        const isMinor = currentChord.quality === 'minor' || currentChord.quality === 'dim' || currentChord.quality === 'halfdim';
        
        if (intBeat === 1) { // Beat 2
            // 10% chance of a dead note on beat 2
            if (Math.random() < 0.1) return result(getFrequency(prevMidi || baseRoot), null, 0.8, true);

            if (strategy === 'arpeggio') {
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + (intervals[1] || (isMinor ? 3 : 4))))), null, velocity);
            } else if (strategy === 'scalar') {
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + (isMinor ? 2 : 2)))), null, velocity);
            } else if (strategy === 'chromatic') {
                const dir = targetRoot > baseRoot ? 1 : -1;
                return result(getFrequency(clampAndNormalize(baseRoot + dir)), null, velocity);
            } else {
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + 7))), null, velocity);
            }
        }
        
        if (intBeat === 2) { // Beat 3
            // Check for Enclosure Setup (targeting next chord)
            if (nextChord && Math.random() < 0.4) {
                // Play a note 1 scale step away from the target to set up chromatic approach on beat 4
                const enclosureNote = targetRoot + (Math.random() < 0.5 ? 2 : -2);
                return result(getFrequency(clampAndNormalize(enclosureNote)), null, velocity);
            }

            if (strategy === 'arpeggio') {
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + (intervals[2] || 7)))), null, velocity);
            } else if (strategy === 'scalar') {
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + (isMinor ? 3 : 4)))), null, velocity);
            } else if (strategy === 'chromatic') {
                const dir = targetRoot > baseRoot ? 1 : -1;
                return result(getFrequency(clampAndNormalize(baseRoot + dir * 2)), null, velocity);
            } else {
                const sixth = isMinor ? 8 : 9;
                return result(getFrequency(withOctaveJump(clampAndNormalize(baseRoot + sixth))), null, velocity);
            }
        }
    }

    // Fallback
    let chordTones = [];
    let ints = [...currentChord.intervals];
    if (!ints.includes(12)) ints.push(12);
    ints.forEach(i => {
        const n = baseRoot + i;
        if (n >= absMin && n <= absMax) chordTones.push(n);
        const nl = baseRoot + i - 12;
        if (nl >= absMin && nl <= absMax) chordTones.push(nl);
    });
    let available = chordTones.filter(n => !isSameAsPrev(n));
    if (available.length === 0) available = chordTones;
    if (prevMidi) {
        available.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
        return result(getFrequency(available[0]), null, velocity);
    }
    return result(getFrequency(available[Math.floor(Math.random() * available.length)]), null, velocity);
}