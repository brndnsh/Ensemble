import { KEY_ORDER } from './config.js';
import { getMidi } from './utils.js';

/**
 * Generates the musical events for the final resolution of a song.
 * Shared by both the live playback engine (logic-worker.js -> scheduler-core.js)
 * and the MIDI export engine (logic-worker.js).
 *
 * @param {number} step - The global step where the resolution starts.
 * @param {Object} arranger - The arranger state { key, isMinor }.
 * @param {Object} enabled - Enabled tracks { bass, chords, soloist, harmony, groove }.
 * @param {number} bpm - Beats per minute (default 100).
 * @returns {Array} List of note events.
 */
export function generateResolutionNotes(step, arranger, enabled, bpm = 100) {
    const notes = [];
    const spb = 60 / bpm; // Seconds per beat
    
    // Determine resolution key from the last chord of the arrangement
    let resolutionKey = arranger.key;
    if (arranger.stepMap && arranger.stepMap.length > 0) {
        const lastEntry = arranger.stepMap[arranger.stepMap.length - 1];
        if (lastEntry && lastEntry.chord && lastEntry.chord.key) {
            resolutionKey = lastEntry.chord.key;
        }
    }

    const keyPC = KEY_ORDER.indexOf(resolutionKey);
    const rootMidi = keyPC + 60; // Middle C octave
    const isMinor = arranger.isMinor;

    // --- CADENCE LOGIC (V -> I) ---
    // We will insert a Dominant chord (V) for 2 beats, then the Tonic (I)

    // Dominant (V) calculations
    // V is 7 semitones above root.
    const domRootPC = (keyPC + 7) % 12;
    const domRootMidi = domRootPC + 60;
    // V7 voicing: Root, 3, b7, 9.
    // Major Key: V7. Minor Key: V7(b9, b13) usually.
    // Intervals relative to V root:
    // V7 (Major): [0, 4, 10, 14] (R, 3, b7, 9)
    // V7alt (Minor): [0, 4, 10, 13] (R, 3, b7, b9)
    const domIntervals = isMinor ? [0, 4, 10, 13] : [0, 4, 10, 14];
    
    // Tonic (I) calculations
    // Major: 6/9 (Root, 2, 3, 5, 6) -> [0, 2, 4, 7, 9]
    // Minor: m9 (Root, 2, b3, 5, b7) -> [0, 2, 3, 7, 10]
    const tonicIntervals = isMinor ? [0, 2, 3, 7, 10] : [0, 2, 4, 7, 9];

    // --- 1. Bass Resolution ---
    if (enabled.bass) {
        const bassV = (domRootPC % 12) + 24 + (domRootPC > 7 ? -12 : 0); // Keep it low
        const bassI = (keyPC % 12) + 24 + (keyPC > 7 ? -12 : 0);

        // Beat 1: V
        notes.push({
            midi: bassV,
            freq: 440 * Math.pow(2, (bassV - 69) / 12),
            velocity: 0.9,
            midiVelocity: 110,
            durationSteps: 8, // 2 beats
            module: 'bass',
            step: step,
            timingOffset: 0
        });

        // Beat 3: I (The Resolution)
        notes.push({
            midi: bassI,
            freq: 440 * Math.pow(2, (bassI - 69) / 12),
            velocity: 1.0,
            midiVelocity: 120,
            durationSteps: 16, // Long ring
            module: 'bass',
            step: step,
            timingOffset: spb * 2
        });
    }

    // --- 2. Chord Resolution ---
    if (enabled.chords) {
        // Sustain on
        notes.push({
            midi: 0,
            module: 'chords',
            step: step,
            timingOffset: 0,
            ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }]
        });

        // Beat 1: Dominant Chord
        const domFreqs = domIntervals.map(i => 440 * Math.pow(2, (domRootMidi + i - 69) / 12));
        const domPolyComp = 1 / Math.sqrt(domFreqs.length || 1);

        domFreqs.forEach((f, i) => {
            // Slight strum for V
            const offset = i * 0.015;
            notes.push({
                midi: getMidi(f),
                freq: f,
                velocity: 0.6 * domPolyComp,
                midiVelocity: Math.round(0.6 * domPolyComp * 127),
                durationSteps: 8,
                module: 'chords',
                step: step,
                timingOffset: 0 + offset
            });
        });

        // Beat 3: Tonic Chord (Ritardando Strum)
        const tonicFreqs = tonicIntervals.map(i => 440 * Math.pow(2, (rootMidi + i - 69) / 12));
        const tonicPolyComp = 1 / Math.sqrt(tonicFreqs.length || 1);

        tonicFreqs.forEach((f, i) => {
            // Slower, dramatic strum for I
            const offset = i * 0.04;
            notes.push({
                midi: getMidi(f),
                freq: f,
                velocity: 0.75 * tonicPolyComp,
                midiVelocity: Math.round(0.75 * tonicPolyComp * 127),
                durationSteps: 24,
                module: 'chords',
                step: step,
                timingOffset: (spb * 2) + offset
            });
        });
    }

    // --- 3. Soloist Resolution ---
    if (enabled.soloist) {
        // Guide Tone Line
        // V7: 7th (b7) -> I: 3rd
        // e.g. G7 (F) -> C (E)

        // V7's 7th is 10 semitones above V root.
        const guideTone1 = domRootMidi + 10;
        // I's 3rd is 4 (Maj) or 3 (Min) semitones above I root.
        const guideTone2 = rootMidi + (isMinor ? 3 : 4);

        // Adjust octave for soloist (usually higher)
        const g1 = guideTone1 + 12;
        let g2 = guideTone2 + 12;

        // Ensure smooth voice leading (shortest path)
        if (Math.abs(g1 - g2) > 6) g2 -= 12;

        // Note 1 (V)
        notes.push({
            midi: g1,
            freq: 440 * Math.pow(2, (g1 - 69) / 12),
            velocity: 0.7,
            midiVelocity: 90,
            durationSteps: 8,
            module: 'soloist',
            step: step,
            timingOffset: 0
        });

        // Note 2 (I) - with curl/bend
        notes.push({
            midi: g2,
            freq: 440 * Math.pow(2, (g2 - 69) / 12),
            velocity: 0.85,
            midiVelocity: 110,
            durationSteps: 16,
            module: 'soloist',
            step: step,
            timingOffset: spb * 2,
            bendStartInterval: 0.5 // Little scoop into the final sweet note
        });
    }

    // --- 4. Harmony Resolution ---
    if (enabled.harmony) {
        // V Chord: Root + 5th (Simple support)
        const vNotes = [0, 7].map(i => domRootMidi + 12 + i); // Higher octave
        vNotes.forEach(m => {
            notes.push({
                midi: m,
                freq: 440 * Math.pow(2, (m - 69) / 12),
                velocity: 0.5,
                midiVelocity: 70,
                durationSteps: 8,
                module: 'harmony',
                step: step,
                timingOffset: 0
            });
        });

        // I Chord: Root + 5th + 9th (Open voicing)
        const iNotes = [0, 7, 14].map(i => rootMidi + 12 + i);
        iNotes.forEach((m, idx) => {
            notes.push({
                midi: m,
                freq: 440 * Math.pow(2, (m - 69) / 12),
                velocity: 0.6,
                midiVelocity: 80,
                durationSteps: 24,
                module: 'harmony',
                step: step,
                timingOffset: (spb * 2) + (idx * 0.02)
            });
        });
    }

    // --- 5. Drums Resolution ---
    if (enabled.groove) {
        // Beat 1: Kick + Closed Hat (Tight start)
        notes.push({
            module: 'groove',
            name: 'Kick',
            velocity: 0.9,
            midiVelocity: 100,
            step: step,
            timingOffset: 0
        });
        notes.push({
            module: 'groove',
            name: 'HiHat',
            velocity: 0.7,
            midiVelocity: 90,
            step: step,
            timingOffset: 0
        });

        // Beat 2: Snare (The pickup)
        notes.push({
            module: 'groove',
            name: 'Snare',
            velocity: 0.8,
            midiVelocity: 100,
            step: step,
            timingOffset: spb
        });

        // Beat 3: Kick + Crash (The Release)
        notes.push({
            module: 'groove',
            name: 'Kick',
            velocity: 1.0,
            midiVelocity: 127,
            step: step,
            timingOffset: spb * 2
        });
        notes.push({
            module: 'groove',
            name: 'Crash',
            velocity: 0.95,
            midiVelocity: 120,
            step: step,
            timingOffset: spb * 2
        });
    }

    return notes;
}
