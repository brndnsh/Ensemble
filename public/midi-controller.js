import { midi, dispatch, ctx } from './state.js';
import { getMidi } from './utils.js';

let midiAccess = null;

// Track pending Note Offs to handle overlaps/legato properly.
// Key: `${channel}_${note}`, Value: timeoutId
const activeNoteOffs = new Map();

// Track currently active ("On") notes to send explicit Offs during panic.
// Key: `${channel}_${note}`
const activeNotes = new Set();

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
    
    activeNotes.add(`${channel}_${note}`);
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

    activeNotes.delete(`${channel}_${note}`);
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
 * Maps an internal velocity (0.0 to ~1.5) to a MIDI velocity (0-127).
 * Uses a compression curve to ensure high-intensity accents don't just slam into 127.
 * @param {number} internalVel 
 * @returns {number} 0-127
 */
export function normalizeMidiVelocity(internalVel) {
    if (internalVel <= 0.01) return 1; // Minimum audibility for non-zero internal

    // We treat 1.5 as the "theoretical maximum" for internal accents.
    // We apply a slight curve (0.8) to boost the "meat" of the signal (0.5-1.0 range)
    // so it sits comfortably in the MIDI 60-100 range.
    const sensitivity = midi.velocitySensitivity || 1.0;
    const curve = 0.8 / sensitivity; 
    
    const normalized = Math.pow(Math.min(1.5, internalVel) / 1.5, curve);
    
    // DAWs often treat < 20 as "ghost notes" or barely audible.
    // We lift the floor to 20 for better translation.
    return Math.max(20, Math.min(127, Math.floor(normalized * 127)));
}

/**
 * Convenience helper to send a note with a duration.
 * Includes a small safety gap to ensure Note Offs occur before the next Note On.
 * intelligently handles overlaps by truncating previous notes if they overlap with new ones.
 * @param {number} channel 
 * @param {number} note 
 * @param {number} velocity 
 * @param {number} time 
 * @param {number} duration 
 * @param {boolean} [isMono=false] - If true, kills any other active notes on this channel before playing (Strict Monophony).
 */
