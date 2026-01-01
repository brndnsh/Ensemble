import { getFrequency } from './utils.js';

/**
 * Generates a frequency for a bass line.
 * @param {Object} currentChord - The current chord object.
 * @param {Object} nextChord - The next chord object (for approach notes).
 * @param {number} stepInChord - The current beat within the chord duration (0, 1, 2, 3...).
 * @param {number|null} prevFreq - The frequency of the previously played note.
 * @param {number} centerMidi - The desired center pitch for the bass line.
 * @param {string} style - The rhythm style ('whole', 'half', 'quarter').
 * @returns {number} The frequency of the bass note.
 */
export function getBassNote(currentChord, nextChord, stepInChord, prevFreq = null, centerMidi = 41, style = 'quarter') {
    if (!currentChord) return 0;

    const minMidi = centerMidi - 10;
    const maxMidi = centerMidi + 10;

    const normalizeToRange = (midi) => {
        // Use modulo to wrap MIDI note into a +/- 6 semitone range around centerMidi
        let m = ((midi - (centerMidi - 6)) % 12 + 12) % 12 + (centerMidi - 6);
        if (m < 24) m += 12; // Ensure it stays in a musical bass range
        return m;
    };

    let baseRoot = normalizeToRange(currentChord.rootMidi);

    // --- WHOLE NOTE STYLE: Root only ---
    if (style === 'whole') {
        return getFrequency(baseRoot);
    }

    // --- HALF NOTE STYLE: Root and 5th/Chord Tone ---
    if (style === 'half') {
        if (stepInChord === 0) return getFrequency(baseRoot);
        
        let fifth = baseRoot + 7;
        while (fifth > maxMidi) fifth -= 12;
        while (fifth < minMidi) fifth += 12;
        return getFrequency(fifth);
    }

    // --- ARP STYLE: 1-3-5-3 Pattern ---
    if (style === 'arp') {
        const beatInPattern = stepInChord % 4;
        
        // Pattern: Root (0), Third (1), Fifth (2), Third (3)
        if (beatInPattern === 0) return getFrequency(baseRoot);
        
        // Find chord tones from intervals
        const intervals = currentChord.intervals; // e.g. [0, 4, 7] or [0, 3, 7]
        let targetInterval = 0;
        
        if (beatInPattern === 1 || beatInPattern === 3) {
            // Find the 3rd (usually index 1)
            targetInterval = intervals.length > 1 ? intervals[1] : 4;
        } else if (beatInPattern === 2) {
            // Find the 5th (usually index 2 or 7 semitones)
            targetInterval = intervals.find(i => i === 7 || i === 6 || i === 8) || 7;
        }
        
        let note = baseRoot + targetInterval;
        while (note > maxMidi) note -= 12;
        while (note < minMidi) note += 12;
        return getFrequency(note);
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    
    // Beat 1: Root
    if (stepInChord === 0) {
        return getFrequency(baseRoot);
    }

    const isSameAsPrev = (midi) => {
        if (!prevFreq) return false;
        const f = getFrequency(midi);
        return Math.abs(f - prevFreq) < 0.1;
    };

    const beatsInChord = Math.round(currentChord.beats * 4);

    // Beat 4: Final Approach Note
    if (stepInChord === beatsInChord - 1 && nextChord) {
        let targetRoot = normalizeToRange(nextChord.rootMidi);
        const candidates = [targetRoot - 1, targetRoot + 1, targetRoot + 7, targetRoot - 5];
        const validCandidates = candidates.filter(n => n >= minMidi - 2 && n <= maxMidi + 2 && !isSameAsPrev(n));
        
        if (validCandidates.length > 0) {
            // Favor chromatic approach if possible
            const chromatic = validCandidates.filter(n => Math.abs(n - targetRoot) === 1);
            if (chromatic.length > 0) return getFrequency(chromatic[Math.floor(Math.random() * chromatic.length)]);
            return getFrequency(validCandidates[Math.floor(Math.random() * validCandidates.length)]);
        }
        return getFrequency(candidates[0]);
    }

    // Beat 3: Setup note (target close to but under upcoming root)
    if (stepInChord === 2 && nextChord) {
        let targetRoot = normalizeToRange(nextChord.rootMidi);
        // Target a note slightly below the upcoming root (scalar approach)
        // e.g., if next root is C, target Bb (target - 2) or A (target - 3)
        const setupNotes = [targetRoot - 2, targetRoot - 3, targetRoot - 5];
        const validSetup = setupNotes.filter(n => n >= minMidi && n <= maxMidi && !isSameAsPrev(n));
        
        if (validSetup.length > 0) {
            return getFrequency(validSetup[0]); // Pick the closest valid setup note
        }
    }

    // Fallback/Beat 2: Chord Tones
    let extendedIntervals = [...currentChord.intervals];
    // Add octave if not present
    if (!extendedIntervals.includes(12)) extendedIntervals.push(12);
    
    let chordTones = [];
    const shifts = [-12, 0, 12];
    shifts.forEach(shift => {
        extendedIntervals.forEach(interval => {
            const note = baseRoot + shift + interval;
            if (note >= minMidi && note <= maxMidi) chordTones.push(note);
        });
    });
    chordTones = [...new Set(chordTones)].sort((a,b) => a - b);
    
    // For Beat 2, favor the closest chord tone to the root that isn't the root
    if (stepInChord === 1) {
        let options = chordTones.filter(n => n !== baseRoot);
        if (options.length > 0) {
            options.sort((a, b) => Math.abs(a - baseRoot) - Math.abs(b - baseRoot));
            return getFrequency(options[0]);
        }
    }

    let available = chordTones.filter(n => !isSameAsPrev(n));
    if (available.length === 0) available = chordTones;
    // Prefer notes closer to prevFreq if possible for smoother movement
    if (prevFreq) {
        const prevMidi = Math.round(12 * Math.log2(prevFreq / 440) + 69);
        available.sort((a, b) => Math.abs(a - prevMidi) - Math.abs(b - prevMidi));
        return getFrequency(available[0]);
    }
    return getFrequency(available[Math.floor(Math.random() * available.length)]);
}
