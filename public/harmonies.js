import { getScaleForChord } from './soloist.js';
import { getBestInversion } from './chords.js';
import { ctx, gb, cb, hb, sb, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getMidi } from './utils.js';

/**
 * HARMONIES.JS
 * 
 * Generates background "hooks" and "pads" (Horns, Strings, Synths).
 * Logic highlights:
 * - Motif Memory: Generates a 2-bar "hook" per section and repeats it.
 * - Soloist Awareness: Plays "pads" when soloist is busy, "stabs/hooks" when resting.
 * - Voice Leading: Anchors voices to minimize movement between chords.
 * - Genre Styles: Stabs (Funk/Jazz), Pads (Pop/Rock/Soul), Counter-melodies (Bossa).
 */

const STYLE_CONFIG = {
    horns: {
        density: 2, // Number of voices
        rhythmicStyle: 'stabs',
        timingJitter: 0.005, // Tightened for focus
        velocity: 0.85,
        octaveOffset: 0,
        padProb: 0.2 // Probability of playing a pad even if style is stabs
    },
    strings: {
        density: 2, // Capped at 2 for polyphonic clarity
        rhythmicStyle: 'pads',
        timingJitter: 0.02, // Reduced for focus
        velocity: 0.6,
        octaveOffset: 0,
        padProb: 0.9
    },
    smart: {
        density: 2, // Capped at 2
        rhythmicStyle: 'auto', // Depends on genre
        timingJitter: 0.008, // Tightened for focus
        velocity: 0.75,
        octaveOffset: 0,
        padProb: 0.5
    }
};

const RHYTHMIC_PATTERNS = {
    'Funk': [
        [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // The "And of 1" and "The 3"
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // The "2" and "4"
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated
    ],
    'Jazz': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // "Charleston" beat 2
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Beats 1 and 2
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // Syncopated "And of 2"
    ],
    'Pop': [
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 1 and 3
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Whole notes
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]  // 2 and 4
    ],
    'Neo-Soul': [
        [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Dilla-esque syncopation
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    ],
    'Bossa Nova': [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Clave-adjacent
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]
    ],
    'Disco': [
        [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1], // The "And-4" 16th stabs
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight quarters (Chic)
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Offbeat 8ths
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]  // Dotted 8ths (Modern Pop)
    ],
    'Rock': [
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 1 and 3
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated pulse
    ],
    'Metal': [
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Constant 8ths
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // Constant 16ths
    ],
    'Reggae': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Traditional skank (2 and 4)
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]  // Double skank
    ],
    'Country': [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight quarters
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]  // Chugging 8ths
    ],
    'Acoustic': [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Whole notes
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Half notes
    ],
    'Hip Hop': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // 2 and 4
        [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]  // Syncopated
    ]
};

// Internal memory for motif consistency
const motifCache = new Map(); // Key: sectionId, Value: { patternIdx, noteIntervals, responseMask, motionMask }
let lastMidis = [];
let lastPlayedStep = -1;

/**
 * Clears the internal motif memory. Used for section changes or testing.
 */
