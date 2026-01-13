import { ctx, arranger, cb, bb, sb, gb } from './state.js';
import { getMidi, getFrequency } from './utils.js';
import { TIME_SIGNATURES } from './config.js';

/**
 * ACCOMPANIMENT.JS - Rhythmic Style Engine
 * 
 * Standardized to return Note Objects for the Worker/Scheduler.
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
    'Disco': [
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Offbeat stabs (on the 'and')
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Sparse stabs
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]  // Charleston with driving end
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
    'Acoustic': [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight Quarters (Strum)
        [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], // Folk Pick pattern
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // 1 and &2 (Pop/Folk)
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

function updateRhythmicIntent(step, soloistBusy, spm = 16) {
    if (step < compingState.lockedUntil) return;

    const intensity = ctx.bandIntensity;
    const complexity = ctx.complexity;
    let genre = gb.genreFeel;

    // --- Style Override ---
    if (cb.style === 'jazz') genre = 'Jazz';
    else if (cb.style === 'funk') genre = 'Funk';
    else if (cb.style === 'strum8') genre = 'Rock';

    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

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
    compingState.currentCell = new Array(spm).fill(0).map((_, i) => rawCell[i % rawCell.length]);

    ctx.intent.anticipation = (intensity * 0.2);
    if (genre === 'Jazz' || genre === 'Bossa') ctx.intent.anticipation += 0.15;
    
    ctx.intent.syncopation = (complexity * 0.4);
    if (genre === 'Funk') ctx.intent.syncopation += 0.2;

    ctx.intent.layBack = (intensity < 0.4) ? 0.02 : 0; 
    if (genre === 'Neo-Soul') ctx.intent.layBack += 0.04;

    compingState.lockedUntil = step + spm;
}

function handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo) {
    const events = [];
    const isNewChord = chordIndex !== compingState.lastChordIndex;
    const isNewMeasure = measureStep === 0;

    if (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco') {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0 }); // Sustain Off
        return events; 
    }

    if (isNewMeasure || isNewChord) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0 }); // Off
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0.01 }); // On
        compingState.lastChordIndex = chordIndex;
        return events;
    }

    if (stepInfo && stepInfo.isGroupStart && Math.random() < (intensity * 0.5)) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.01 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
        return events;
    }

    const isBeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
    const flutterProb = (intensity * 0.4);
    if (isBeat && Math.random() < flutterProb) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.015 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
    }

    if (genre === 'Jazz' && !isBeat) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0.1 }); 
    }
    
    return events;
}

/**
 * Main entry point for generating accompaniment notes.
 * Returns an array of standardized Note Objects.
 */
