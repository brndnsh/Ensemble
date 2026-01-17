import { midi, dispatch, ctx } from './state.js';
import { getMidi } from './utils.js';

let midiAccess = null;

/**
 * Initializes Web MIDI access and populates available outputs.
 */
export async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        console.warn("Web MIDI API not supported in this browser.");
        return false;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess();
        midiAccess.onstatechange = (e) => {
            syncMIDIOutputs();
        };
        syncMIDIOutputs();
        return true;
    } catch (err) {
        console.error("Failed to get MIDI access", err);
        return false;
    }
}

/**
 * Updates the state with current list of MIDI outputs.
 */
export function syncMIDIOutputs() {
    if (!midiAccess) return;
    const outputs = [];
    for (const output of midiAccess.outputs.values()) {
        outputs.push({ id: output.id, name: output.name });
    }
    dispatch('SET_MIDI_CONFIG', { outputs });
}

/**
 * Sends a MIDI Note On message.
 * @param {number} channel - 1-16
 * @param {number} note - MIDI note number 0-127
 * @param {number} velocity - 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDINoteOn(channel, note, velocity, time) {
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - ctx.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0x90 | (channel - 1);
    output.send([status, note, velocity], midiTime);
}

/**
 * Sends a MIDI Note Off message.
 * @param {number} channel - 1-16
 * @param {number} note - MIDI note number 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDINoteOff(channel, note, time) {
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - ctx.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0x80 | (channel - 1);
    output.send([status, note, 0], midiTime);
}

/**
 * Sends a MIDI Control Change message.
 * @param {number} channel - 1-16
 * @param {number} controller - CC number 0-127
 * @param {number} value - 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDICC(channel, controller, value, time) {
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - ctx.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0xB0 | (channel - 1);
    output.send([status, controller, value], midiTime);
}

/**
 * Convenience helper to send a note with a duration.
 * @param {number} channel 
 * @param {number} note 
 * @param {number} velocity 
 * @param {number} time 
 * @param {number} duration 
 */
export function sendMIDINote(channel, note, velocity, time, duration) {
    sendMIDINoteOn(channel, note, velocity, time);
    sendMIDINoteOff(channel, note, time + duration);
}

/**
 * Maps drum instrument names to standard MIDI drum notes (General MIDI).
 */
const DRUM_MAP = {
    'Kick': 36,
    'Snare': 38,
    'HiHat': 42,
    'Open': 46,
    'Crash': 49,
    'Ride': 51,
    'Rim': 37,
    'TomLo': 41,
    'TomHi': 45,
    'Clap': 39,
    'Cowbell': 56,
    'Shaker': 70
};

/**
 * Maps an internal velocity (0.0 to ~1.5) to a MIDI velocity (0-127).
 * Uses a compression curve to ensure high-intensity accents don't just slam into 127.
 * @param {number} internalVel 
 * @returns {number} 0-127
 */
export function normalizeMidiVelocity(internalVel) {
    // We treat 1.5 as the "theoretical maximum" for internal accents.
    // Linear scale would be (vel / 1.5) * 127.
    // Sensitivity allows users to push the "meat" of the performance higher or lower.
    const sensitivity = midi.velocitySensitivity || 1.0;
    const normalized = Math.pow(Math.min(1.5, internalVel) / 1.5, 1 / sensitivity);
    return Math.max(1, Math.min(127, Math.floor(normalized * 127)));
}

/**
 * Specifically handles drum scheduling for MIDI.
 */
export function sendMIDIDrum(instrumentName, time, velocity, octaveOffset = 0) {
    const note = (DRUM_MAP[instrumentName] || 36) + (octaveOffset * 12);
    const vel = normalizeMidiVelocity(velocity);
    // Drums are usually short triggers, so we'll send a note off shortly after
    sendMIDINote(midi.drumsChannel, note, vel, time, 0.05);
}

/**
 * All Notes Off for all channels.
 */
export function panic() {
    if (!midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    for (let ch = 0; ch < 16; ch++) {
        output.send([0xB0 | ch, 123, 0]); // All Notes Off
        output.send([0xB0 | ch, 121, 0]); // Reset All Controllers
    }
}
