import { getFrequency } from './utils.js';

/**
 * Generates a frequency for a bass line.
 * @param {Object} currentChord - The current chord object.
 * @param {Object} nextChord - The next chord object (for approach notes).
 * @param {number} stepInChord - The current beat within the chord duration (0, 1, 2, 3...).
 * @param {number|null} prevFreq - The frequency of the previously played note.
 * @param {number} centerMidi - The desired center pitch for the bass line.
 * @param {string} style - The rhythm style ('whole', 'half', 'quarter', 'arp').
 * @returns {number} The frequency of the bass note.
 */
export function getBassNote(currentChord, nextChord, stepInChord, prevFreq = null, centerMidi = 41, style = 'quarter') {
    if (!currentChord) return 0;

    // Helper to get MIDI from Freq
    const getMidi = (f) => f ? Math.round(12 * Math.log2(f / 440) + 69) : null;
    const prevMidi = getMidi(prevFreq);

    // Hard limits to keep within a consistent bass guitar range
    // D1 (26) is set as the absolute floor.
    const absMin = Math.max(26, centerMidi - 15); 
    const absMax = centerMidi + 15;

    const normalizeToRange = (midi) => {
        if (!Number.isFinite(midi)) return centerMidi;
        
        // Register commitment pull: Only apply for walking bass (quarter)
        // Others (arp, whole, half) should stay anchored to center for stability.
        const useCommitment = style === 'quarter' && prevMidi !== null;
        const targetRef = useCommitment ? (prevMidi * 0.7 + centerMidi * 0.3) : centerMidi;
        
        // Robust modulo to get pitch class 0-11
        let m = ((midi % 12) + 12) % 12;
        
        // Find the octave of 'm' closest to 'targetRef'
        let baseOct = Math.floor(targetRef / 12) * 12;
        let candidates = [baseOct + m, baseOct - 12 + m, baseOct + 12 + m];
        
        candidates.sort((a, b) => {
            const distA = Math.abs(a - targetRef);
            const distB = Math.abs(b - targetRef);
            if (Math.abs(distA - distB) < 0.1) {
                return Math.abs(a - centerMidi) - Math.abs(b - centerMidi);
            }
            return distA - distB;
        });
        
        let best = candidates[0];

        // Hard Safety Rail
        let iterations = 0;
        while (best < absMin && iterations < 10) { best += 12; iterations++; }
        while (best > absMax && iterations < 10) { best -= 12; iterations++; }
        
        return best;
    };

    let baseRoot = normalizeToRange(currentChord.rootMidi);

    const isSameAsPrev = (midi) => {
        if (!prevMidi) return false;
        return midi === prevMidi;
    };

    // Helper to apply random octave jumps
    const withOctaveJump = (note) => {
        if (Math.random() < 0.15) { // 15% chance
            const direction = Math.random() < 0.5 ? 1 : -1;
            const shifted = note + (12 * direction);
            if (shifted >= absMin && shifted <= absMax) {
                return shifted;
            }
        }
        return note;
    };

    // --- WHOLE NOTE STYLE: Root only ---
    if (style === 'whole') {
        return getFrequency(baseRoot);
    }

    // --- HALF NOTE STYLE: Root and Leading/5th ---
    if (style === 'half') {
        if (stepInChord === 0) return getFrequency(baseRoot);
        
        const beatsInChord = Math.round(currentChord.beats * 4);
        if (stepInChord >= beatsInChord / 2 && nextChord && Math.random() < 0.5) {
            let target = normalizeToRange(nextChord.rootMidi);
            return getFrequency(target + (Math.random() < 0.5 ? 1 : -1));
        }

        const hasFlat5 = currentChord.quality === 'dim' || currentChord.quality === 'halfdim';
        let fifth = baseRoot + (hasFlat5 ? 6 : 7);
        while (fifth > absMax) fifth -= 12;
        while (fifth < absMin) fifth += 12;
        return getFrequency(fifth);
    }

    // --- ARP STYLE: 1-3-5-3 Pattern (Stable) ---
    if (style === 'arp') {
        const beatInPattern = stepInChord % 4;
        if (beatInPattern === 0) return getFrequency(baseRoot);
        
        const intervals = currentChord.intervals; 
        let targetInterval = 0;
        
        if (beatInPattern === 1 || beatInPattern === 3) {
            targetInterval = intervals[1] || 4;
        } else if (beatInPattern === 2) {
            targetInterval = intervals[2] || 7;
        }
        
        let note = baseRoot + targetInterval;
        while (note > absMax) note -= 12;
        while (note < absMin) note += 12;
        return getFrequency(note);
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    
    // Beat 1 (or Measure Start): Root... mostly.
    if (stepInChord % 4 === 0) {
        if (stepInChord === 0) return getFrequency(baseRoot);
        
        // mononoty breaker for long chords
        if (Math.random() < 0.4) {
             const intervals = currentChord.intervals;
             const targetInt = intervals.length > 2 ? intervals[intervals.length - 1] : (intervals[1] || 4);
             let altNote = baseRoot + targetInt;
             while (altNote > absMax) altNote -= 12;
             while (altNote < absMin) altNote += 12;
             return getFrequency(withOctaveJump(altNote));
        }
        return getFrequency(withOctaveJump(baseRoot));
    }

    const beatsInChord = Math.round(currentChord.beats * 4);
    let targetRoot = nextChord ? normalizeToRange(nextChord.rootMidi) : baseRoot;
    
    // Beat 4: Final Approach Note
    if (stepInChord === beatsInChord - 1 && nextChord) {
        let candidates = [
            targetRoot - 1, targetRoot + 1, // Chromatic
            targetRoot - 2, targetRoot + 2, // Scale
            targetRoot - 5, targetRoot + 7  // Dominant
        ];

        let validCandidates = candidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));
        
        if (validCandidates.length > 0 && prevMidi) {
            if (prevMidi > targetRoot) {
                const fromAbove = validCandidates.filter(n => n > targetRoot);
                if (fromAbove.length > 0) validCandidates = fromAbove;
            } else if (prevMidi < targetRoot) {
                const fromBelow = validCandidates.filter(n => n < targetRoot);
                if (fromBelow.length > 0) validCandidates = fromBelow;
            }
        }

        if (validCandidates.length > 0) {
            return getFrequency(validCandidates[Math.floor(Math.random() * validCandidates.length)]);
        }
        return getFrequency(targetRoot - 5); 
    }

    // Beat 3: Setup note
    if (stepInChord === 2 && nextChord) {
        const setupCandidates = [
            targetRoot - 2, targetRoot - 3, targetRoot - 5,
            targetRoot + 2, targetRoot + 3, targetRoot + 5
        ];
        
        let validSetup = setupCandidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));

        if (validSetup.length > 0 && prevMidi) {
             if (prevMidi > targetRoot) {
                const fromAbove = validSetup.filter(n => n > targetRoot && n <= prevMidi + 2); 
                if (fromAbove.length > 0) validSetup = fromAbove;
                else {
                     const anyAbove = validSetup.filter(n => n > targetRoot);
                     if (anyAbove.length > 0) validSetup = anyAbove;
                }
            } else if (prevMidi < targetRoot) {
                const fromBelow = validSetup.filter(n => n < targetRoot && n >= prevMidi - 2);
                if (fromBelow.length > 0) validSetup = fromBelow;
                else {
                    const anyBelow = validSetup.filter(n => n < targetRoot);
                    if (anyBelow.length > 0) validSetup = anyBelow;
                }
            }
        }

        if (validSetup.length > 0) {
            return getFrequency(withOctaveJump(validSetup[Math.floor(Math.random() * validSetup.length)]));
        }
    }

    // Beat 2: Chord Tones / Passing
    if (stepInChord === 1) {
        let options = [];
        let extendedIntervals = [...currentChord.intervals];
        if (!extendedIntervals.includes(12)) extendedIntervals.push(12);
        
        extendedIntervals.forEach(interval => {
            const note = baseRoot + interval;
            if (note >= absMin && note <= absMax) options.push(note);
            const lowerNote = baseRoot + interval - 12;
            if (lowerNote >= absMin && lowerNote <= absMax) options.push(lowerNote);
        });
        options = [...new Set(options)].filter(n => n !== baseRoot);
        
        if (nextChord) {
            if (targetRoot < baseRoot) {
                const lowerOptions = options.filter(n => n < baseRoot);
                if (lowerOptions.length > 0) {
                    lowerOptions.sort((a,b) => b - a); 
                    options = lowerOptions;
                }
            } else if (targetRoot > baseRoot) {
                const higherOptions = options.filter(n => n > baseRoot);
                if (higherOptions.length > 0) {
                    higherOptions.sort((a,b) => a - b);
                    options = higherOptions;
                }
            }
        }
        
        if (options.length > 0) {
            return getFrequency(withOctaveJump(options[0]));
        }
    }

    // Fallback
    let chordTones = [];
    let intervals = [...currentChord.intervals];
    if (!intervals.includes(12)) intervals.push(12);
    intervals.forEach(i => {
        const n = baseRoot + i;
        if (n >= absMin && n <= absMax) chordTones.push(n);
        const nl = baseRoot + i - 12;
        if (nl >= absMin && nl <= absMax) chordTones.push(nl);
    });
    let available = chordTones.filter(n => !isSameAsPrev(n));
    if (available.length === 0) available = chordTones;
    
    if (prevMidi) {
        available.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
        return getFrequency(withOctaveJump(available[0]));
    }
    return getFrequency(withOctaveJump(available[Math.floor(Math.random() * available.length)]));
}