export function clearHarmonyMemory() {
    motifCache.clear();
    lastMidis = [];
    lastPlayedStep = -1;
    
    // Also reset soloist motif memory to ensure harmonic alignment
    sb.motifBuffer = [];
    sb.motifRoot = undefined;
    sb.motifReplayCount = 0;
    sb.isReplayingMotif = false;
}

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(chord, nextChord, step, octave, style, stepInChord, soloistResult = null) {
    if (!chord) return [];

    // AUTO-DUCK: If intensity is very low, we treat the module as disabled
    // to provide a "Delayed Bloom" where horns/strings only join when the jam builds up.
    if (ctx.bandIntensity < 0.22) return [];

    // Stab Termination: If we are at the start of a chord, ensure any hanging stabs are cleared
    // This provides the "Anchor" feel by ensuring chord changes are clean
    const isChordStart = stepInChord === 0;

    // Debounce: Prevent rapid-fire re-triggering on consecutive steps (common in latch mode)
    if (lastPlayedStep !== -1 && step === lastPlayedStep + 1 && soloistResult) {
        return [];
    }

    const notes = [];
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const sectionId = chord.sectionId || 'default';
    const feel = gb.genreFeel;
    
    // --- 1. Decide on Pad vs Stab ---
    let config = STYLE_CONFIG[style] || STYLE_CONFIG.smart;
    let rhythmicStyle = config.rhythmicStyle;
    
    if (rhythmicStyle === 'auto') {
        const isPadGenre = ['Rock', 'Acoustic', 'Neo-Soul'].includes(gb.genreFeel);
        rhythmicStyle = isPadGenre ? 'pads' : 'stabs';
    }

    // Soloist Awareness: If soloist is busy, prefer pads
    const isSoloistBusy = sb.enabled && !sb.isResting && sb.notesInPhrase > 2;
    if (isSoloistBusy) rhythmicStyle = 'pads';

    // --- 2. Motif / Pattern Selection ---
    if (!motifCache.has(sectionId)) {
        const genrePatterns = RHYTHMIC_PATTERNS[gb.genreFeel] || RHYTHMIC_PATTERNS['Pop'];
        // Generate deterministic masks for this section based on sectionId string hash
        let hash = 0;
        for (let i = 0; i < sectionId.length; i++) {
            hash = ((hash << 5) - hash) + sectionId.charCodeAt(i);
            hash |= 0; 
        }
        const seed = Math.abs(hash);
        const patternIdx = seed % genrePatterns.length;
        let pattern = [...(genrePatterns[patternIdx] || genrePatterns[0])];
        
        // --- NEW: Rhythm Section Interaction (Groove-Locking) ---
        // If the genre is rhythmic (Funk, Reggae, Disco), nudge the pattern 
        // to better align with the rhythm section.
        const isRhythmic = ['Funk', 'Reggae', 'Disco', 'Jazz'].includes(gb.genreFeel);
        if (isRhythmic) {
            for (let i = 0; i < 16; i++) {
                const snareHit = (gb.snareMask >> i) & 1;
                const chordHit = (cb.rhythmicMask >> i) & 1;
                
                // Groove Locking: High probability of reinforcing snare hits if intensity is high
                if (snareHit && ctx.bandIntensity > 0.6 && Math.random() < 0.4) {
                    pattern[i] = 1;
                }
                
                // Frequency Clutter Prevention: If the main piano is already hitting this step,
                // the harmony section should consider taking a back seat to keep the mix clear.
                if (chordHit && pattern[i] === 1 && Math.random() < 0.7) {
                    pattern[i] = 0;
                }
            }
        }

        // Calculate the rhythmic mask (16-bit)
        let rhythmicMask = 0;
        for (let i = 0; i < 16; i++) {
            if (pattern[i] === 1) rhythmicMask |= (1 << i);
        }

        motifCache.set(sectionId, {
            patternIdx: patternIdx,
            intervals: [0, 4, 7],
            responseMask: (seed >> 8) & 0xFFFF,
            motionMask: (seed >> 16) & 0xFFFF,
            rhythmicMask: rhythmicMask,
            pattern: pattern
        });
    }
    const motif = motifCache.get(sectionId);
    
    // Sync the mask to the global state so the soloist can "hear" it
    if (hb.rhythmicMask !== motif.rhythmicMask) {
        hb.rhythmicMask = motif.rhythmicMask;
    }

    let shouldPlay = false;
    let durationSteps = 1;
    let isLatched = false;
    let isMovement = false;

    // --- NEW: Fill Reinforcement ---
    // If a drum fill is active, the harmony section plays long "power-pads" 
    // to build tension into the resolution.
    if (gb.enabled && gb.fillActive && step % 4 === 0) {
        const fillStep = step - gb.fillStartStep;
        if (fillStep < gb.fillLength) {
            shouldPlay = true;
            durationSteps = 4;
            isMovement = true; // Use movement voicings for tension
        }
    }

    // 1. LATCH LOGIC: Reinforce Soloist Hooks
    // If the soloist is replaying a hook and intensity is high, "Latch on" to their rhythm
    if (sb.enabled && sb.isReplayingMotif && ctx.bandIntensity > 0.4 && soloistResult) {
        const stepInCell = step % 4;
        const isStrongStep = stepInCell === 0 || (stepInCell === 2 && ctx.bandIntensity > 0.7);
        
        const hasSoloNote = Array.isArray(soloistResult) ? soloistResult.length > 0 : !!soloistResult;
        if (hasSoloNote && isStrongStep) {
            shouldPlay = true;
            durationSteps = 2; 
            isLatched = true;
        }
    }

    // 2. RESPONSE LOGIC: "Big Band" Call & Response
    // If the soloist is resting, we play small melodic responses.
    // Deterministic per section but scaled by hb.complexity.
    if (!shouldPlay && sb.enabled && sb.isResting) {
        const baseProb = feel === 'Jazz' ? 0.45 : (feel === 'Funk' || feel === 'Disco' ? 0.35 : 0.2);
        const responseProb = baseProb * hb.complexity; 
        
        const isResponseStep = [6, 7, 10, 14].includes(measureStep);
        // Use deterministic mask + complexity check
        const bit = (motif.responseMask >> (measureStep % 16)) & 1;
        if (isResponseStep && bit && (measureStep / 16) < responseProb + 0.2) {
            shouldPlay = true;
            durationSteps = 2;
            isMovement = true;
        }
    }

    // 3. INNER VOICE MOTION: Subtle movement within a held chord
    // Deterministic per section but scales with global intensity.
    if (!shouldPlay && rhythmicStyle === 'pads') {
        const motionProb = (ctx.bandIntensity - 0.3) * 0.6; // Starts appearing at 30% intensity
        const isMotionStep = (measureStep === 8 || measureStep === 12);
        const bit = (motif.motionMask >> (measureStep % 16)) & 1;
        if (isMotionStep && bit && (measureStep / 16) < motionProb + 0.1) {
            shouldPlay = true;
            durationSteps = 4;
            isMovement = true;
        }
    }

    // 4. APPROACH & ANTICIPATION: "Lead-ins" to the next chord
    // Harmonic Anticipation: Play the NEXT chord a 16th early (Big Band style)
    let isAnticipating = false;
    if (!shouldPlay && nextChord && measureStep === stepsPerMeasure - 1) {
        if (Math.random() < (hb.complexity * 0.3 * ctx.bandIntensity)) {
            shouldPlay = true;
            durationSteps = 2;
            isAnticipating = true;
        }
    }

    // Chromatic Approach: A single voice leading into the next chord
    let isApproach = false;
    if (!shouldPlay && nextChord && measureStep === stepsPerMeasure - 1) {
        if (Math.random() < (hb.complexity * 0.5)) {
            shouldPlay = true;
            durationSteps = 1;
            isApproach = true;
        }
    }

    if (!shouldPlay) {
        if (rhythmicStyle === 'pads') {
            if (stepInChord === 0 || measureStep === 0) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
            }
        }
        else {
            const pattern = motif.pattern;
            if (pattern && pattern[measureStep] === 1) {
                shouldPlay = true;
                durationSteps = 2;
            }
        }
    }

    if (!shouldPlay) return [];

    // --- 4. Voicing Selection ---
    // Use the next chord for anticipation, otherwise the current one
    const targetChord = isAnticipating ? nextChord : chord;
    const scale = getScaleForChord(targetChord, nextChord, 'smart');
    const rootMidi = targetChord.rootMidi;
    
    // Intensity and local complexity scale the number of voices
    const baseDensity = config.density || 2;
    let density = Math.max(1, Math.floor(baseDensity * (0.4 + ctx.bandIntensity * 0.3 + hb.complexity * 0.3)));
    
    // If latched, thicken the reinforcement over time (based on session steps)
    if (isLatched) {
        const buildUp = Math.min(1, Math.floor(sb.sessionSteps / 64)); 
        density = Math.max(density, 1 + buildUp);
    }

    // Select notes based on Genre-Specific Theory
    let intervals = [0, 4, 7]; 
    const isAltered5 = targetChord.quality?.includes('b5') || targetChord.quality?.includes('#5') || targetChord.quality?.includes('alt') || targetChord.quality?.includes('dim') || targetChord.quality?.includes('aug') || targetChord.quality === '7#9';

    if (isApproach && nextChord) {
        // Find a note 1 semitone away from the next root or 3rd
        const nextRoot = nextChord.rootMidi % 12;
        const targetPC = Math.random() > 0.5 ? nextRoot : (nextRoot + (nextChord.quality?.includes('m') ? 3 : 4)) % 12;
        const approachPC = (targetPC + (Math.random() > 0.5 ? 1 : 11)) % 12;
        intervals = [(approachPC - (rootMidi % 12) + 12) % 12];
        density = 1;
    }
    else if (isMovement) {
        // Melodic Movement: Usually just 1-2 voices moving to a "color" tone
        density = Math.min(density, 2);
        if (feel === 'Jazz' || feel === 'Blues') {
            intervals = [scale.find(i => i === 9 || i === 2 || i === 5) || 7];
        } else if (feel === 'Neo-Soul') {
            const movingNote = [2, 5, 10].find(i => scale.includes(i));
            intervals = movingNote !== undefined ? [movingNote] : [0];
        } else {
            intervals = [scale.find(i => ![0, 4, 7].includes(i)) || 4];
        }
    } 
    else if (feel === 'Jazz' || feel === 'Blues') {
        const third = scale.find(i => i === 3 || i === 4);
        const seventh = scale.find(i => i === 10 || i === 11);
        if (third !== undefined && seventh !== undefined) {
            intervals = [third, seventh];
        } else {
            const isMinor = chord.quality?.startsWith('m') && !chord.quality?.startsWith('maj');
            intervals = [isMinor ? 3 : 4, 10];
        }
        if (density > 2) {
            const extension = scale.find(i => i === 2 || i === 9 || i === 5 || i === 6);
            if (extension !== undefined) intervals.push(extension);
            else if (scale.includes(7)) intervals.push(7);
        }
    } 
    else if (feel === 'Rock' || feel === 'Metal') {
        intervals = [0, 7];
        if (isAltered5) {
            // If chord is altered, use 3rd or b5 instead of natural 5th
            const alt5 = scale.find(i => i === 6 || i === 8);
            if (alt5 !== undefined) intervals = [0, alt5];
            else intervals = [0, scale.find(i => i === 3 || i === 4) || 7];
        }
        if (density > 2) {
            const highRoot = 12;
            intervals.push(highRoot);
        }
    }
    else if (feel === 'Neo-Soul') {
        // Intelligent Quartal stack: 1, 4, b7 (filtered by scale)
        // Avoid natural 4th (5) if Major 3rd (4) is in chord
        const hasMajor3rd = chord.intervals?.includes(4) || chord.quality?.includes('major') || chord.quality === '7';
        const fourth = (scale.includes(5) && !hasMajor3rd) ? 5 : (scale.includes(4) ? 4 : (scale.includes(5) ? 5 : 0));
        const seventh = scale.includes(10) ? 10 : (scale.includes(11) ? 11 : (scale.includes(9) ? 9 : 0));
        intervals = [0, fourth, seventh].filter(i => scale.includes(i) && i !== 0);
        intervals.unshift(0); // Root is always first
        
        if (density > 3) {
            const ninth = scale.find(i => i === 2 || i === 1 || i === 3);
            if (ninth !== undefined) intervals.push(ninth + 12);
        }
    }
    else {
        // Defensive filtering for Pop/Disco/Acoustic
        // Fundamental tones first, then color tones, but avoid semitone clashes with chord tones
        const chordTones = chord.intervals || [0, 4, 7];
        const hasMajor3rd = chordTones.includes(4);

        const colorTones = [0, 4, 7, 10, 11, 2, 9, 5].filter(i => {
            if (!scale.includes(i)) return false;
            
            // Special Avoid Note Rule: natural 4th (5) against Major 3rd (4)
            if (i === 5 && hasMajor3rd) return false;

            // Avoid semitone clash with ANY fundamental chord tone
            const hasClash = chordTones.some(ct => {
                const dist = Math.abs(i - ct);
                return dist === 1 || dist === 11;
            });
            // Exception: Maj7 (11) against Root (0) is fine if it's in scale
            if (hasClash && i === 11 && chordTones.includes(0)) return true;
            // Exception: b9 (1) or #9 (3) against Root/2nd is okay in some contexts, 
            // but for simple styles we avoid it.
            return !hasClash;
        });
        intervals = colorTones.slice(0, density);
        if (intervals.length === 0) intervals = [0, 7].filter(i => scale.includes(i));
    }

    const isDisco = feel === 'Disco';
    if (isDisco && ctx.bandIntensity > 0.7) density = Math.max(density, 2);

    // --- 5. Melodic Trend (Soaring) ---
    const cycleMeasure = Math.floor(step / stepsPerMeasure) % 4;
    const liftShift = isDisco ? (cycleMeasure * 2) : 0; 

    if (isDisco && ctx.bandIntensity > 0.6 && rhythmicStyle === 'stabs' && !isLatched) {
        intervals = [intervals[0], intervals[0] + 12];
    }

    const currentMidis = getBestInversion(rootMidi, intervals, lastMidis, stepInChord === 0);
    
    // --- NEW: Dynamic Frequency Slotting (Soloist Pocket) ---
    // If the soloist is active and in our register, nudge the harmonies down 
    // to keep the "lane" clear.
    const soloistMidi = sb.enabled ? getMidi(sb.lastFreq) : 0;
    let finalOctaveShift = 0;
    if (soloistMidi > 0 && currentMidis.some(m => Math.abs(m - soloistMidi) < 7)) {
        // Collision detected! Nudge down if we have room
        if (currentMidis[0] > 48) {
            finalOctaveShift = -12;
        }
    }

    lastMidis = currentMidis;
    
    if (currentMidis.length > 0) {
        lastPlayedStep = step;
    }

    // --- 6. Velocity Normalization (Anti-Clutter Scaling) ---
    // If playing multiple notes (Double Stops/Chords), we must reduce per-voice velocity
    // to keep the total acoustic energy constant and prevent volume spikes.
    // Formula: v = base_v * (1 / sqrt(num_voices))
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);
    
    currentMidis.forEach((midi, i) => {
        const finalMidi = midi + liftShift + finalOctaveShift;
        
        // --- 6. Articulation Logic (The "New Tricks") ---
        // These are gated by intensity to ensure they sound "earned".
        let slideInterval = 0;
        let slideDuration = 0;
        let vibrato = { rate: 0, depth: 0 };

        const isLongNote = durationSteps >= 4;
        const lastMidi = lastMidis[i] || lastMidis[0];
        const intensity = ctx.bandIntensity;

        if (feel === 'Neo-Soul') {
            // "Dilla" lazy slides: frequency grows with intensity
            if (lastMidi && Math.abs(finalMidi - lastMidi) < 5 && Math.abs(finalMidi - lastMidi) > 0) {
                if (Math.random() < intensity) {
                    slideInterval = lastMidi - finalMidi;
                    slideDuration = 0.1 + (intensity * 0.1);
                }
            }
            if (isLongNote && intensity > 0.4) {
                // Reduced depth from 10 + intensity*10 to 5 + intensity*5 for less 'warble'
                vibrato = { rate: 3.5, depth: 5 + (intensity * 5) };
            }
        } 
        else if (feel === 'Jazz' || feel === 'Blues') {
            // Quick scoop from a semitone below (common for horns)
            // Probability scales with complexity
            if (Math.random() < (0.2 + hb.complexity * 0.3)) {
                slideInterval = -1;
                slideDuration = 0.05 + (intensity * 0.03);
            }
            if (isLongNote && intensity > 0.5) {
                vibrato = { rate: 5.0, depth: 5 + (intensity * 10) };
            }
        }
        else if (feel === 'Rock' || feel === 'Metal') {
            // Wide power-chord vibrato only at high intensity
            if (isLongNote && intensity > 0.75) {
                vibrato = { rate: 6.0, depth: 15 + (intensity * 15) };
            }
            // Aggressive scoop for stabs at higher complexity
            if (rhythmicStyle === 'stabs' && Math.random() < (hb.complexity * 0.4)) {
                slideInterval = Math.random() < 0.5 ? -12 : -5;
                slideDuration = 0.08 + (intensity * 0.05);
            }
        }
        else if (feel === 'Disco') {
            // Soaring trend: Slides only if intensity is building (> 0.5)
            if (liftShift > 0 && stepInChord === 0 && intensity > 0.5) {
                slideInterval = -2; 
                slideDuration = 0.15 + (intensity * 0.1);
            }
        }

        // Soft Latch: Reinforcement should be felt, not heard as a solo instrument.
        // We reduce the accent multiplier from 1.2 to 1.1 and apply the polyphony compensation.
        const baseVol = config.velocity * (0.8 + Math.random() * 0.2);
        const latchMult = isLatched ? 1.05 : 1.0; 
        
        notes.push({
            midi: finalMidi,
            velocity: baseVol * latchMult * polyphonyComp,
            durationSteps: durationSteps,
            timingOffset: (i * 0.005) + (Math.random() * config.timingJitter), 
            style: rhythmicStyle,
            isLatched: isLatched,
            isChordStart: isChordStart || isMovement || isAnticipating || isApproach, // Clean transitions
            slideInterval,
            slideDuration,
            vibrato
        });
    });

    return notes;
}
