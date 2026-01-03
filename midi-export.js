import { ctx, gb, cb, bb, sb } from './state.js';
import { ui, showToast } from './ui.js';
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
        const normalized = Math.max(0, Math.min(16383, value + 8192));
        const lsb = normalized & 0x7F;
        const msb = (normalized >> 7) & 0x7F;
        this.addEvent(deltaTime, [0xE0 | channel, lsb, msb]);
    }

    setTempo(deltaTime, bpm) {
        const microsecondsPerBeat = Math.round(60000000 / bpm);
        this.addEvent(deltaTime, [0xFF, 0x51, 0x03, (microsecondsPerBeat >> 16) & 0xFF, (microsecondsPerBeat >> 8) & 0xFF, microsecondsPerBeat & 0xFF]);
    }

    setName(deltaTime, name) {
        const bytes = writeString(name);
        this.addEvent(deltaTime, [0xFF, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }

    setMarker(deltaTime, text) {
        const bytes = writeString(text);
        this.addEvent(deltaTime, [0xFF, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }

    endOfTrack(deltaTime = 0) {
        this.addEvent(deltaTime, [0xFF, 0x2F, 0x00]);
    }

    toBytes() {
        const length = writeInt32(this.events.length);
        const header = [...writeString('MTrk'), ...length];
        const bytes = new Uint8Array(header.length + this.events.length);
        bytes.set(header, 0);
        bytes.set(this.events, header.length);
        return bytes;
    }
}

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
        let soloistTimeInPulses = 0;
        
        // Tracks
        const metaTrack = new MidiTrack();
        const chordTrack = new MidiTrack();
        const bassTrack = new MidiTrack();
        const soloistTrack = new MidiTrack();
        const drumTrack = new MidiTrack();

        // Init Meta
        metaTrack.setName(0, 'Ensemble Export');
        metaTrack.setTempo(0, ctx.bpm);

        // Init Instruments
        chordTrack.setName(0, 'Chords');
        chordTrack.programChange(0, 0, 4); 
        bassTrack.setName(0, 'Bass');
        bassTrack.programChange(0, 1, 34);
        soloistTrack.setName(0, 'Soloist');
        soloistTrack.programChange(0, 2, 80);
        drumTrack.setName(0, 'Drums');

        const chordNotesOff = [], bassNotesOff = [], soloistNotesOff = [], drumNotesOff = [];
        const drumMap = { 'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46 };
        const pulsesPerStep = PPQ / 4;

        let lastBassFreq = null, lastSoloFreq = null, soloBusySteps = 0;

        const getSwungPulse = (step) => {
            let pulse = step * pulsesPerStep;
            if (gb.swing > 0) {
                const shift = (pulsesPerStep / 3) * (gb.swing / 100);
                if (gb.swingSub === '16th') {
                    if (step % 2 === 1) pulse += shift;
                } else {
                    const mod = step % 4;
                    if (mod === 1) pulse += shift;
                    else if (mod === 2) pulse += shift * 2;
                    else if (mod === 3) pulse += shift;
                }
            }
            return Math.round(pulse);
        };

        const processOffs = (track, list, channel, targetTime) => {
            list.sort((a, b) => a.time - b.time);
            while (list.length > 0 && list[0].time <= targetTime) {
                const off = list.shift();
                const delta = Math.max(0, off.time - track.currentTime);
                off.notes.forEach((n, i) => {
                    track.noteOff(i === 0 ? delta : 0, channel, n);
                });
                track.currentTime = off.time;
            }
        };

        for (let step = 0; step < totalSteps; step++) {
            const currentTimeInPulses = getSwungPulse(step);
            const straightTimeInPulses = Math.round(step * pulsesPerStep);
            const straightness = 0.65;
            soloistTimeInPulses = Math.round((straightTimeInPulses * straightness) + (currentTimeInPulses * (1.0 - straightness)));

            const measureStep = step % 16;
            const drumStep = step % drumLoopSteps;

            // Find current chord
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

            // Process Offs
            processOffs(chordTrack, chordNotesOff, 0, currentTimeInPulses);
            processOffs(bassTrack, bassNotesOff, 1, currentTimeInPulses);
            processOffs(soloistTrack, soloistNotesOff, 2, soloistTimeInPulses);
            processOffs(drumTrack, drumNotesOff, 9, currentTimeInPulses);

            // Chord Marker
            if (activeChord && stepInChord === 0) {
                const delta = currentTimeInPulses - metaTrack.currentTime;
                metaTrack.setMarker(delta, activeChord.absName);
                metaTrack.currentTime = currentTimeInPulses;
            }

            // Chords
            if (cb.enabled && activeChord) {
                const patternFunc = midiChordPatterns[cb.style] || midiChordPatterns.pad;
                const events = patternFunc(activeChord, stepInChord, measureStep, step);
                events.forEach(ev => {
                    const delta = Math.max(0, currentTimeInPulses - chordTrack.currentTime);
                    ev.midi.forEach((n, i) => chordTrack.noteOn(i === 0 ? delta : 0, 0, n, 80));
                    chordTrack.currentTime = currentTimeInPulses;
                    const endStep = step + Math.round(ev.dur);
                    chordNotesOff.push({ time: Math.round(getSwungPulse(endStep) - (pulsesPerStep * 0.1)), notes: ev.midi });
                });
            }

            // Bass
            if (bb.enabled && activeChord) {
                let shouldPlay = (bb.style === 'whole' && stepInChord === 0) || 
                                 (bb.style === 'half' && stepInChord % 8 === 0) || 
                                 ((bb.style === 'quarter' || bb.style === 'arp') && stepInChord % 4 === 0);

                if (shouldPlay) {
                    let nextChord = null, nextCurrent = 0;
                    for (const c of cb.progression) {
                        const cSteps = Math.round(c.beats * 4);
                        if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) { nextChord = c; break; }
                        nextCurrent += cSteps;
                    }
                    const bassFreq = getBassNote(activeChord, nextChord, Math.floor(stepInChord / 4), lastBassFreq, bb.octave, bb.style);
                    if (bassFreq) {
                        lastBassFreq = bassFreq;
                        const midi = getMidi(bassFreq);
                        const delta = Math.max(0, currentTimeInPulses - bassTrack.currentTime);
                        bassTrack.noteOn(delta, 1, midi, 90);
                        bassTrack.currentTime = currentTimeInPulses;
                        const durSteps = (bb.style === 'whole' ? activeChord.beats : (bb.style === 'half' ? 2 : 1)) * 4;
                        bassNotesOff.push({ time: Math.round(getSwungPulse(step + durSteps) - (pulsesPerStep * 0.1)), notes: [midi] });
                    }
                }
            }

            // Soloist
            if (sb.enabled && activeChord) {
                if (soloBusySteps > 0) { soloBusySteps--; }
                else {
                    let nextChord = null, nextCurrent = 0;
                    for (const c of cb.progression) {
                        const cSteps = Math.round(c.beats * 4);
                        if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) { nextChord = c; break; }
                        nextCurrent += cSteps;
                    }
                    const soloResult = getSoloistNote(activeChord, nextChord, step % 16, lastSoloFreq, sb.octave, sb.style);
                    if (soloResult && soloResult.freq) {
                        lastSoloFreq = soloResult.freq;
                        const midi = getMidi(soloResult.freq);
                        const delta = Math.max(0, soloistTimeInPulses - soloistTrack.currentTime);
                        if (soloResult.bendStartInterval) {
                            const bendValue = Math.round(-(soloResult.bendStartInterval / 2) * 8192);
                            soloistTrack.pitchBend(delta, 2, bendValue);
                            soloistTrack.noteOn(0, 2, midi, 100);
                            const bendReleaseTime = Math.min(Math.round(pulsesPerStep * 0.8), 48); 
                            soloistTrack.pitchBend(bendReleaseTime, 2, 0);
                            soloistTrack.currentTime = soloistTimeInPulses + bendReleaseTime;
                        } else {
                            soloistTrack.noteOn(delta, 2, midi, 100);
                            soloistTrack.currentTime = soloistTimeInPulses;
                        }
                        const durSteps = soloResult.durationMultiplier;
                        soloistNotesOff.push({ time: soloistTimeInPulses + Math.round(durSteps * pulsesPerStep * 0.9), notes: [midi] });
                        soloBusySteps = durSteps - 1;
                    }
                }
            }

            // Drums
            if (gb.enabled) {
                gb.instruments.forEach(inst => {
                    const val = inst.steps[drumStep];
                    if (val > 0 && !inst.muted) {
                        const midi = drumMap[inst.name], vel = val === 2 ? 110 : 80;
                        const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                        drumTrack.noteOn(delta, 9, midi, vel);
                        drumTrack.currentTime = currentTimeInPulses;
                        drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                    }
                });
            }
        }

        // Finalize
        const finalTime = getSwungPulse(totalSteps);
        const finalizeTrack = (track, offList, channel, time) => {
            processOffs(track, offList, channel, 9999999);
            track.endOfTrack(Math.max(0, time - track.currentTime));
        };

        finalizeTrack(chordTrack, chordNotesOff, 0, finalTime);
        finalizeTrack(bassTrack, bassNotesOff, 1, finalTime);
        finalizeTrack(soloistTrack, soloistNotesOff, 2, finalTime);
        finalizeTrack(drumTrack, drumNotesOff, 9, finalTime);
        metaTrack.endOfTrack(Math.max(0, finalTime - metaTrack.currentTime));

        // Assemble
        const tracks = [metaTrack, chordTrack, bassTrack, soloistTrack, drumTrack];
        const header = new Uint8Array([
            ...writeString('MThd'),
            ...writeInt32(6),
            ...writeInt16(1),
            ...writeInt16(tracks.length),
            ...writeInt16(PPQ)
        ]);

        let totalLength = header.length;
        const trackBytes = tracks.map(t => {
            const b = t.toBytes();
            totalLength += b.length;
            return b;
        });

        const result = new Uint8Array(totalLength);
        result.set(header, 0);
        let offset = header.length;
        trackBytes.forEach(b => {
            result.set(b, offset);
            offset += b.length;
        });

        const blob = new Blob([result], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ensemble-${cb.key}-${ctx.bpm}bpm.mid`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("MIDI Export failed:", e);
        showToast("MIDI Export failed. Check console.");
    }
}