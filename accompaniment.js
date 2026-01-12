import { playNote, playChordScratch, updateSustain } from './engine.js';
import { ctx, arranger, gb, bb, sb, cb } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { DRUM_PRESETS } from './presets.js';
import { isBassActive } from './bass.js';
import { getFrequency, getMidi } from './utils.js';

/**
 * ACCOMPANIMENT.JS - Rhythmic Style Engine
 * 
 * This module handles the generative rhythmic logic for the "Gold Standard" Piano.
 * It monitors soloist density to create a "musical conversation" and applies
 * rhythmic intent (anticipation, syncopation, laying back).
 */

export const compingState = {
    currentVibe: 'balanced',
    currentCell: new Array(16).fill(0),
    lockedUntil: 0,
    soloistActivity: 0,
    lastChordIndex: -1
};

export const PIANO_CELLS = {
    balanced: [
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // The "Charleston"
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Downbeats 1 & 2
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // 1 & 3
    ],
    sparse: [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Just the One
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Just the &2
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // Silence
    ],
    active: [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Syncopated 16ths
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // 8th note pulse
        [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]  // Push-heavy
    ],
    // GENRE-SPECIFIC POOLS
    'Rock': [
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Straight 8ths
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight 4ths
        [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1]  // Driving with builds
    ],
    'Jazz': [
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Charleston
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // &2, &3
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // Anticipation (&4)
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]  // Quarter notes
    ],
    'Funk': [
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Syncopated Upbeats
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1], // Interlocking 16ths
        [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]  // The "e" of the beat
    ],
    'Blues': [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], // Triplet-esque shuffle
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // Stabs on 1 & 3
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]  // Backbeat stabs
    ],
    'Reggae': [
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Skank on 2 & 4
        [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0], // Double Skank
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]  // Pushed Skank
    ],
    'Bossa': [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // Standard Bossa
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Sparse Bossa
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]  // Second-bar feel
    ],
    'Neo-Soul': [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // Pushed Anticipation
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // The "Dilla" Lag
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0]  // Lazy 1, &2, 4
    ]
};

/**
 * Updates the rhythmic intent based on band intensity, genre, and soloist activity.
 */
function updateRhythmicIntent(step, soloistBusy, spm = 16) {
    if (step < compingState.lockedUntil) return;

    const intensity = ctx.bandIntensity;
    const complexity = ctx.complexity;
    const genre = gb.genreFeel;

    // 1. Determine Vibe
    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

    // 2. Select Pool
    let pool = PIANO_CELLS[genre] || PIANO_CELLS[compingState.currentVibe];
    
    if (PIANO_CELLS[genre]) {
        if (compingState.currentVibe === 'sparse' && Math.random() < 0.3) {
            pool = PIANO_CELLS.sparse;
        } else if (compingState.currentVibe === 'active' && Math.random() < 0.3) {
            pool = PIANO_CELLS.active;
        } else if (Math.random() < 0.2) {
            pool = PIANO_CELLS.balanced;
        }
    }

    const rawCell = pool[Math.floor(Math.random() * pool.length)];
    
    // 3. Adapt Cell to SPM
    // If the cell is 16 steps but we have 20 (5/4), we loop or stretch. 
    // For now, we'll repeat the cell or truncate it to fit the measure.
    compingState.currentCell = new Array(spm).fill(0).map((_, i) => rawCell[i % rawCell.length]);

    // 4. Apply Anticipation / Laying Back based on Genre
    ctx.intent.anticipation = (intensity * 0.2);
    if (genre === 'Jazz' || genre === 'Bossa') ctx.intent.anticipation += 0.15;
    
    ctx.intent.syncopation = (complexity * 0.4);
    if (genre === 'Funk') ctx.intent.syncopation += 0.2;

    ctx.intent.layBack = (intensity < 0.4) ? 0.02 : 0; 
    if (genre === 'Neo-Soul') ctx.intent.layBack += 0.04;

    compingState.lockedUntil = step + spm;
}

/**
 * Intelligent Sustain Controller.
 * Clears mud and manages resonance based on harmonic and rhythmic context.
 */
function handleSustain(step, measureStep, chordIndex, intensity, time, genre, stepInfo) {
    const isNewChord = chordIndex !== compingState.lastChordIndex;
    const isNewMeasure = measureStep === 0;

    if (genre === 'Reggae' || genre === 'Funk') {
        updateSustain(false, time);
        return; 
    }

    if (isNewMeasure || isNewChord) {
        updateSustain(false, time);
        updateSustain(true, time);
        compingState.lastChordIndex = chordIndex;
        return;
    }

    // Clear sustain on strong group beats to prevent mud in odd meters
    if (stepInfo && stepInfo.isGroupStart && Math.random() < (intensity * 0.5)) {
        updateSustain(false, time - 0.01);
        updateSustain(true, time);
        return;
    }

    const isBeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
    
    const flutterProb = (intensity * 0.4);
    if (isBeat && Math.random() < flutterProb) {
        updateSustain(false, time - 0.015);
        updateSustain(true, time);
    }

    if (genre === 'Jazz' && !isBeat) {
        updateSustain(false, time + 0.1); 
    }
}

