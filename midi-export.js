import { ctx, gb, cb, bb, sb, arranger } from './state.js';
import { ui, showToast } from './ui.js';
import { getMidi } from './utils.js';
import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { TIME_SIGNATURES } from './config.js';

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

    setKeySignature(deltaTime, root, isMinor) {
        // sf: number of sharps (pos) or flats (neg)
        // mi: 0 for major, 1 for minor
        const keyMap = {
            'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'Gb': -6, 
            'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1
        };
        
        // Normalize enharmonics if needed
        const rootLookup = (root === 'F#' ? 'Gb' : (root === 'C#' ? 'Db' : root));
        let sf = keyMap[rootLookup] || 0;
        
        // If minor, sf is same as the relative major (3 semitones up)
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const idx = (KEY_ORDER.indexOf(rootLookup) + 3) % 12;
            const relMajor = KEY_ORDER[idx];
            sf = keyMap[relMajor] || 0;
        }

        const sfByte = sf < 0 ? (256 + sf) : sf;
        this.addEvent(deltaTime, [0xFF, 0x59, 0x02, sfByte, isMinor ? 0x01 : 0x00]);
    }

    setTimeSignature(deltaTime, numerator, denominator) {
        // denominator is power of 2: 2=4, 3=8
        let denomPower = 2;
        if (denominator === 8) denomPower = 3;
        
        this.addEvent(deltaTime, [0xFF, 0x58, 0x04, numerator, denomPower, 24, 8]);
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
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const pattern = (Math.floor(step / stepsPerMeasure) % 2 === 1) ? [0, 3, 6, 8, 11, 14] : [0, 3, 6, 10, 13];
        return pattern.includes(measureStep) ? [{ midi: chord.freqs.map(getMidi), dur: 1 }] : [];
    }
};

