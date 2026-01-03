import { ctx, gb, cb, bb, sb } from './state.js';
import { getMidi } from './utils.js';
import { getBassNote } from './bass.js';
import { getSoloistNote } from './soloist.js';

/**
 * Minimal MIDI file generator (Standard MIDI File Format 1)
 */

const PPQ = 192; // Pulses per quarter note

function writeVarInt(value) {
    const buffer = [];
    if (value === 0) return [0];
    while (value > 0) {
        let byte = value & 0x7F;
        value >>= 7;
        if (buffer.length > 0) byte |= 0x80;
        buffer.push(byte);
    }
    return buffer.reverse();
}

function writeString(str) {
    return str.split('').map(c => c.charCodeAt(0));
}

function writeInt32(val) {
    return [(val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF];
}

function writeInt16(val) {
    return [(val >> 8) & 0xFF, val & 0xFF];
}

class MidiTrack {
    constructor() {
        this.events = [];
        this.currentTime = 0;
    }

    addEvent(deltaTime, data) {
        this.events.push(...writeVarInt(deltaTime), ...data);
    }

    noteOn(deltaTime, channel, note, velocity) {
        this.addEvent(deltaTime, [0x90 | channel, note, velocity]);
    }

    noteOff(deltaTime, channel, note) {
        this.addEvent(deltaTime, [0x80 | channel, note, 0]);
    }

    programChange(deltaTime, channel, program) {
        this.addEvent(deltaTime, [0xC0 | channel, program]);
    }

    pitchBend(deltaTime, channel, value) {
        // value is -8192 to 8191. MIDI uses 14-bit (two 7-bit bytes), 0x2000 is center.
        const normalized = Math.max(0, Math.min(16383, value + 8192));
        const lsb = normalized & 0x7F;
        const msb = (normalized >> 7) & 0x7F;
        this.addEvent(deltaTime, [0xE0 | channel, lsb, msb]);
    }

    setTempo(bpm) {
        const microsecondsPerBeat = Math.round(60000000 / bpm);
        this.addEvent(0, [0xFF, 0x51, 0x03, (microsecondsPerBeat >> 16) & 0xFF, (microsecondsPerBeat >> 8) & 0xFF, microsecondsPerBeat & 0xFF]);
    }

    setName(name) {
        const bytes = writeString(name);
        this.addEvent(0, [0xFF, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }

    setMarker(text) {
        const bytes = writeString(text);
        this.addEvent(0, [0xFF, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }

    endOfTrack() {
        this.addEvent(0, [0xFF, 0x2F, 0x00]);
    }

    toBytes() {
        const length = writeInt32(this.events.length);
        return [...writeString('MTrk'), ...length, ...this.events];
    }
}

// Simulated patterns for MIDI export (since accompaniment.js plays directly to audio)
const midiChordPatterns = {
    pad: (chord, stepInChord) => stepInChord === 0 ? [{ midi: chord.freqs.map(getMidi), dur: chord.beats * 4 }] : [],
    strum8: (chord, stepInChord, measureStep) => measureStep % 2 === 0 ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    pop: (chord, stepInChord, measureStep) => [0, 3, 6, 10, 12, 14].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1.5 }] : [],
    rock: (chord, stepInChord, measureStep) => measureStep % 2 === 0 ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    skank: (chord, stepInChord, measureStep) => measureStep % 8 === 4 ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    double_skank: (chord, stepInChord, measureStep) => [4, 6].includes(measureStep % 8) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    funk: (chord, stepInChord, measureStep) => [0, 3, 4, 7, 8, 11, 12, 15].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    arpeggio: (chord, stepInChord, measureStep) => {
        if (measureStep % 2 === 0) {
            const idx = Math.floor(stepInChord / 2) % chord.freqs.length;
            return [{ midi: [getMidi(chord.freqs[idx])], dur: 2 }];
        }
        return [];
    },
    tresillo: (chord, stepInChord, measureStep) => [0, 3, 6, 8, 11, 14].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1.5 }] : [],
    clave: (chord, stepInChord, measureStep) => [0, 3, 6, 10, 12].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    afrobeat: (chord, stepInChord, measureStep) => [0, 3, 6, 7, 10, 12, 13, 15].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    jazz: (chord, stepInChord, measureStep) => [0, 6, 14].includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    green: (chord, stepInChord, measureStep) => measureStep % 4 === 0 ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [],
    bossa: (chord, stepInChord, measureStep, step) => {
        const pattern = (Math.floor(step / 16) % 2 === 1) ? [0, 3, 6, 8, 11, 14] : [0, 3, 6, 10, 13];
        return pattern.includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [];
    }
};

export function exportToMidi() {
    try {
        if (cb.progression.length === 0) {
            showToast("No progression to export");
            return;
        }

        const totalSteps = cb.progression.reduce((sum, c) => sum + Math.round(c.beats * 4), 0);
        const drumLoopSteps = gb.measures * 16;
        
        // Header
        const header = [
            ...writeString('MThd'),
            ...writeInt32(6),
            ...writeInt16(1), // Format 1
            ...writeInt16(5), // 5 tracks: Tempo/Meta, Chords, Bass, Soloist, Drums
            ...writeInt16(PPQ)
        ];

        // Track 0: Tempo and Meta
        const metaTrack = new MidiTrack();
        metaTrack.setName('Ensemble Export');
        metaTrack.setTempo(ctx.bpm);
        metaTrack.endOfTrack();

        // Track 1: Chords (Channel 0)
        const chordTrack = new MidiTrack();
        chordTrack.setName('Chords');
        chordTrack.programChange(0, 0, 4); // Electric Piano 1
        const chordNotesOff = []; 

        // Track 2: Bass (Channel 1)
        const bassTrack = new MidiTrack();
        bassTrack.setName('Bass');
        bassTrack.programChange(0, 1, 34); // Picked Bass
        const bassNotesOff = [];
        let lastBassFreq = null;

        // Track 3: Soloist (Channel 2)
        const soloistTrack = new MidiTrack();
        soloistTrack.setName('Soloist');
        soloistTrack.programChange(0, 2, 80); // Square Lead
        const soloistNotesOff = [];
        let lastSoloFreq = null;
        let soloBusySteps = 0;

        // Track 4: Drums (Channel 9)
        const drumTrack = new MidiTrack();
        drumTrack.setName('Drums');
        const drumNotesOff = [];
        const drumMap = { 'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46 };

        const pulsesPerStep = Math.round(PPQ / 4);

        for (let step = 0; step < totalSteps; step++) {
            const currentTimeInPulses = step * pulsesPerStep;
            const measureStep = step % 16;
            const drumStep = step % drumLoopSteps;

            // Find chord
            let current = 0, activeChord = null, stepInChord = 0;
            for (const chord of cb.progression) {
                const chordSteps = Math.round(chord.beats * 4);
                if (step >= current && step < current + chordSteps) {
                    activeChord = chord;
                    stepInChord = step - current;
                    break;
                }
                current += chordSteps;
            }

            // Add chord markers at the beginning of each chord
            if (activeChord && stepInChord === 0) {
                metaTrack.currentTime = currentTimeInPulses;
                metaTrack.setMarker(activeChord.absName);
            }

            // --- Process Note Offs ---
            const processOffs = (track, list, channel) => {
                list.sort((a, b) => a.time - b.time);
                while (list.length > 0 && list[0].time <= currentTimeInPulses) {
                    const off = list.shift();
                    const delta = Math.max(0, off.time - track.currentTime);
                    off.notes.forEach((n, i) => {
                        track.noteOff(i === 0 ? delta : 0, channel, n);
                    });
                    track.currentTime = off.time;
                }
            };

            processOffs(chordTrack, chordNotesOff, 0);
            processOffs(bassTrack, bassNotesOff, 1);
            processOffs(soloistTrack, soloistNotesOff, 2);
            processOffs(drumTrack, drumNotesOff, 9);

            // --- Process Note Ons ---
            
            // Chords
            if (cb.enabled && activeChord) {
                const patternFunc = midiChordPatterns[cb.style] || midiChordPatterns.pad;
                const events = patternFunc(activeChord, stepInChord, measureStep, step);
                events.forEach(ev => {
                    const delta = Math.max(0, currentTimeInPulses - chordTrack.currentTime);
                    ev.midi.forEach((n, i) => {
                        chordTrack.noteOn(i === 0 ? delta : 0, 0, n, 80);
                    });
                    chordTrack.currentTime = currentTimeInPulses;
                    chordNotesOff.push({ time: currentTimeInPulses + Math.round(ev.dur * pulsesPerStep * 0.9), notes: ev.midi });
                });
            }

            // Bass
            if (bb.enabled && activeChord) {
                let shouldPlay = false;
                if (bb.style === 'whole' && stepInChord === 0) shouldPlay = true;
                else if (bb.style === 'half' && stepInChord % 8 === 0) shouldPlay = true;
                else if ((bb.style === 'quarter' || bb.style === 'arp') && stepInChord % 4 === 0) shouldPlay = true;

                if (shouldPlay) {
                    let nextChord = null;
                    let nextCurrent = 0;
                    for (const c of cb.progression) {
                        const cSteps = Math.round(c.beats * 4);
                        if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) {
                            nextChord = c;
                            break;
                        }
                        nextCurrent += cSteps;
                    }

                    const bassFreq = getBassNote(activeChord, nextChord, Math.floor(stepInChord / 4), lastBassFreq, bb.octave, bb.style);
                    if (bassFreq) {
                        lastBassFreq = bassFreq;
                        const midi = getMidi(bassFreq);
                        const delta = Math.max(0, currentTimeInPulses - bassTrack.currentTime);
                        bassTrack.noteOn(delta, 1, midi, 90);
                        bassTrack.currentTime = currentTimeInPulses;
                        const dur = (bb.style === 'whole' ? activeChord.beats : (bb.style === 'half' ? 2 : 1)) * 4;
                        bassNotesOff.push({ time: currentTimeInPulses + Math.round(dur * pulsesPerStep * 0.9), notes: [midi] });
                    }
                }
            }

            // Soloist
            if (sb.enabled && activeChord) {
                if (soloBusySteps > 0) {
                    soloBusySteps--;
                } else {
                    let nextChord = null;
                    let nextCurrent = 0;
                    for (const c of cb.progression) {
                        const cSteps = Math.round(c.beats * 4);
                        if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) {
                            nextChord = c;
                            break;
                        }
                        nextCurrent += cSteps;
                    }

                    const soloResult = getSoloistNote(activeChord, nextChord, step % 16, lastSoloFreq, sb.octave, sb.style);
                    if (soloResult && soloResult.freq) {
                        lastSoloFreq = soloResult.freq;
                        const midi = getMidi(soloResult.freq);
                        const delta = Math.max(0, currentTimeInPulses - soloistTrack.currentTime);
                        
                        // Handle Pitch Bend (Scoop)
                        if (soloResult.bendStartInterval && soloResult.bendStartInterval !== 0) {
                            // MIDI Pitch bend range is usually +/- 2 semitones by default
                            const bendValue = Math.round(-(soloResult.bendStartInterval / 2) * 8192);
                            soloistTrack.pitchBend(delta, 2, bendValue);
                            soloistTrack.noteOn(0, 2, midi, 100);
                            
                            // Ramp bend back to 0 over ~100ms
                            const bendReleaseTime = Math.min(Math.round(pulsesPerStep * 0.8), 48); 
                            soloistTrack.pitchBend(bendReleaseTime, 2, 0);
                            soloistTrack.currentTime = currentTimeInPulses + bendReleaseTime;
                        } else {
                            soloistTrack.noteOn(delta, 2, midi, 100);
                            soloistTrack.currentTime = currentTimeInPulses;
                        }
                        
                        const dur = soloResult.durationMultiplier;
                        soloistNotesOff.push({ time: currentTimeInPulses + Math.round(dur * pulsesPerStep * 0.9), notes: [midi] });
                        soloBusySteps = dur - 1;
                    }
                }
            }

            // Drums
            if (gb.enabled) {
                gb.instruments.forEach(inst => {
                    const val = inst.steps[drumStep];
                    if (val > 0 && !inst.muted) {
                        const midi = drumMap[inst.name];
                        const vel = val === 2 ? 110 : 80;
                        const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                        drumTrack.noteOn(delta, 9, midi, vel);
                        drumTrack.currentTime = currentTimeInPulses;
                        drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                    }
                });
            }
        }

        // Finalize tracks
        finalize(chordTrack, chordNotesOff, 0);
        finalize(bassTrack, bassNotesOff, 1);
        finalize(soloistTrack, soloistNotesOff, 2);
        finalize(drumTrack, drumNotesOff, 9);

        const result = new Uint8Array([
            ...header,
            ...metaTrack.toBytes(),
            ...chordTrack.toBytes(),
            ...bassTrack.toBytes(),
            ...soloistTrack.toBytes(),
            ...drumTrack.toBytes()
        ]);

        const blob = new Blob([result], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ensemble-export.mid';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("MIDI Export failed:", e);
        showToast("MIDI Export failed. Check console.");
    }
}

function finalize(track, offList, channel) {
    offList.sort((a, b) => a.time - b.time);
    offList.forEach(off => {
        const delta = Math.max(0, off.time - track.currentTime);
        off.notes.forEach((n, i) => {
            track.noteOff(i === 0 ? delta : 0, channel, n);
        });
        track.currentTime = off.time;
    });
    track.endOfTrack();
}
