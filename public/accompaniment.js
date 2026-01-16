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
    lastChordQuality: null, // Track quality for tension resolution
    grooveRetentionCount: 0,
    maxGrooveLength: 4,
    lastSectionId: null
};

/**
 * Algorithmic Pattern Generator
 * Replaces static PIANO_CELLS table to save space and increase variety.
 */
export function generateCompingPattern(genre, vibe, length = 16) {
    const pattern = new Array(length).fill(0);
    const intensity = ctx.bandIntensity;
    
    // Helper to set a beat if it's within bounds
    const hit = (step) => { if (step < length) pattern[step] = 1; };
    
    // --- GENRE ARCHETYPES ---
    
    if (genre === 'Reggae') {
        // Skank on 2 and 4 (Steps 4 and 12 in 16th grid)
        if (length >= 5) hit(4);
        if (length >= 13) hit(12);
        // Sometimes double skank if active
        if (vibe === 'active' || intensity > 0.7) {
            if (length >= 7) hit(6); // The "and" of 2
            if (length >= 15) hit(14); // The "and" of 4
        }
        return pattern;
    }
    
    if (genre === 'Disco') {
        // Offbeats (and of every beat)
        for (let i = 2; i < length; i += 4) hit(i);
        // Active: Add 16th syncopation
        if (vibe === 'active') {
            if (length >= 15) hit(14);
            if (length >= 7) hit(6);
        }
        return pattern;
    }
    
    if (genre === 'Funk') {
        // The "One" is often rest in piano comping for Funk to leave space for Bass
        // Focus on "e" and "a" (16th subdivisions)
        if (Math.random() > 0.6) hit(0); // Optional 1
        
        // E and A placements
        const slots = [3, 4, 6, 7, 10, 12, 13, 15];
        let density = 2;
        if (vibe === 'active') density = 5;
        if (vibe === 'sparse') density = 1;
        
        for (let i = 0; i < density; i++) {
            const slot = slots[Math.floor(Math.random() * slots.length)];
            hit(slot);
        }
        return pattern;
    }
    
    if (genre === 'Jazz' || genre === 'Bossa') {
        const type = Math.random();
        
        if (type > 0.75) { 
            // Charleston: 1 and &2 (Steps 0 and 7)
            hit(0);
            if (vibe !== 'sparse') hit(7); 
        } else if (type > 0.5) {
            // Reverse Charleston: &1 and 3 (Steps 3 and 8)
            hit(3);
            if (vibe !== 'sparse') hit(8);
        } else if (type > 0.25) {
            // Syncopated "Ands": &2 and &4 (Steps 7 and 15)
            hit(7);
            if (vibe !== 'sparse') hit(15);
        } else if (type > 0.1) {
            // Red Garland Lite: 1, &2, &3 (Steps 0, 7, 11)
            hit(0);
            hit(7);
            if (vibe === 'active') hit(11);
        } else {
            // Sparse Anticipation: &4 (Step 15)
            hit(15);
        }
        
        if (vibe === 'active') {
            // Add comping chatter
            if (length >= 4 && Math.random() > 0.5) hit(4);
            if (length >= 10 && Math.random() > 0.5) hit(10);
            if (length >= 13 && Math.random() > 0.7) hit(12);
        }
        return pattern;
    }
    
    // --- ROCK / POP / DEFAULT ---
    // Downbeat focus
    hit(0); // The One
    
    if (vibe === 'sparse') return pattern;
    
    // Backbeat support
    if (length >= 5) hit(4); // Beat 2
    if (length >= 9) hit(8); // Beat 3
    if (length >= 13) hit(12); // Beat 4
    
    if (vibe === 'active' || intensity > 0.6) {
        // 8th notes
        for (let i = 2; i < length; i += 2) {
            if (Math.random() > 0.4) hit(i);
        }
    }
    
    // Syncopation
    if (ctx.complexity > 0.6 && Math.random() > 0.5) {
        // Remove a downbeat and shift it
        if (pattern[8] === 1) {
            pattern[8] = 0;
            hit(7); // Push to &2
        }
    }

    return pattern;
}

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

    // Replace static lookup with procedural generation
    // IMPLEMENT NO-REPEAT RULE: Keep trying until we get a different pattern (up to 3 times)
    let newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
    if (JSON.stringify(newCell) === JSON.stringify(compingState.currentCell)) {
        newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
        if (JSON.stringify(newCell) === JSON.stringify(compingState.currentCell)) {
            newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
        }
    }
    compingState.currentCell = newCell;

    ctx.intent.anticipation = (intensity * 0.2);
    if (genre === 'Jazz' || genre === 'Bossa') ctx.intent.anticipation += 0.15;
    
    ctx.intent.syncopation = (complexity * 0.4);
    if (genre === 'Funk') ctx.intent.syncopation += 0.2;

    ctx.intent.layBack = (intensity < 0.4) ? 0.02 : 0; 
    if (genre === 'Neo-Soul') ctx.intent.layBack += 0.05; // More lag for Dilla feel

    compingState.lockedUntil = step + spm;
}

function handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo, currentQuality) {
    const events = [];
    const isNewChord = chordIndex !== compingState.lastChordIndex;
    const isNewMeasure = measureStep === 0;

    if (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco') {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0 }); // Sustain Off
        return events; 
    }

    if (isNewMeasure || isNewChord) {
        // BREATH STRATEGY: If coming from a high-tension chord, cut sustain early to clear the air.
        const wasTense = ['7alt', 'dim', 'halfdim', '7b9', '7#9'].includes(compingState.lastChordQuality);
        const clearOffset = wasTense ? -0.15 : 0; // 150ms breath for tension resolution

        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: clearOffset }); // Off
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0.01 }); // On
        
        compingState.lastChordIndex = chordIndex;
        compingState.lastChordQuality = currentQuality;
        return events;
    }
    
    // Update quality tracker even if not new chord (in case of init)
    compingState.lastChordQuality = currentQuality;

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
    const ccEvents = handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo, chord.quality);
    
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