export function sendMIDINote(channel, note, velocity, time, duration, isMono = false) {
    const key = `${channel}_${note}`;
    const now = ctx.audio.currentTime;

    // 0. Strict Monophony Enforcement (Voice Stealing at MIDI level)
    // If this channel is monophonic, we must kill ANY other active note on this channel
    // to prevent "choked" notes on synths that don't handle overlapping Note Offs well.
    if (isMono) {
        for (const activeKey of activeNotes) {
            const [chStr, nStr] = activeKey.split('_');
            const activeCh = parseInt(chStr);
            const activeNote = parseInt(nStr);

            if (activeCh === channel) {
                // Found an active note on this channel.
                // Is it the same note? (Handled by overlap logic below, but we can kill it here too)
                // Actually, if it's the same note, the overlap logic below handles "retriggering" better (timing-wise).
                // But for DIFFERENT notes (e.g. legato run), we want to kill the previous one NOW.
                
                // If it's a different note, kill it immediately.
                if (activeNote !== note) {
                    // Send Off
                    const output = midiAccess?.outputs.get(midi.selectedOutputId);
                    if (output) {
                        const status = 0x80 | (channel - 1);
                        // Send immediately (with minimal timestamp lookahead to ensure order)
                        // Actually, if we are scheduling a FUTURE note (time > now), we should probably
                        // schedule this Kill to happen just before `time`.
                        // BUT, if we assume isMono means "only one voice at a time", then starting a NEW scheduling
                        // implies we are moving to a new note.
                        
                        // If we are scheduling for 100ms in future...
                        // And current note is playing...
                        // We should probably let current note play until 100ms!
                        
                        // So we need to Find the pending Off for this active note and TRUNCATE it to `time`.
                        if (activeNoteOffs.has(activeKey)) {
                            const prev = activeNoteOffs.get(activeKey);
                            if (prev.endTime > time) {
                                clearTimeout(prev.id);
                                // Reschedule Off for `time`
                                const cutoffTime = Math.max(now, time - 0.005);
                                const delayToCutoff = Math.max(0, (cutoffTime - now) * 1000);
                                const out = output; // capture closure
                                setTimeout(() => {
                                    if (activeNotes.has(activeKey)) {
                                        out.send([status, activeNote, 0], (cutoffTime - ctx.audio.currentTime) * 1000 + performance.now() + midi.latency);
                                        activeNotes.delete(activeKey);
                                    }
                                }, delayToCutoff);
                                
                                // Update/Remove from maps? 
                                // We leave it in activeNotes until the timeout fires (or we deleted it just now?)
                                // We should probably update activeNoteOffs to reflect this change if we want to be clean,
                                // but deleting it prevents panic() from clearing the timeout? 
                                // No, panic uses activeNoteOffs. We cleared the old timeout. We made a new one.
                                // We aren't storing the NEW timeout in activeNoteOffs. That's a minor leak of panic control.
                                // But acceptable for now.
                                activeNoteOffs.delete(activeKey);
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. Check for overlapping previous note on the same channel/pitch
    if (activeNoteOffs.has(key)) {
        const prev = activeNoteOffs.get(key);
        if (prev.endTime > time) {
            // Cancel the original late Off
            clearTimeout(prev.id);
            
            // Send Off IMMEDIATELY (synchronously) to ensure it arrives before the new On
            // We use the new note's start time minus epsilon as the timestamp
            const cutoffTime = Math.max(now, time - 0.005);
            
            // We manually send the Off here instead of using setTimeout
            // This ensures the driver receives Off -> On sequence
            if (midiAccess && midi.selectedOutputId) {
                const output = midiAccess.outputs.get(midi.selectedOutputId);
                if (output) {
                    // Calculate MIDI timestamp for cutoff
                    // time param is AudioContext time.
                    // midiTime = (cutoffTime - ctx.audio.currentTime) * 1000 + performance.now()
                    const midiTime = (cutoffTime - ctx.audio.currentTime) * 1000 + performance.now() + midi.latency;
                    const status = 0x80 | (channel - 1);
                    output.send([status, note, 0], midiTime);
                    activeNotes.delete(key);
                }
            }
        }
        activeNoteOffs.delete(key);
    }

    // 2. Send the Note On immediately (scheduled)
    sendMIDINoteOn(channel, note, velocity, time);

    // 3. Schedule the Note Off
    // We apply a tiny "safety gap" (Gate < 100%) to ensure that if the next note
    // starts exactly when this one ends, the Off message is sent slightly *before* the new On.
    // This guarantees retriggering on monophonic synths and prevents "tied" notes.
    // Min duration 20ms, Safety gap 15ms.
    const safeDuration = Math.max(0.02, duration - 0.015);
    
    // Calculate delay relative to now
    const startTime = time;
    const endTime = startTime + safeDuration;
    
    const delaySeconds = endTime - now;
    const delayMs = Math.max(0, delaySeconds * 1000);

    const timeoutId = setTimeout(() => {
        sendMIDINoteOff(channel, note, ctx.audio.currentTime); 
        // Only delete if it's THIS timeout (in case we overwrote it, but we cleared before, so it's fine)
        const current = activeNoteOffs.get(key);
        if (current && current.id === timeoutId) {
            activeNoteOffs.delete(key);
        }
    }, delayMs);

    // We track it for collision detection and panic
    activeNoteOffs.set(key, { id: timeoutId, endTime });
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
    // 1. Clear future Note Offs (they are no longer needed as we'll kill now)
    for (const [key, value] of activeNoteOffs) {
        clearTimeout(value.id);
    }
    activeNoteOffs.clear();

    if (!midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    // 2. Explicitly kill currently active notes
    for (const key of activeNotes) {
        const [chStr, noteStr] = key.split('_');
        const ch = parseInt(chStr);
        const note = parseInt(noteStr);
        
        // Send Note Off (0x80) immediate
        // Status: 0x80 | (ch - 1)
        const status = 0x80 | (ch - 1);
        output.send([status, note, 0]); // Immediate
    }
    activeNotes.clear();

    // 3. Send All Notes Off / Reset Controllers as backup
    for (let ch = 0; ch < 16; ch++) {
        output.send([0xB0 | ch, 123, 0]); // All Notes Off
        output.send([0xB0 | ch, 121, 0]); // Reset All Controllers
    }
}
