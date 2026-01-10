import { playNote, playChordScratch } from './engine.js';
import { ctx, arranger, gb, bb, sb } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { DRUM_PRESETS } from './presets.js';
import { isBassActive } from './bass.js';

// --- COMPING STATE ENGINE ---
// Tracks the "improviser's intent" across function calls
const compingState = {
    lastChangeStep: -1,
    currentVibe: 'balanced', // balanced, sparse, active, syncopated
    currentCell: [0, 0, 0, 0], // The current rhythmic motif (1 bar max usually)
    density: 0.5, // 0.0 to 1.0
    lockedUntil: 0 // Step count until we can change vibe again
};

const COMPING_CELLS = {
    jazz: [
        { name: 'Charleston',  pattern: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], weight: 4 }, // 1 ... &2
        { name: 'Red Garland', pattern: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0], weight: 3 }, // &2 ... &4
        { name: 'Bill Evans',  pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], weight: 2 }, // Space
        { name: 'Anticipation',pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], weight: 2 }, // &4
        { name: 'Quarter',     pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], weight: 1 }  // 1 2 3 4
    ],
    funk: [
        { name: 'The One',     pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], weight: 3 }, // HIT 1
        { name: 'Backbeat',    pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], weight: 3 }, // HIT 2, 4
        { name: 'Syncopated',  pattern: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], weight: 2 }, // 1 (a) (&)
        { name: 'Offbeat',     pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], weight: 2 }  // & & & &
    ]
};

function updateCompingState(step, style, soloistBusy) {
    if (step < compingState.lockedUntil) return;

    // DECISION POINT: Every measure (approx)
    // 1. Determine new Vibe based on Soloist
    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
        compingState.density = 0.2;
    } else if (style === 'funk') {
        // Assertive Funk Logic: Bias towards Active/Syncopated
        const r = Math.random();
        if (r < 0.5) compingState.currentVibe = 'active'; // 50% Active
        else if (r < 0.85) compingState.currentVibe = 'syncopated'; // 35% Syncopated
        else compingState.currentVibe = 'balanced';
        compingState.density = Math.random() * 0.4 + 0.5; // High density (0.5 - 0.9)
    } else {
        const r = Math.random();
        if (r < 0.3) compingState.currentVibe = 'active';
        else if (r < 0.6) compingState.currentVibe = 'syncopated';
        else compingState.currentVibe = 'balanced';
        compingState.density = Math.random() * 0.5 + 0.3; // 0.3 to 0.8
    }

    // 2. Select a Cell Pattern
    const pool = COMPING_CELLS[style] || COMPING_CELLS.jazz;
    let candidates = pool;
    
    if (compingState.currentVibe === 'sparse') {
        candidates = pool.filter(c => c.name === 'Bill Evans' || c.name === 'Anticipation');
    } else if (compingState.currentVibe === 'active') {
        candidates = pool.filter(c => c.name !== 'Bill Evans');
    }

    if (candidates.length === 0) candidates = pool;

    // Weighted Random
    let totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let randomVal = Math.random() * totalWeight;
    let selected = candidates[0];
    for (const c of candidates) {
        randomVal -= c.weight;
        if (randomVal <= 0) { selected = c; break; }
    }

    compingState.currentCell = [...selected.pattern]; // Copy to allow mutation

    // Laying Out (Silence) - 15% chance in sparse/balanced vibes
    if ((compingState.currentVibe === 'sparse' || compingState.currentVibe === 'balanced') && Math.random() < 0.15) {
        compingState.currentCell = new Array(16).fill(0);
    }
    
    // Lock for 16 steps (1 bar of 4/4)
    compingState.lockedUntil = step + 16;
}

/**
 * Chord accompaniment patterns.
 * Each function handles the rhythmic playback for a specific style.
 */
