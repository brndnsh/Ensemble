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
    lastChordIndex: -1,
    grooveRetentionCount: 0,
    maxGrooveLength: 4,
    lastSectionId: null
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
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Silence
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // More silence
    ],
    active: [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Syncopated 16ths
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // 8th note pulse
        [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]  // Push-heavy
    ],
    // GENRE-SPECIFIC POOLS
    'Rock': {
        balanced: [
            [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight 4ths
            [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Straight 8ths
            [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]  // Syncopated Pop
        ],
        sparse: [
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Just the One
            [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 1 and 3
            [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Only 3
        ],
        active: [
            [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1], // Driving with builds
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Constant 8ths
            [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1]  // Driving triplet-feel
        ]
    },
    'Acoustic': {
        balanced: [
            [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Straight Quarters (Strum)
            [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], // Folk Pick pattern
            [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // 1 and &2
        ],
        sparse: [
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // One
            [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Three
        ],
        active: [
            [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Steady strum
            [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1], // Driving folk
            [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]  // Push-heavy strum
        ]
    },
    'Jazz': [
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Charleston
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // &2, &3
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // Anticipation (&4)
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Quarter notes
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Just the 2
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Just the 3
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
        [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0]  // The Bubble (rhythmic organ)
    ],
    'Bossa': [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // Standard Bossa
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Sparse Bossa
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]  // Second-bar feel
    ],
    'Neo-Soul': [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // Pushed Anticipation
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // The "Dilla" Lag
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Lazy 1, &2, 4
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]  // Minimalist Backbeat
    ]
};

function updateRhythmicIntent(step, soloistBusy, spm = 16, sectionId = null) {
    
    // --- Section Change Detection ---
    if (sectionId && compingState.lastSectionId !== sectionId) {
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = sectionId;
        compingState.lockedUntil = 0; // Force update
    }

    if (step < compingState.lockedUntil) return;

    // Detect Soloist Falling Edge (Busy -> Not Busy) for "Call & Response"
    const wasBusy = compingState.soloistActivity > 0;
    compingState.soloistActivity = soloistBusy ? 1 : 0;
    const soloistJustStopped = wasBusy && !soloistBusy;

    const intensity = ctx.bandIntensity;
    const complexity = ctx.complexity;
    let genre = gb.genreFeel;

    // --- Style Override ---
    if (cb.style === 'jazz') genre = 'Jazz';
    else if (cb.style === 'funk') genre = 'Funk';
    else if (cb.style === 'strum8') genre = 'Rock';

    // --- Sticky Groove Logic ---
    const stickyGenres = ['Funk', 'Soul', 'Reggae', 'Neo-Soul'];
    if (stickyGenres.includes(genre)) {
        compingState.grooveRetentionCount++;
        
        // Only retain if we are NOT on the first bar of the groove
        if (compingState.grooveRetentionCount > 1 && compingState.grooveRetentionCount <= compingState.maxGrooveLength) {
            // RETAIN PATTERN
            compingState.lockedUntil = step + spm;
            return; 
        } 

        // If we exceeded max length, reset and fall through to pick new cell
        if (compingState.grooveRetentionCount > compingState.maxGrooveLength) {
            compingState.grooveRetentionCount = 1; // Start new groove now
            compingState.maxGrooveLength = 4 + Math.floor(Math.random() * 4); // 4-8 bars
        }
    } else {
        // Non-sticky genres (Jazz, Rock, etc.) always refresh or have standard logic
        compingState.grooveRetentionCount = 0;
    }

    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (soloistJustStopped) {
        // Soloist is taking a breath -> Fill the space!
        compingState.currentVibe = 'active';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

    let pool = PIANO_CELLS[genre] || PIANO_CELLS[compingState.currentVibe];
    
    // Support nested intensity pools for some genres (Rock, Acoustic)
    if (pool && !Array.isArray(pool)) {
        pool = pool[compingState.currentVibe] || pool.balanced;
    }

    // Force conversational spacing
    if (soloistBusy && cb.style === 'smart') {
        pool = PIANO_CELLS.sparse;
    } else if (PIANO_CELLS[genre]) {
        // If we are using a flat genre pool, we still allow random drifting to sparse/active
        if (Array.isArray(PIANO_CELLS[genre])) {
            if (compingState.currentVibe === 'sparse' && Math.random() < 0.3) {
                pool = PIANO_CELLS.sparse;
            } else if (compingState.currentVibe === 'active' && Math.random() < 0.3) {
                pool = PIANO_CELLS.active;
            } else if (Math.random() < 0.2) {
                pool = PIANO_CELLS.balanced;
            }
        }
    }

    const rawCell = pool[Math.floor(Math.random() * pool.length)];
    compingState.currentCell = new Array(spm).fill(0).map((_, i) => rawCell[i % rawCell.length]);

    ctx.intent.anticipation = (intensity * 0.2);
    if (genre === 'Jazz' || genre === 'Bossa') ctx.intent.anticipation += 0.15;
    
    ctx.intent.syncopation = (complexity * 0.4);
    if (genre === 'Funk') ctx.intent.syncopation += 0.2;

    ctx.intent.layBack = (intensity < 0.4) ? 0.02 : 0; 
    if (genre === 'Neo-Soul') ctx.intent.layBack += 0.05; // More lag for Dilla feel

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
    const genre = gb.genreFeel;
    const intensity = ctx.bandIntensity;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;
    
    // --- Sustain / CC Handling ---
    const chordIndex = arranger.progression.indexOf(chord);
    const ccEvents = handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo);
    
    updateRhythmicIntent(step, (sb.enabled && sb.busySteps > 0), spm, chord.sectionId);

    // --- GENRE LANES ---

    if (genre === 'Reggae') {
        // Lane A: The Skank (Staccato chords on 2 & 4)
        const isSkank = (measureStep === 4 || measureStep === 12);
        
        // Lane B: The Bubble (Organ eighth-note patterns)
        const isBubble = (measureStep % 2 === 1); // Only on the "and"
        const bubbleProb = 0.3 + (intensity * 0.5);
        
        if (isSkank) {
            let voicing = [...chord.freqs];
            if (voicing.length > 3) voicing = voicing.slice(0, 3); // Tight skanks
            
            voicing.forEach((f, i) => {
                notes.push({
                    midi: getMidi(f),
                    velocity: 0.5 + (Math.random() * 0.15), // Reduced from 0.6
                    durationSteps: 0.5, // Super staccato
                    ccEvents: (i === 0) ? ccEvents : [],
                    timingOffset: (i * 0.005) + 0.01,
                    instrument: 'Piano',
                    dry: true
                });
            });
            return notes;
        }
        
        if (isBubble && Math.random() < bubbleProb) {
            // Bubble uses low-register single notes or dyads
            const bubbleMidi = getMidi(chord.freqs[0]);
            const bubbleMidi2 = chord.freqs[1] ? getMidi(chord.freqs[1]) : null;
            
            const v = 0.4 + (Math.random() * 0.2);
            notes.push({
                midi: bubbleMidi,
                velocity: v,
                durationSteps: 0.5,
                ccEvents: ccEvents,
                timingOffset: 0.005,
                instrument: 'Piano',
                dry: true
            });
            if (bubbleMidi2 && Math.random() < 0.4) {
                notes.push({ midi: bubbleMidi2, velocity: v * 0.8, durationSteps: 0.5, ccEvents: [], timingOffset: 0.01, instrument: 'Piano', dry: true });
            }
            return notes;
        }
        
        // Return dummy note if CC events exist but no musical notes
        if (ccEvents.length > 0) {
            return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents: ccEvents, instrument: 'Piano', muted: true }];
        }
        return [];
    }

    if (genre === 'Funk') {
        // Clav-Style: 16th note syncopation with ghost notes ("chucks")
        const isHit = compingState.currentCell[measureStep % spm] === 1;
        const ghostProb = 0.2 + (intensity * 0.4);
        const isGhost = !isHit && (Math.random() < ghostProb);

        if (isHit || isGhost) {
            // CLAV-STYLE VOICING: Lean 2-note voicings (Guide Tones: 3rd and 7th)
            // This maintains the "lean, funky pocket" requested.
            let voicing = [];
            
            // Extract 3rd and 7th from intervals if possible, otherwise use slice
            const three = chord.intervals ? chord.intervals.find(i => i === 3 || i === 4) : undefined;
            const seven = chord.intervals ? chord.intervals.find(i => i === 10 || i === 11) : undefined;
            
            if (three !== undefined && seven !== undefined) {
                voicing = [chord.rootMidi + three, chord.rootMidi + seven];
            } else {
                voicing = chord.freqs.slice(0, 2).map(f => getMidi(f));
            }
            
            voicing.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: (isGhost ? 0.25 : 0.65) * (0.8 + Math.random() * 0.4),
                    durationSteps: isGhost ? 0.1 : 0.4, // Super short ghost "chucks"
                    ccEvents: (i === 0) ? ccEvents : [],
                    timingOffset: (i * 0.004) + (isGhost ? (0.005 + Math.random() * 0.01) : 0),
                    instrument: 'Piano',
                    muted: isGhost,
                    dry: true
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents: ccEvents, instrument: 'Piano', muted: true }];
        }
        return [];
    }

    // --- STANDARD Pattern Logic ---
    let isHit = compingState.currentCell[measureStep % spm] === 1;

    // Conversational: Listen to Soloist
    // If soloist is busy, suppress hits to avoid clutter (Call & Response)
    if (sb.enabled && sb.busySteps > 0 && cb.style === 'smart') {
         if (Math.random() < 0.7) isHit = false; 
    }

    // Force hit on "One" if empty
    if (measureStep === 0 && !isHit && Math.random() < 0.8) isHit = true;
    if (stepInfo && stepInfo.isGroupStart && !isHit && Math.random() < (0.4 + intensity * 0.4)) isHit = true;
    
    // Pad Style Override
    if (cb.style === 'pad') isHit = (stepInChord === 0);

    if (isHit) {
        let timingOffset = 0;
        const isDownbeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
        const isStructural = stepInfo ? stepInfo.isGroupStart : (measureStep % 8 === 0);

        if (cb.style === 'smart') {
            const pushProb = 0.15 + (intensity * 0.2);
            if (!isDownbeat && Math.random() < pushProb) timingOffset = -0.025;
            if (Math.random() < ctx.intent.anticipation) timingOffset -= 0.010;
            if (Math.random() < ctx.intent.layBack) timingOffset += 0.020;
        }

        let durationSteps = ts.stepsPerBeat * 2; // Default 2 beats
        if (genre === 'Disco') durationSteps = ts.stepsPerBeat * 0.25; 
        else if (genre === 'Jazz') durationSteps = ts.stepsPerBeat * 1; 
        else if (genre === 'Acoustic') durationSteps = ts.stepsPerBeat * 2.5; 
        else if (genre === 'Rock' || genre === 'Bossa') durationSteps = ts.stepsPerBeat * 1.5;
        
        if (cb.style === 'pad') durationSteps = chord.beats * ts.stepsPerBeat;
        
        durationSteps = Math.max(1, Math.round(durationSteps));

        const velocity = (isStructural ? 0.6 : (isDownbeat ? 0.5 : 0.35)) * (0.8 + intensity * 0.4);

        let voicing = [...chord.freqs];
        
        // --- Frequency Slotting & Soloist Pocket ---
        const soloistMidi = sb.enabled ? getMidi(sb.lastFreq) : 0;
        const bassMidi = bb.enabled ? getMidi(bb.lastFreq) : 0;
        const useClarity = soloistMidi > 72;

        if (cb.style === 'smart') {
            // Jazz Shell Lesson: If things are hot and harmony is complex, stick to shells (3 & 7)
            const isComplex = chord.quality === '7alt' || chord.quality === 'halfdim' || chord.quality === 'dim';
            if (genre === 'Jazz' && intensity > 0.6 && isComplex) {
                // Find 3rd and 7th
                const third = chord.intervals.find(i => i === 3 || i === 4);
                const seventh = chord.intervals.find(i => i === 10 || i === 11 || i === 9 || i === 6); // 6 for dim
                if (third !== undefined && seventh !== undefined) {
                    voicing = [getFrequency(chord.rootMidi + third), getFrequency(chord.rootMidi + seventh)];
                }
            }

            // Soloist Pocket: Reduce density or drop velocity when soloist is high
            else if (useClarity && Math.random() < 0.7) {
                if (voicing.length > 3) voicing = voicing.slice(0, 3);
            }

            if (!isStructural && voicing.length > 3 && Math.random() < 0.5) voicing = voicing.slice(0, 3);
            
            // Frequency Slotting: Avoid masking the bass
            if (bb.enabled && voicing.length > 0) {
                // Ensure sorted for predictable slotting
                voicing.sort((a, b) => getMidi(a) - getMidi(b));
                
                let lowestMidi = getMidi(voicing[0]);
                if (lowestMidi <= bassMidi + 12) {
                    voicing[0] = getFrequency(lowestMidi + 12);
                    voicing.sort((a, b) => getMidi(a) - getMidi(b));
                }

                if (voicing.length > 3) {
                    voicing.shift(); // Drop the lowest note (often the root) to leave space for bass
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
