import { KEY_ORDER } from './config.js';
import { getMidi } from './utils.js';

/**
 * Generates the musical events for the final resolution of a song.
 * Shared by both the live playback engine (logic-worker.js -> scheduler-core.js)
 * and the MIDI export engine (logic-worker.js).
 *
 * @param {number} step - The global step where the resolution starts.
 * @param {Object} arranger - The arranger state { key, isMinor }.
 * @param {Object} enabled - Enabled tracks { bb, cb, sb, hb, gb }.
 * @returns {Array} List of note events.
 */
export function generateResolutionNotes(step, arranger, enabled) {
    const notes = [];
    
    // Determine resolution key from the last chord of the arrangement
    let resolutionKey = arranger.key;
    if (arranger.stepMap && arranger.stepMap.length > 0) {
        const lastEntry = arranger.stepMap[arranger.stepMap.length - 1];
        if (lastEntry && lastEntry.chord && lastEntry.chord.key) {
            resolutionKey = lastEntry.chord.key;
        }
    }

    // 1. Identify Tonic Chord with Sophisticated Voicing
    const keyPC = KEY_ORDER.indexOf(resolutionKey);
    const rootMidi = keyPC + 60;
    
    // Sophisticated Resolution Voicings
    // Major: 6/9 (Root, 2, 3, 5, 6)
    // Minor: m9 (Root, 2, b3, 5, b7)
    const intervals = arranger.isMinor ? [0, 2, 3, 7, 10] : [0, 2, 4, 7, 9];
    const tonicFreqs = intervals.map(i => {
        return 440 * Math.pow(2, (rootMidi + i - 69) / 12);
    });

    // 2. Bass Resolution (Very low root - Octave 2)
    if (enabled.bb) {
        const bassMidi = (keyPC % 12) + 24; 
        const midiVel = Math.max(1, Math.min(127, Math.round(1.0 * 127)));
        notes.push({
            midi: bassMidi,
            freq: 440 * Math.pow(2, (bassMidi - 69) / 12),
            velocity: 1.0, // Keep for audio engine
            midiVelocity: midiVel, // For MIDI export symmetry
            durationSteps: 16, // Full 4 beats
            module: 'bb',
            step: step,
            timingOffset: 0
        });
    }

    // 3. Chord Resolution (Strummed Tonic Voicing)
    if (enabled.cb) {
        // Explicit Sustain Pedal On
        notes.push({
            midi: 0,
            module: 'cb',
            step: step,
            ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }]
        });

        tonicFreqs.forEach((f, i) => {
            const vel = 0.65;
            const midiVel = Math.max(1, Math.min(127, Math.round(vel * 127)));
            notes.push({
                midi: getMidi(f),
                freq: f,
                velocity: vel,
                midiVelocity: midiVel,
                durationSteps: 16,
                module: 'cb',
                step: step,
                timingOffset: i * 0.025 // Professional slow strum
            });
        });
    }

    // 4. Soloist Resolution (Root or 5th with a curl)
    if (enabled.sb) {
        const isRoot = Math.random() < 0.7;
        const soloMidi = (keyPC % 12) + (isRoot ? 72 : 79); 
        const vel = 0.8;
        const midiVel = Math.max(1, Math.min(127, Math.round(vel * 127)));
        notes.push({
            midi: soloMidi,
            freq: 440 * Math.pow(2, (soloMidi - 69) / 12),
            velocity: vel,
            midiVelocity: midiVel,
            durationSteps: 12,
            module: 'sb',
            step: step,
            timingOffset: 0,
            bendStartInterval: isRoot ? 0.5 : 0 // Only curl if landing on root
        });
    }

    // 5. Harmony Resolution (Clean ensemble voicing)
    if (enabled.hb) {
        // Simple Root-3rd-5th voicing in higher octave
        const hbIntervals = arranger.isMinor ? [0, 3, 7] : [0, 4, 7];
        hbIntervals.forEach(i => {
            const midi = (keyPC % 12) + 72 + i;
            const vel = 0.6;
            const midiVel = Math.round(vel * 127);
            notes.push({
                midi: midi,
                freq: 440 * Math.pow(2, (midi - 69) / 12),
                velocity: vel,
                midiVelocity: midiVel,
                durationSteps: 16,
                module: 'hb',
                step: step,
                timingOffset: 0
            });
        });
    }

    // 6. Drums Resolution (Kick + Crash)
    if (enabled.gb) {
        // Kick
        notes.push({
            module: 'gb',
            name: 'Kick',
            velocity: 1.0,
            midiVelocity: 120,
            step: step,
            timingOffset: 0
        });
        // Crash
        notes.push({
            module: 'gb',
            name: 'Crash',
            velocity: 0.9,
            midiVelocity: 115,
            step: step,
            timingOffset: 0
        });
    }

    return notes;
}
