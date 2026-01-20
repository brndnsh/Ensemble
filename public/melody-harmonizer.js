import { KEY_ORDER, INTERVAL_TO_ROMAN } from './config.js';
import { normalizeKey } from './utils.js';

/**
 * Melody Harmonizer Engine
 * Generates backing chord progressions from a monophonic melody line.
 */
export class Harmonizer {
    constructor() {
        this.diatonicWeights = {
            major: { 0: 10, 2: 4, 4: 4, 5: 8, 7: 9, 9: 6, 11: 2 }, // I, ii, iii, IV, V, vi, vii
            minor: { 0: 10, 2: 3, 3: 9, 5: 6, 7: 8, 8: 7, 10: 5 }  // i, ii, III, iv, v, VI, VII
        };
    }

    /**
     * Generates a chord progression for the given melody.
     * @param {Array<{beat: number, midi: number, energy: number}>} melodyLine 
     * @param {string} key - e.g. "C", "F#m"
     * @param {number} creativity - 0.0 to 1.0 (Impacts chromaticism)
     * @returns {string} - A pipe-separated progression string (e.g. "I | IV | V | I")
     */
    generateProgression(melodyLine, key, creativity = 0.5) {
        if (!melodyLine || melodyLine.length === 0) return "I";

        const { rootIndex, isMinor } = this.parseKey(key);
        const chords = [];
        const measures = Math.ceil(melodyLine.length / 4);

        let lastRoot = rootIndex; // Start context as Tonic

        for (let m = 0; m < measures; m++) {
            const measureBeats = melodyLine.slice(m * 4, (m * 4) + 4);
            const prominentNotes = this.getProminentNotes(measureBeats);
            
            // If measure is silent, sustain previous or return to I
            if (prominentNotes.length === 0) {
                chords.push(m === 0 ? "I" : "."); 
                continue;
            }

            const bestChord = this.findBestChord(prominentNotes, rootIndex, isMinor, lastRoot, creativity);
            chords.push(bestChord.roman);
            lastRoot = bestChord.absRoot;
        }

        return this.formatProgression(chords);
    }

    parseKey(key) {
        const normKey = normalizeKey(key);
        const isMinor = key.includes('m') && !key.includes('maj');
        // Strip 'm' for lookup
        const rootName = normKey.replace('m', '');
        const rootIndex = KEY_ORDER.indexOf(rootName);
        return { rootIndex: rootIndex === -1 ? 0 : rootIndex, isMinor };
    }

    getProminentNotes(beats) {
        // Collect notes with decent energy
        // Weight: Downbeat (beat 0) = 2x, Beat 2 = 1.5x
        const counts = {};
        beats.forEach((b, idx) => {
            if (b.midi && b.energy > 0) {
                const pc = Math.round(b.midi) % 12;
                const weight = (idx === 0 ? 2.0 : (idx === 2 ? 1.5 : 1.0)) * b.energy;
                counts[pc] = (counts[pc] || 0) + weight;
            }
        });
        
        // Return sorted list of {pc, weight}
        return Object.entries(counts)
            .map(([pc, weight]) => ({ pc: parseInt(pc), weight }))
            .sort((a, b) => b.weight - a.weight);
    }

    findBestChord(notes, keyRoot, isMinor, prevRoot, creativity) {
        // We will score 12 chromatic roots for best fit
        let bestScore = -Infinity;
        let bestRoot = 0;
        let bestQuality = isMinor ? 'minor' : 'major';

        // Candidates: Mostly diatonic roots
        const scaleIntervals = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
        
        for (let i = 0; i < 12; i++) {
            const candidateRoot = (keyRoot + i) % 12;
            let score = 0;

            // 1. Diatonic Check
            // Calculate interval from key root
            const distFromKey = (candidateRoot - keyRoot + 12) % 12;
            const isDiatonic = scaleIntervals.includes(distFromKey);
            
            if (isDiatonic) score += 10;
            else score -= (1.0 - creativity) * 20; // Heavy penalty for chromatic unless creative

            // Determine likely quality (Simplification: Diatonic quality)
            let quality = 'major';
            if (isMinor) {
                // Minor key qualities: i(m), ii(dim), III(M), iv(m), v(m/M), VI(M), VII(M)
                if ([0, 2, 5, 7].includes(distFromKey)) quality = 'minor'; 
            } else {
                // Major key qualities: I, ii, iii, IV, V, vi, vii(dim)
                if ([2, 4, 9, 11].includes(distFromKey)) quality = 'minor';
            }

            // 2. Melody Fit
            // Does the candidate chord contain the melody notes?
            const chordTones = this.getChordTones(candidateRoot, quality);
            notes.forEach(note => {
                if (chordTones.includes(note.pc)) {
                    score += note.weight * 5; // Strong match
                    if (note.pc === candidateRoot) score += 2; // Root match bonus
                } else {
                    score -= note.weight * 2; // Clash penalty
                }
            });

            // 3. Voice Leading (Circle of Fifths / Stepwise)
            const motion = (candidateRoot - prevRoot + 12) % 12;
            if (motion === 5 || motion === 7) score += 4; // Dominant/Subdominant motion
            if (motion === 1 || motion === 11 || motion === 2 || motion === 10) score += 2; // Stepwise

            if (score > bestScore) {
                bestScore = score;
                bestRoot = candidateRoot;
                bestQuality = quality;
            }
        }

        return this.convertRootToRoman(bestRoot, bestQuality, keyRoot);
    }

    getChordTones(root, quality) {
        // Triad only for basic matching
        const third = (quality === 'minor') ? 3 : 4;
        return [
            root, 
            (root + third) % 12, 
            (root + 7) % 12
        ];
    }

    convertRootToRoman(absRoot, quality, keyRoot) {
        // Calculate interval from key root
        const interval = (absRoot - keyRoot + 12) % 12;
        let roman = INTERVAL_TO_ROMAN[interval] || 'I';
        
        // Handle minor naming convention (lowercase)
        if (quality === 'minor') {
            roman = roman.toLowerCase();
        }
        
        return { roman, absRoot };
    }

    formatProgression(chords) {
        // Post-processing: If we have "I | . | . | IV", fill in the dots
        for (let i = 1; i < chords.length; i++) {
            if (chords[i] === '.') chords[i] = chords[i-1];
        }

        return chords.join(" | ");
    }
}