export const chordPatterns = {
    /**
     * The new "Gold Standard" generative piano engine.
     */
    smart: (chord, time, spb, stepInChord, measureStep, step, stepInfo) => {
        const soloistBusy = sb.enabled && sb.busySteps > 0;
        const chordIndex = arranger.progression.findIndex(c => c === chord);
        const genre = gb.genreFeel;
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const spm = ts.beats * ts.stepsPerBeat;
        
        updateRhythmicIntent(step, soloistBusy, spm);
        handleSustain(step, measureStep, chordIndex, ctx.bandIntensity, time, genre, stepInfo);

        let isHit = compingState.currentCell[measureStep % spm] === 1;

        // Force a hit on the "One" if the current cell is empty there
        if (measureStep === 0 && !isHit && Math.random() < 0.8) isHit = true;
        
        // Ensure group starts have a high probability of being played
        if (stepInfo && stepInfo.isGroupStart && !isHit && Math.random() < (0.4 + ctx.bandIntensity * 0.4)) {
            isHit = true;
        }

        if (isHit) {
            let timingOffset = 0;
            const isDownbeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
            const isStructural = stepInfo ? stepInfo.isGroupStart : (measureStep % 8 === 0);

            const pushProb = 0.15 + (ctx.bandIntensity * 0.2);
            if (!isDownbeat && Math.random() < pushProb) {
                timingOffset = -0.025;
            }

            if (Math.random() < ctx.intent.anticipation) timingOffset -= 0.010;
            if (Math.random() < ctx.intent.layBack) timingOffset += 0.020;

            const playTime = time + timingOffset;
            
            let duration = spb * 2.0; 
            if (genre === 'Reggae' || genre === 'Funk') duration = 0.1;
            else if (genre === 'Jazz') duration = 0.25;
            else if (genre === 'Rock' || genre === 'Bossa') duration = 0.45;

            const velocity = (isStructural ? 0.38 : (isDownbeat ? 0.32 : 0.22)) * (0.8 + ctx.bandIntensity * 0.4);

            let voicing = [...chord.freqs];
            
            // Grounded voicing: use more notes on structural anchors
            if (!isStructural && voicing.length > 3 && Math.random() < 0.5) {
                voicing = voicing.slice(0, 3); 
            }

            if (bb.enabled && voicing.length > 3) {
                voicing.shift();
                if ((chord.is7th || chord.quality.includes('9')) && voicing.length > 3) {
                    const rootPC = chord.rootMidi % 12;
                    const fifthPC = (rootPC + 7) % 12;
                    voicing = voicing.filter(f => (getMidi(f) % 12) !== fifthPC);
                }
            }

            voicing.forEach((f, i) => {
                const humanShift = (Math.random() * 0.006) - 0.003;
                const humanVol = 0.95 + (Math.random() * 0.1);
                const stagger = (i * 0.008) + humanShift;

                playNote(f, playTime + stagger, duration, { 
                    vol: velocity * humanVol, 
                    index: i, 
                    instrument: 'Piano',
                    dry: (genre === 'Reggae' || genre === 'Funk') 
                });
            });
        }
    },

    // Legacy fallback support: all styles now route to the high-fidelity engine
    // while maintaining their characteristic "frequency" of hits via cell selection.
    pad: (chord, time, spb, stepInChord, measureStep, step) => {
        // Clear sustain at measure boundaries or chord changes
        if (measureStep === 0 || stepInChord === 0) {
            updateSustain(false, time - 0.02);
            updateSustain(true, time);
        }

        if (stepInChord === 0) {
            chord.freqs.forEach((f, i) => {
                const stagger = i * 0.015;
                // Pads ring for the duration of the chord, but the sustain pedal handles the 'ring'
                playNote(f, time + stagger, chord.beats * spb, { 
                    vol: 0.22, 
                    index: i, 
                    instrument: 'Piano' 
                });
            });
        }
    },
    
    strum8: (chord, time, spb, stepInChord, measureStep, step) => {
        const beats = [0, 4, 6, 8, 12];
        if (beats.includes(measureStep % 16)) {
            const vol = (measureStep % 8 === 0) ? 0.3 : 0.2;
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.5, { vol, index: i, instrument: 'Piano' }));
        }
    }
};

// Map all old style names to the new smart engine or specific piano behaviors
const legacyMap = ['pop', 'rock', 'funk', 'jazz', 'blues', 'bossa', 'skank', 'arpeggio', 'tresillo', 'clave', 'afrobeat'];
legacyMap.forEach(style => {
    if (!chordPatterns[style]) {
        chordPatterns[style] = chordPatterns.smart;
    }
});