export function getAccompanimentNotes(chord, step, stepInChord, measureStep, stepInfo) {
    if (!cb.enabled || !chord) return [];

    const notes = [];
    
    // --- Sustain / CC Handling ---
    const chordIndex = arranger.progression.indexOf(chord);
    const genre = gb.genreFeel;
    const ccEvents = handleSustainEvents(step, measureStep, chordIndex, ctx.bandIntensity, genre, stepInfo);
    
    // Create a dummy note for CC if needed, or attach to first note?
    // The worker handles notes. We can return "CC-only" objects or attach to notes.
    // Standard "Note Object" has ccEvents.
    // If no notes are generated this step, we still need to send CC.
    // We'll create a "silent" note object if only CC events exist, 
    // or we can push a dedicated event type if the architecture supports it.
    // For now, let's attach to the notes if they exist, or push a dummy object.
    
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;
    
    updateRhythmicIntent(step, (sb.enabled && sb.busySteps > 0), spm);

    // --- Smart Pattern Logic ---
    let isHit = compingState.currentCell[measureStep % spm] === 1;

    // Force hit on "One" if empty
    if (measureStep === 0 && !isHit && Math.random() < 0.8) isHit = true;
    if (stepInfo && stepInfo.isGroupStart && !isHit && Math.random() < (0.4 + ctx.bandIntensity * 0.4)) isHit = true;
    
    // Pad Style Override
    if (cb.style === 'pad') isHit = (stepInChord === 0);

    if (isHit) {
        let timingOffset = 0;
        const isDownbeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
        const isStructural = stepInfo ? stepInfo.isGroupStart : (measureStep % 8 === 0);

        if (cb.style === 'smart') {
            const pushProb = 0.15 + (ctx.bandIntensity * 0.2);
            if (!isDownbeat && Math.random() < pushProb) timingOffset = -0.025;
            if (Math.random() < ctx.intent.anticipation) timingOffset -= 0.010;
            if (Math.random() < ctx.intent.layBack) timingOffset += 0.020;
        }

        let durationSteps = ts.stepsPerBeat * 2; // Default 2 beats
        if (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco') durationSteps = ts.stepsPerBeat * 0.25; 
        else if (genre === 'Jazz') durationSteps = ts.stepsPerBeat * 1; 
        else if (genre === 'Acoustic') durationSteps = ts.stepsPerBeat * 2.5; 
        else if (genre === 'Rock' || genre === 'Bossa') durationSteps = ts.stepsPerBeat * 1.5;
        
        if (cb.style === 'pad') durationSteps = chord.beats * ts.stepsPerBeat;
        
        durationSteps = Math.max(1, Math.round(durationSteps));

        const velocity = (isStructural ? 0.6 : (isDownbeat ? 0.5 : 0.35)) * (0.8 + ctx.bandIntensity * 0.4);

        let voicing = [...chord.freqs];
        
        // --- Frequency Slotting & Soloist Pocket ---
        const soloistMidi = sb.enabled ? getMidi(sb.lastFreq) : 0;
        const bassMidi = bb.enabled ? getMidi(bb.lastFreq) : 0;
        const useClarity = soloistMidi > 72;

        if (cb.style === 'smart') {
            // Soloist Pocket: Reduce density or drop velocity when soloist is high
            if (useClarity && Math.random() < 0.7) {
                if (voicing.length > 3) voicing = voicing.slice(0, 3);
            }

            if (!isStructural && voicing.length > 3 && Math.random() < 0.5) voicing = voicing.slice(0, 3);
            
            // Frequency Slotting: Avoid masking the bass
            if (bb.enabled && voicing.length > 0) {
                let lowestMidi = getMidi(voicing[0]);
                if (lowestMidi <= bassMidi + 12) {
                    // Shift the lowest note up an octave to clear the bass register
                    voicing[0] = getFrequency(lowestMidi + 12);
                }

                if (voicing.length > 3) {
                    voicing.shift();
                    if ((chord.is7th || chord.quality.includes('9')) && voicing.length > 3) {
                        const rootPC = chord.rootMidi % 12;
                        const fifthPC = (rootPC + 7) % 12;
                        voicing = voicing.filter(f => (getMidi(f) % 12) !== fifthPC);
                    }
                }
            }
        }

        // --- Open Voicings for Jazz/Acoustic ---
        if ((genre === 'Jazz' || genre === 'Acoustic') && chord.quality === 'maj7') {
            if (voicing.length >= 3 && Math.random() < 0.6) {
                // Move the 2nd note (usually the 3rd or 5th) up an octave for "open" feel
                const targetIdx = 1;
                const midi = getMidi(voicing[targetIdx]);
                voicing[targetIdx] = getFrequency(midi + 12);
            }
        }

        voicing.forEach((f, i) => {
            const humanShift = (Math.random() * 0.006) - 0.003;
            const humanVol = 0.95 + (Math.random() * 0.1);
            
            let strumSpeed = 0.008;
            if (genre === 'Acoustic') strumSpeed = 0.025; // Slower, audible strum
            
            const stagger = (i * strumSpeed) + humanShift;
            
            // Attach CC events to the first note of the chord
            const noteCC = (i === 0) ? ccEvents : [];

            notes.push({
                midi: getMidi(f),
                velocity: Math.min(1.0, velocity * humanVol),
                durationSteps,
                bendStartInterval: 0,
                ccEvents: noteCC,
                timingOffset: timingOffset + stagger,
                instrument: 'Piano',
                muted: false,
                dry: (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco')
            });
        });
    }
    
    if (notes.length === 0 && ccEvents.length > 0) {
        // No notes played, but we have CC events (pedal changes)
        // Send a dummy note with velocity 0
        notes.push({
            midi: 0,
            velocity: 0,
            durationSteps: 0,
            bendStartInterval: 0,
            ccEvents: ccEvents,
            timingOffset: 0,
            instrument: 'Piano',
            muted: true
        });
    }

    return notes;
}