export function exportToMidi(options = {}) {
    let sbBackup;
    try {
        const { includedTracks = ['chords', 'bass', 'soloist', 'drums'], loopMode = 'time', targetDuration = 3, filename } = options;

        if (arranger.progression.length === 0) {
            showToast("No progression to export");
            return;
        }

        const totalStepsOneLoop = arranger.progression.reduce((sum, c) => sum + Math.round(c.beats * 4), 0);
        const loopSeconds = (totalStepsOneLoop / 4) * (60 / ctx.bpm);
        
        let loopCount;
        if (loopMode === 'once') {
            loopCount = 1;
        } else {
            // targetDuration is in minutes
            const targetSeconds = (targetDuration || 3) * 60;
            loopCount = Math.max(1, Math.ceil(targetSeconds / loopSeconds));
            // Safety cap: don't let it generate > 100 loops (approx 15-20 mins of fast tempo) to prevent freezing
            if (loopCount > 100) loopCount = 100;
        }

        const totalStepsExport = totalStepsOneLoop * loopCount;

        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const drumLoopSteps = gb.measures * stepsPerMeasure;
        let soloistTimeInPulses = 0;

        // Save and Reset Soloist state for deterministic export and to avoid affecting live playback
        sbBackup = { ...sb };
        Object.assign(sb, {
            busySteps: 0, phraseSteps: 0, isResting: false,
            direction: 1
        });
        
        // Tracks
        const metaTrack = new MidiTrack();
        const chordTrack = new MidiTrack();
        const bassTrack = new MidiTrack();
        const soloistTrack = new MidiTrack();
        const drumTrack = new MidiTrack();

        // Init Meta
        metaTrack.setName(0, 'Ensemble Export');
        metaTrack.setTempo(0, ctx.bpm);
        metaTrack.setKeySignature(0, arranger.key, arranger.isMinor);
        
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        metaTrack.setTimeSignature(0, tsNum, tsDenom);

        // Init Instruments
        if (includedTracks.includes('chords')) {
            chordTrack.setName(0, 'Chords');
            chordTrack.programChange(0, 0, 4); 
        }

        if (includedTracks.includes('bass')) {
            bassTrack.setName(0, 'Bass');
            bassTrack.programChange(0, 1, 34);
        }

        if (includedTracks.includes('soloist')) {
            soloistTrack.setName(0, 'Soloist');
            soloistTrack.programChange(0, 2, 80);
        }

        if (includedTracks.includes('drums')) {
            drumTrack.setName(0, 'Drums');
        }

        const chordNotesOff = [], bassNotesOff = [], soloistNotesOff = [], drumNotesOff = [];
        const drumMap = { 'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46 };
        const pulsesPerStep = PPQ / 4;

        let lastBassFreq = null, lastSoloFreq = null;

        const getSwungPulse = (step) => {
            const floorStep = Math.floor(step);
            let pulse = step * pulsesPerStep;
            if (gb.swing > 0) {
                const shift = (pulsesPerStep / 3) * (gb.swing / 100);
                if (gb.swingSub === '16th') {
                    if (floorStep % 2 === 1) pulse += shift;
                } else {
                    const mod = floorStep % 4;
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

        for (let loop = 0; loop < loopCount; loop++) {
            for (let step = 0; step < totalStepsOneLoop; step++) {
                const globalStep = (loop * totalStepsOneLoop) + step;
                const currentTimeInPulses = getSwungPulse(globalStep);
                const straightTimeInPulses = Math.round(globalStep * pulsesPerStep);
                const straightness = 0.65;
                soloistTimeInPulses = Math.round((straightTimeInPulses * straightness) + (currentTimeInPulses * (1.0 - straightness)));

                const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
                const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
                const measureStep = globalStep % stepsPerMeasure;
                const drumStep = globalStep % drumLoopSteps;

                // Find current chord
                let current = 0, activeChord = null, stepInChord = 0, activeChordIndex = 0;
                for (let i = 0; i < arranger.progression.length; i++) {
                    const chord = arranger.progression[i];
                    const chordSteps = Math.round(chord.beats * 4);
                    if (step >= current && step < current + chordSteps) {
                        activeChord = chord;
                        stepInChord = step - current;
                        activeChordIndex = i;
                        break;
                    }
                    current += chordSteps;
                }

                // Add Chord Marker to Meta Track
                if (activeChord && stepInChord === 0) {
                    const markerName = arranger.notation === 'name' ? activeChord.absName : (arranger.notation === 'nns' ? activeChord.nnsName : activeChord.romanName);
                    metaTrack.setMarker(currentTimeInPulses - metaTrack.currentTime, markerName);
                    metaTrack.currentTime = currentTimeInPulses;
                }

                // Process Offs
                if (includedTracks.includes('chords')) processOffs(chordTrack, chordNotesOff, 0, currentTimeInPulses);
                if (includedTracks.includes('bass')) processOffs(bassTrack, bassNotesOff, 1, currentTimeInPulses);
                if (includedTracks.includes('soloist')) processOffs(soloistTrack, soloistNotesOff, 2, soloistTimeInPulses);
                if (includedTracks.includes('drums')) processOffs(drumTrack, drumNotesOff, 9, currentTimeInPulses);

                // Chords
                if (activeChord && includedTracks.includes('chords')) {
                    const patternFunc = midiChordPatterns[cb.style] || midiChordPatterns.pad;
                    const events = patternFunc(activeChord, stepInChord, measureStep, globalStep);
                    events.forEach(ev => {
                        const delta = Math.max(0, currentTimeInPulses - chordTrack.currentTime);
                        const humanVel = Math.min(127, Math.max(40, 80 + (Math.random() * 10 - 5)));
                        ev.midi.forEach((n, i) => chordTrack.noteOn(i === 0 ? delta : 0, 0, n, humanVel));
                        chordTrack.currentTime = currentTimeInPulses;
                        const endStep = globalStep + ev.dur;
                        chordNotesOff.push({ time: Math.round(getSwungPulse(endStep) - (pulsesPerStep * 0.1)), notes: ev.midi });
                    });
                }

                // Bass
                if (activeChord && includedTracks.includes('bass')) {
                    if (isBassActive(bb.style, globalStep, stepInChord)) {
                        let nextChord = null, nextCurrent = 0;
                        for (const c of arranger.progression) {
                            const cSteps = Math.round(c.beats * 4);
                            if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) { nextChord = c; break; }
                            nextCurrent += cSteps;
                        }
                        const bassResult = getBassNote(activeChord, nextChord, Math.floor(stepInChord / 4), lastBassFreq, bb.octave, bb.style, activeChordIndex, step, stepInChord, arranger.isMinor);
                        if (bassResult && bassResult.freq) {
                            // Enforce Monophony: Cut off previous bass note
                            for (let i = bassNotesOff.length - 1; i >= 0; i--) {
                                if (bassNotesOff[i].time > currentTimeInPulses) {
                                    const pending = bassNotesOff[i];
                                    const offDelta = Math.max(0, currentTimeInPulses - bassTrack.currentTime);
                                    pending.notes.forEach(n => bassTrack.noteOff(offDelta, 1, n));
                                    bassTrack.currentTime = currentTimeInPulses;
                                    bassNotesOff.splice(i, 1);
                                }
                            }

                            lastBassFreq = bassResult.freq;
                            const midi = getMidi(bassResult.freq);
                            const delta = Math.max(0, currentTimeInPulses - bassTrack.currentTime);
                            const baseVel = 90 * (bassResult.velocity || 1.0);
                            const humanVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 10 - 5))));
                            bassTrack.noteOn(delta, 1, midi, humanVel);
                            bassTrack.currentTime = currentTimeInPulses;
                            
                            let durSteps;
                            if (bassResult.durationMultiplier) {
                                durSteps = bassResult.durationMultiplier;
                            } else {
                                durSteps = (bb.style === 'whole' ? activeChord.beats : (bb.style === 'half' ? 2 : 1)) * 4;
                            }
                            
                            // Use smaller gap for bass (5%) to keep it tighter/fuller, vs 10% for others
                            bassNotesOff.push({ time: Math.round(getSwungPulse(globalStep + durSteps) - (pulsesPerStep * 0.05)), notes: [midi] });
                        }
                    }
                }

                // Soloist
                if (activeChord && includedTracks.includes('soloist')) {
                    let nextChord = null, nextCurrent = 0;
                    for (const c of arranger.progression) {
                        const cSteps = Math.round(c.beats * 4);
                        if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) { nextChord = c; break; }
                        nextCurrent += cSteps;
                    }
                    const soloResult = getSoloistNote(activeChord, nextChord, step, lastSoloFreq, sb.octave, sb.style, stepInChord);
                    if (soloResult && soloResult.freq) {
                        // Enforce Monophony: Cut off previous soloist notes ONLY if it's a new time
                        if (soloistTimeInPulses > (sb.lastNoteStartTimePulses || 0)) {
                            for (let i = soloistNotesOff.length - 1; i >= 0; i--) {
                                if (soloistNotesOff[i].time > soloistTimeInPulses) {
                                    const pending = soloistNotesOff[i];
                                    const offDelta = Math.max(0, soloistTimeInPulses - soloistTrack.currentTime);
                                    pending.notes.forEach(n => soloistTrack.noteOff(offDelta, 2, n));
                                    soloistTrack.currentTime = soloistTimeInPulses;
                                    soloistNotesOff.splice(i, 1);
                                }
                            }
                        }
                        sb.lastNoteStartTimePulses = soloistTimeInPulses;

                        lastSoloFreq = soloResult.freq;
                        const midi = soloResult.midi || getMidi(soloResult.freq);
                        const notesToPlay = [midi];
                        if (soloResult.extraMidi) notesToPlay.push(soloResult.extraMidi);
                        if (soloResult.extraMidi2) notesToPlay.push(soloResult.extraMidi2);

                        const delta = Math.max(0, soloistTimeInPulses - soloistTrack.currentTime);
                        const velFactor = soloResult.velocity || 1.0;
                        const baseVel = 100 * velFactor;
                        const primaryVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 12 - 6))));
                        const extraVel = Math.min(127, Math.round(70 * velFactor));
                        const extraVel2 = Math.min(127, Math.round(50 * velFactor));
                        
                        if (soloResult.bendStartInterval) {
                            const bendValue = Math.round(-(soloResult.bendStartInterval / 2) * 8192);
                            soloistTrack.pitchBend(delta, 2, bendValue);
                            notesToPlay.forEach((n, i) => {
                                let v = primaryVel;
                                if (i === 1) v = extraVel;
                                if (i === 2) v = extraVel2;
                                soloistTrack.noteOn(0, 2, n, v);
                            });
                            const bendReleaseTime = Math.min(Math.round(pulsesPerStep * 0.8), 48); 
                            soloistTrack.pitchBend(bendReleaseTime, 2, 0);
                            soloistTrack.currentTime = soloistTimeInPulses + bendReleaseTime;
                        } else {
                            notesToPlay.forEach((n, i) => {
                                let v = primaryVel;
                                if (i === 1) v = extraVel;
                                if (i === 2) v = extraVel2;
                                soloistTrack.noteOn(i === 0 ? delta : 0, 2, n, v);
                            });
                            soloistTrack.currentTime = soloistTimeInPulses;
                        }
                        const durSteps = soloResult.durationMultiplier;
                        soloistNotesOff.push({ 
                            time: Math.round(getSwungPulse(globalStep + durSteps) - (pulsesPerStep * 0.1)), 
                            notes: notesToPlay 
                        });
                    }
                }

                // Drums
                if (includedTracks.includes('drums')) {
                    gb.instruments.forEach(inst => {
                        const val = inst.steps[drumStep];
                        if (val > 0 && !inst.muted) {
                            const midi = drumMap[inst.name];
                            const baseVel = val === 2 ? 110 : 80;
                            const humanVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 12 - 6))));
                            const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                            drumTrack.noteOn(delta, 9, midi, humanVel);
                            drumTrack.currentTime = currentTimeInPulses;
                            drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                        }
                    });
                }
            }
        }

        // Finalize
        const finalTime = getSwungPulse(totalStepsExport);
        
        // Restore soloist state
        if (sbBackup) Object.assign(sb, sbBackup);

        const finalizeTrack = (track, offList, channel, time) => {
            processOffs(track, offList, channel, 9999999);
            track.endOfTrack(Math.max(0, time - track.currentTime));
        };

        if (includedTracks.includes('chords')) finalizeTrack(chordTrack, chordNotesOff, 0, finalTime);
        if (includedTracks.includes('bass')) finalizeTrack(bassTrack, bassNotesOff, 1, finalTime);
        if (includedTracks.includes('soloist')) finalizeTrack(soloistTrack, soloistNotesOff, 2, finalTime);
        if (includedTracks.includes('drums')) finalizeTrack(drumTrack, drumNotesOff, 9, finalTime);
        metaTrack.endOfTrack(Math.max(0, finalTime - metaTrack.currentTime));

        // Assemble
        const tracks = [metaTrack];
        if (includedTracks.includes('chords')) tracks.push(chordTrack);
        if (includedTracks.includes('bass')) tracks.push(bassTrack);
        if (includedTracks.includes('soloist')) tracks.push(soloistTrack);
        if (includedTracks.includes('drums')) tracks.push(drumTrack);

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
        
        let downloadName = filename;
        if (!downloadName) {
            downloadName = `ensemble-${arranger.key}-${ctx.bpm}bpm`;
        }
        // Ensure extension
        if (!downloadName.toLowerCase().endsWith('.mid')) {
            downloadName += '.mid';
        }
        
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        if (sbBackup) Object.assign(sb, sbBackup);
        console.error("MIDI Export failed:", e);
        showToast("MIDI Export failed. Check console.");
    }
}