export const chordPatterns = {
    /**
     * SMART MODE: The "AI Conductor"
     * Analyzes Drum, Bass, and Soloist state to choose the best strategy.
     */
    smart: (chord, time, spb, measureStep, step) => {
        // 1. Identify Context
        const drumPresetName = gb.lastDrumPreset || 'Standard';
        const drumConfig = DRUM_PRESETS[drumPresetName] || DRUM_PRESETS['Standard'];
        const drumCategory = drumConfig.category || 'Basic';
        
        // Is the soloist shredding? (Check if busySteps is high)
        const soloistBusy = sb.enabled && (sb.busySteps > 0 || sb.tension > 0.7);

        // --- DYNAMIC VOICING MASK ---
        // Filter the chord frequencies to create "Context-Aware Inversions"
        // This acts as a real-time arranger, thinning out mud or focusing energy.
        let voicing = [...chord.freqs];

        // A. Rootless Logic (Jazz/Funk/Soul)
        // If the bass is active, we don't need the root in the chords (cleans up low-mid mud)
        if (['Soul/Funk', 'Jazz', 'Soul/R&B'].includes(drumCategory) || bb.style === 'quarter' || bb.style === 'funk') {
            if (voicing.length > 3) {
                voicing.shift(); // Drop the lowest note (Root)
            }
        }

        // B. Funk "Scratch" Logic
        // Funk guitarists play high triads (strings 1-3). Drop low notes.
        if (drumCategory === 'Soul/Funk' || bb.style === 'funk') {
            if (voicing.length > 3) {
                 voicing = voicing.slice(-3); // Keep only top 3
            }
        }

        // C. Soloist Space Logic
        // If the soloist is busy, drop the top note (melody) to avoid clashing
        if (soloistBusy && voicing.length > 2) {
            voicing.pop(); // Drop the highest note
        }

        // Ensure we still have notes
        if (voicing.length === 0) voicing = [chord.freqs[0]]; // Fallback


        // 2. Priority Logic
        
        // A. LATIN / WORLD -> Clave or Bossa
        if (drumCategory === 'World/Latin' || bb.style === 'bossa') {
            const latinChord = { ...chord, freqs: voicing }; // Use filtered voicing
            if (drumPresetName.includes('Bossa') || bb.style === 'bossa') {
                return chordPatterns.bossa(latinChord, time, spb, measureStep, step);
            }
            if (drumPresetName.includes('Reggae') || bb.style === 'skank') {
                return chordPatterns.skank(latinChord, time, spb, measureStep);
            }
            return chordPatterns.clave(latinChord, time, spb, measureStep);
        }

        // B. FUNK / SOUL -> Interlocking Comping
        if (drumCategory === 'Soul/Funk' || bb.style === 'funk' || bb.style === 'rocco') {
            updateCompingState(step, 'funk', soloistBusy);
            
            // Map global step to our 16-step cell
            const cellStep = measureStep % 16;
            let isHit = compingState.currentCell[cellStep] === 1;

            // Mutation: 10% chance to flip the script for variation
            // Mutation: Asymmetric (Favors space over clutter)
            if (isHit) {
                if (Math.random() < 0.1) isHit = false; // 10% chance to ghost/skip
            } else {
                if (Math.random() < 0.03) isHit = true; // Only 3% chance to add a random hit
            }

            // Anticipation: Push the next bar? (On the 'a' of 4)
            if (cellStep === 14 && Math.random() < 0.2) isHit = true;

            if (isHit) {
                // Check interlock: Don't step on Bass One if vibe is Sparse
                // In Active/Syncopated vibes, hitting the One (James Brown style) is encouraged.
                if (measureStep === 0 && isBassActive('funk', step, 0) && compingState.currentVibe === 'sparse') {
                    // Bass has the One and we are chilling. Lay out or scratch.
                    if (Math.random() < 0.5) {
                        playChordScratch(time, spb * 0.1);
                    }
                    return;
                }

                const dur = spb * (Math.random() < 0.5 ? 0.2 : 0.4); // Staccato
                
                // Texture: Randomly thin the chord for percussive guitar feel
                // Funk players often hit just the top 1-2 strings on syncopations
                let stepVoicing = voicing;
                if (Math.random() < 0.3 && stepVoicing.length > 1) { // Reduced thinning prob from 0.5 to 0.3
                    const keep = Math.random() < 0.5 ? 1 : 2;
                    stepVoicing = stepVoicing.slice(-keep); 
                }

                stepVoicing.forEach((f, i) => playNote(f, time, dur, { vol: 0.22, index: i })); // Increased vol from 0.18
            } else {
                // Ghost note scratches (percolation)
                if (compingState.currentVibe === 'active' && Math.random() < 0.1) {
                    playChordScratch(time, spb * 0.05);
                }
            }
            return;
        }

        // C. JAZZ -> Generative Comping
        if (drumCategory === 'Jazz' || bb.style === 'quarter') {
            updateCompingState(step, 'jazz', soloistBusy);
            
            const cellStep = measureStep % 16;
            let isHit = compingState.currentCell[cellStep] === 1;

            // Mutation: 10% chance to flip
            // Mutation: Asymmetric (Favors space over clutter)
            if (isHit) {
                if (Math.random() < 0.1) isHit = false; // 10% chance to ghost/skip
            } else {
                if (Math.random() < 0.03) isHit = true; // Only 3% chance to add a random hit
            }

            // Anticipation: Classic Jazz Push on the 'and' of 4 (step 14)
            if (cellStep === 14 && Math.random() < 0.3) isHit = true;

            if (isHit) {
                // Velocity nuance: "and" of beats are often accented in jazz (Charleston feel)
                const isUpbeat = (measureStep % 4) !== 0; 
                const vol = isUpbeat ? 0.22 : 0.16;
                const dur = isUpbeat ? spb * 0.4 : spb * 0.8; // Short stabs vs long pads

                // Texture: Vary density (Shell vs Full)
                let stepVoicing = voicing;
                if (Math.random() < 0.4 && stepVoicing.length > 2) {
                     // Shell Voicing: Play outer voices (Bottom + Top)
                     // Creates a more open, modern sound on quick hits
                     stepVoicing = [stepVoicing[0], stepVoicing[stepVoicing.length - 1]];
                }

                stepVoicing.forEach((f, i) => playNote(f, time, dur, { vol, index: i }));
            }
            return;
        }

        // D. POP/ROCK -> Fallback to intelligent Pad/Strum mix
        // If slow tempo -> Pad
        if (ctx.bpm < 100) {
             const padChord = { ...chord, freqs: voicing };
             return chordPatterns.pad(padChord, time, spb, measureStep);
        } else {
             const popChord = { ...chord, freqs: voicing };
             return chordPatterns.pop(popChord, time, spb, measureStep);
        }
    },

    pad: (chord, time, spb, stepInChord) => {
        if (stepInChord === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, chord.beats * spb, { vol: 0.2, index: i }));
        }
    },
    strum8: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        
        // Classic "Down Down Up Down" (1, 2, 2-and, 3, 4)
        // In 4/4 (16 steps), beats are 0, 4, 8, 12.
        // Pattern: Beat 1 (0), Beat 2 (4), Beat 2-and (6), Beat 3 (8), Beat 4 (12)
        const beats = [0, 4, 6, 8, 12];
        
        if (beats.includes(measureStep)) {
            const isUpstroke = measureStep === 6;
            const isAccent = measureStep === 0 || measureStep === 8;
            
            chord.freqs.forEach((f, i) => {
                // Upstrokes are usually lighter and faster
                const vol = isUpstroke ? 0.12 : (isAccent ? 0.22 : 0.18);
                const dur = isUpstroke ? spb * 0.3 : spb * 0.6;
                
                // For a natural feel, upstrokes sometimes hit fewer strings
                if (isUpstroke && i < 1) return; 

                playNote(f, time, dur, { vol, index: i });
            });
        }
    },
    pop: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 10, 12, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '6/8') pattern = [0, 3, 6, 9]; // Dotted quarter feels
        else if (ts === '7/4') pattern = [0, 3, 6, 9, 12, 16, 20, 24]; // 4+3 feel
        else if (ts === '12/8') pattern = [0, 3, 6, 9, 12, 15, 18, 21];
        else if (ts === '5/4') pattern = [0, 3, 6, 10, 14, 18];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 1.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.15), index: i }));
        }
    },
    rock: (chord, time, spb, measureStep) => {
        if (measureStep % 2 === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.16), index: i }));
        }
    },
    skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        // Skank is on the "and": step 4, 12 in 4/4.
        if (measureStep % ts.stepsPerBeat === (ts.stepsPerBeat / 2)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.5, { vol: 0.22, index: i }));
        } else if (measureStep % ts.stepsPerBeat === 0) {
            // Muted "chug" on the downbeat
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.1, { vol: 0.1, index: i, muted: true }));
        }
    },
    double_skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const off = ts.stepsPerBeat / 2;
        if ([off, off + 2].includes(measureStep % ts.stepsPerBeat)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.35, { vol: 0.18, index: i }));
        } else if (measureStep % ts.stepsPerBeat === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.1, { vol: 0.1, index: i, muted: true }));
        }
    },
    funk: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 4, 7, 8, 11, 12, 15]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 4, 7, 8, 11];
        else if (ts === '6/8') pattern = [0, 2, 4, 6, 8, 10];
        else if (ts === '7/4') pattern = [0, 3, 4, 7, 8, 11, 12, 16, 19, 20, 23, 24]; 
        
        if (pattern.includes(measureStep)) {
            const isAccent = measureStep % 4 === 0;
            // Shortened duration (0.25 spb) for more "staccato" definition
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.25, { vol: (isAccent ? 0.22 : 0.18), index: i }));
        } else {
            // Use muted tonal hits instead of just noise for "scratches"
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.05, { vol: 0.08, index: i, muted: true }));
            if (Math.random() < 0.3) playChordScratch(time, 0.05);
        }
    },
    arpeggio: (chord, time, spb, stepInChord, measureStep) => {
        if (measureStep % 2 === 0) {
            const idx = Math.floor(stepInChord / 2) % chord.freqs.length;
            playNote(chord.freqs[idx], time, spb * 2.0, { vol: 0.2, index: 0 });
        }
    },
    tresillo: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 8, 11, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 9, 12, 15, 18, 21, 24]; // Extended Tresillo
        
        if (pattern.includes(measureStep)) {
            // Shortened duration (0.4 spb) for better separation
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.4, { vol: 0.2, index: i }));
        }
    },
    clave: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 10, 13]; // 3-2 Son Clave
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 10, 13, 16, 20]; // Extended Clave
        
        if (pattern.includes(measureStep)) {
            // Shortened duration (0.3 spb) for sharper clave hits
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.3, { vol: 0.2, index: i }));
        }
    },
    afrobeat: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 7, 10, 12, 13, 15];
        if (ts === '3/4') pattern = [0, 3, 6, 7, 10];
        else if (ts === '7/4') pattern = [0, 3, 6, 7, 10, 12, 13, 15, 16, 19, 22, 25];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.3, { vol: 0.18, index: i }));
        }
    },
    jazz: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 6, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 4, 10];
        else if (ts === '6/8') pattern = [0, 6];
        else if (ts === '7/4') pattern = [0, 6, 14, 20, 26]; // Syncopated
        else if (ts === '12/8') pattern = [0, 6, 12, 18];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.8, { vol: 0.18, index: i }));
        } else if (measureStep % 4 === 0) {
            // Muted "ghost" notes for jazz feel
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.05, { vol: 0.06, index: i, muted: true }));
            if (Math.random() < 0.1) playChordScratch(time, 0.02);
        }
    },
    green: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        if (measureStep % ts.stepsPerBeat === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.4, { vol: (measureStep % (ts.stepsPerBeat * 2) === ts.stepsPerBeat ? 0.22 : 0.18), index: i }));
        }
    },
    bossa: (chord, time, spb, measureStep, step) => {
        const ts = arranger.timeSignature;
        const tsObj = (TIME_SIGNATURES[ts] || TIME_SIGNATURES['4/4']);
        const stepsPerMeasure = tsObj.beats * tsObj.stepsPerBeat;
        
        let pattern;
        if (ts === '3/4') {
            pattern = [0, 3, 6, 9];
        } else if (ts === '6/8') {
            pattern = [0, 4, 8];
        } else if (ts === '7/4') {
            pattern = [0, 3, 6, 8, 11, 14, 17, 20, 23];
        } else {
            // Alternating 2-bar pattern logic (default/4/4 etc)
            pattern = (Math.floor(step / stepsPerMeasure) % 2 === 1) ? [0, 3, 6, 8, 11, 14] : [0, 3, 6, 10, 13];
        }
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 1.2, { vol: 0.2, index: i }));
        }
    }
};
