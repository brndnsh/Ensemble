import { ctx, gb, cb, bb, sb, arranger } from './state.js';
import { ui, showToast } from './ui.js';
import { getMidi, getStepInfo } from './utils.js';
import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { TIME_SIGNATURES } from './config.js';
import { DRUM_PRESETS } from './presets.js';
import { generateProceduralFill } from './fills.js';
import { analyzeForm, getSectionEnergy } from './form-analysis.js';
import { PIANO_CELLS, compingState as liveCompingState } from './accompaniment.js';

/**
 * Minimal MIDI file generator (Standard MIDI File Format 1)
 */

// --- COMPING STATE ENGINE (Adapted for MIDI Export) ---
const compingState = {
    currentVibe: 'balanced',
    currentCell: new Array(16).fill(0),
    lockedUntil: 0,
    soloistActivity: 0,
    lastChordIndex: -1
};

function updateCompingState(step, soloistBusy, spm = 16) {
    if (step < compingState.lockedUntil) return;

    const intensity = ctx.bandIntensity;
    const complexity = ctx.complexity;
    const genre = gb.genreFeel;

    // 1. Determine Vibe
    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

    // 2. Select Pool
    let pool = PIANO_CELLS[genre] || PIANO_CELLS[compingState.currentVibe];
    
    if (PIANO_CELLS[genre]) {
        if (compingState.currentVibe === 'sparse' && Math.random() < 0.5) {
            pool = PIANO_CELLS.sparse;
        } else if (compingState.currentVibe === 'active' && Math.random() < 0.3) {
            pool = PIANO_CELLS.active;
        } else if (Math.random() < 0.2) {
            pool = PIANO_CELLS.balanced;
        }
    }

    const rawCell = pool[Math.floor(Math.random() * pool.length)];
    compingState.currentCell = new Array(spm).fill(0).map((_, i) => rawCell[i % rawCell.length]);

    compingState.lockedUntil = step + spm;
}

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

    controlChange(deltaTime, channel, controller, value) {
        this.addEvent(deltaTime, [0xB0 | channel, controller, value]);
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
    handleSustain: (track, step, measureStep, chordIndex, channel, timeInPulses) => {
        const isNewChord = chordIndex !== compingState.lastChordIndex;
        const isNewMeasure = measureStep === 0;
        const genre = gb.genreFeel;

        if (genre === 'Reggae' || genre === 'Funk') {
            if (compingState.sustainActive) {
                track.controlChange(0, channel, 64, 0);
                compingState.sustainActive = false;
            }
            return;
        }

        if (isNewMeasure || isNewChord) {
            const delta = Math.max(0, timeInPulses - track.currentTime);
            track.controlChange(delta, channel, 64, 0);
            track.controlChange(0, channel, 64, 127);
            track.currentTime = timeInPulses;
            compingState.lastChordIndex = chordIndex;
            compingState.sustainActive = true;
            return;
        }

        const cellStep = measureStep % 16;
        if (cellStep % 4 === 0 && Math.random() < (ctx.bandIntensity * 0.4)) {
            const delta = Math.max(0, timeInPulses - track.currentTime);
            track.controlChange(delta, channel, 64, 0);
            track.controlChange(0, channel, 64, 127);
            track.currentTime = timeInPulses;
            compingState.sustainActive = true;
        }

        if (genre === 'Jazz' && cellStep % 4 !== 0 && compingState.sustainActive) {
            const releaseTime = timeInPulses + Math.round(PPQ * 0.1); 
            // We can't easily schedule future CC in this loop without a queue, 
            // but for MIDI export we can just do it at the next step or here.
            // Let's just do it here for simplicity.
            const delta = Math.max(0, timeInPulses - track.currentTime);
            track.controlChange(delta, channel, 64, 0);
            track.currentTime = timeInPulses;
            compingState.sustainActive = false;
        }
    },
    smart: (chord, stepInChord, measureStep, globalStep) => {
        const soloistBusy = sb.enabled && sb.busySteps > 0;
        const genre = gb.genreFeel;
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const spm = ts.beats * ts.stepsPerBeat;
        const stepInfo = getStepInfo(globalStep, ts);
        
        updateCompingState(globalStep, soloistBusy, spm);

        let isHit = compingState.currentCell[measureStep % spm] === 1;

        if (measureStep === 0 && !isHit && Math.random() < 0.8) isHit = true;
        if (stepInfo.isGroupStart && !isHit && Math.random() < (0.4 + ctx.bandIntensity * 0.4)) isHit = true;

        if (isHit) {
            let duration = 8.0; // Default long
            if (genre === 'Reggae' || genre === 'Funk') duration = 0.4;
            else if (genre === 'Jazz') duration = 1.0;
            else if (genre === 'Rock' || genre === 'Bossa') duration = 1.8;

            const isDownbeat = stepInfo.isBeatStart;
            const isStructural = stepInfo.isGroupStart;
            const velocity = (isStructural ? 0.75 : (isDownbeat ? 0.7 : 0.45)) * (0.8 + ctx.bandIntensity * 0.4);

            let voicing = [...chord.freqs];
            if (!isStructural && voicing.length > 3 && Math.random() < 0.5) {
                voicing = voicing.slice(0, 3);
            }

            if (bb.enabled && voicing.length > 3) {
                voicing.shift();
                if ((chord.is7th || chord.quality.includes('9')) && voicing.length > 3) {
                    const rootPC = chord.rootMidi % 12;
                    const fifthPC = (rootPC + 7) % 12;
                    voicing = voicing.filter(f => (getMidi(f) % 12) !== fifthPC);
                }
            }

            return [{ midi: voicing.map(getMidi), dur: duration, vel: velocity }];
        }
        return [];
    },
    pad: (chord, stepInChord) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        return stepInChord === 0 ? [{ midi: chord.freqs.map(getMidi), dur: chord.beats * ts.stepsPerBeat }] : [];
    },
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
        // Reset Comping State
        Object.assign(compingState, {
            currentVibe: 'balanced',
            currentCell: new Array(16).fill(0),
            lockedUntil: 0,
            soloistActivity: 0,
            lastChordIndex: -1,
            sustainActive: false
        });

        const { includedTracks = ['chords', 'bass', 'soloist', 'drums'], loopMode = 'time', targetDuration = 3, filename } = options;

        if (arranger.progression.length === 0) {
            showToast("No progression to export");
            return;
        }

        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const totalStepsOneLoop = arranger.progression.reduce((sum, c) => sum + Math.round(c.beats * ts.stepsPerBeat), 0);
        const loopSeconds = (totalStepsOneLoop / ts.stepsPerBeat) * (60 / ctx.bpm);
        
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

        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const drumLoopSteps = gb.measures * stepsPerMeasure;
        let soloistTimeInPulses = 0;

        // --- LOCAL EXPORT STATE FOR SMART GROOVES ---
        const localCtx = {
            bandIntensity: ctx.bandIntensity,
            conductorVelocity: ctx.conductorVelocity || (0.8 + ctx.bandIntensity * 0.3),
            autoIntensity: ctx.autoIntensity
        };
        const localGB = {
            fillActive: false,
            fillSteps: {},
            fillStartStep: -1,
            fillLength: 0,
            pendingCrash: false,
            genreFeel: gb.genreFeel
        };
        const localConductor = {
            target: ctx.bandIntensity,
            stepSize: 0,
            loopCount: 0,
            form: analyzeForm()
        };

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
        const drumMap = { 'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46, 'Crash': 49 };
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

                const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
                const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
                const measureStep = globalStep % stepsPerMeasure;

                // --- 1. CONDUCTOR LOGIC ---
                
                // Transition Checking
                if (measureStep === 0) {
                    // A. 12-Bar Blues Fills
                    const is12BarBlues = ['Jazz Blues', '12-Bar Blues', 'Minor Blues', 'Blues (12 Bar)'].includes(arranger.lastChordPreset);
                    if (is12BarBlues) {
                        const currentBar = Math.floor(globalStep / stepsPerMeasure);
                        const barInCycle = currentBar % 12; 
                        if (barInCycle === 3 || barInCycle === 11) {
                            const fillStyle = (arranger.lastChordPreset === 'Jazz Blues') ? 'Jazz' : localGB.genreFeel;
                            localGB.fillSteps = generateProceduralFill(fillStyle, localCtx.bandIntensity, stepsPerMeasure);
                            localGB.fillActive = true;
                            localGB.fillStartStep = globalStep;
                            localGB.fillLength = stepsPerMeasure;
                            localGB.pendingCrash = true;
                        }
                    }

                    // B. Section Transitions
                    const total = totalStepsOneLoop;
                    const modStep = globalStep % total;
                    const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
                    if (entry) {
                        const sectionEnd = entry.end;
                        const fillStart = sectionEnd - stepsPerMeasure;
                        
                        if (modStep === fillStart) {
                            const currentIndex = arranger.stepMap.indexOf(entry);
                            let nextIndex = currentIndex + 1;
                            let isLoopTurnaround = false;
                            if (nextIndex >= arranger.stepMap.length) {
                                nextIndex = 0;
                                isLoopTurnaround = true;
                            }
                            const nextEntry = arranger.stepMap[nextIndex];

                            if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopTurnaround) {
                                let shouldFill = true;
                                if (isLoopTurnaround) {
                                    localConductor.loopCount++;
                                    if (arranger.totalSteps <= 64) {
                                        const freq = localCtx.bandIntensity > 0.75 ? 1 : (localCtx.bandIntensity > 0.4 ? 2 : 4);
                                        shouldFill = (localConductor.loopCount % freq === 0);
                                    }
                                }

                                if (shouldFill) {
                                    let targetEnergy = 0.5;
                                    const nextSectionId = nextEntry.chord.sectionId;
                                    const nextSection = localConductor.form && localConductor.form.sections.find(s => s.id === nextSectionId);

                                    if (nextSection && nextSection.role) {
                                        const role = nextSection.role;
                                        switch (role) {
                                            case 'Exposition': targetEnergy = 0.45; break;
                                            case 'Development': targetEnergy = Math.min(0.7, localCtx.bandIntensity + 0.15); break;
                                            case 'Contrast': targetEnergy = (localCtx.bandIntensity > 0.6) ? 0.4 : 0.8; break;
                                            case 'Build': targetEnergy = 0.75; break;
                                            case 'Climax': targetEnergy = 0.95; break;
                                            case 'Recapitulation': targetEnergy = 0.6; break;
                                            case 'Resolution': targetEnergy = 0.3; break;
                                            default: targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                                        }
                                    } else {
                                        targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                                    }

                                    if (isLoopTurnaround && localCtx.autoIntensity) {
                                        targetEnergy = Math.max(0.3, Math.min(0.9, targetEnergy + (Math.random() * 0.2 - 0.1)));
                                    }

                                    localGB.fillSteps = generateProceduralFill(localGB.genreFeel, localCtx.bandIntensity, stepsPerMeasure);
                                    localGB.fillActive = true;
                                    localGB.fillStartStep = globalStep;
                                    localGB.fillLength = stepsPerMeasure;
                                    localGB.pendingCrash = true;

                                    if (localCtx.autoIntensity) {
                                        localConductor.target = targetEnergy;
                                        localConductor.stepSize = (localConductor.target - localCtx.bandIntensity) / stepsPerMeasure;
                                    }
                                }
                            }
                        }
                    }
                }

                // Intensity Ramping
                if (localConductor.stepSize !== 0) {
                    localCtx.bandIntensity = Math.max(0, Math.min(1, localCtx.bandIntensity + localConductor.stepSize));
                    if (localConductor.stepSize > 0 && localCtx.bandIntensity >= localConductor.target) localConductor.stepSize = 0;
                    if (localConductor.stepSize < 0 && localCtx.bandIntensity <= localConductor.target) localConductor.stepSize = 0;
                    localCtx.conductorVelocity = 0.8 + (localCtx.bandIntensity * 0.3);
                }

                const currentTimeInPulses = getSwungPulse(globalStep);
                const straightTimeInPulses = Math.round(globalStep * pulsesPerStep);
                const straightness = 0.65;
                soloistTimeInPulses = Math.round((straightTimeInPulses * straightness) + (currentTimeInPulses * (1.0 - straightness)));

                const drumStep = globalStep % drumLoopSteps;

                // Find current chord using the pre-calculated map
                let activeChord = null, stepInChord = 0, activeChordIndex = 0;
                const totalOneLoop = arranger.totalSteps;
                if (totalOneLoop > 0) {
                    const modStep = globalStep % totalOneLoop;
                    const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
                    if (entry) {
                        activeChord = entry.chord;
                        stepInChord = modStep - entry.start;
                        activeChordIndex = arranger.stepMap.indexOf(entry);
                    }
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
                    midiChordPatterns.handleSustain(chordTrack, globalStep, measureStep, activeChordIndex, 0, currentTimeInPulses);
                    
                    const patternFunc = midiChordPatterns[cb.style] || midiChordPatterns.pad;
                    const events = patternFunc(activeChord, stepInChord, measureStep, globalStep);
                    events.forEach(ev => {
                        const delta = Math.max(0, currentTimeInPulses - chordTrack.currentTime);
                        
                        let baseVel = 80;
                        if (ev.vel !== undefined) baseVel = Math.floor(ev.vel * 127);
                        
                        baseVel *= localCtx.conductorVelocity;

                        const humanVel = Math.min(127, Math.max(10, Math.floor(baseVel + (Math.random() * 10 - 5))));
                        
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
                            const cSteps = Math.round(c.beats * ts.stepsPerBeat);
                            if (step + 4 >= nextCurrent && step + 4 < nextCurrent + cSteps) { nextChord = c; break; }
                            nextCurrent += cSteps;
                        }
                        const bassResult = getBassNote(activeChord, nextChord, stepInChord / ts.stepsPerBeat, lastBassFreq, bb.octave, bb.style, activeChordIndex, step, stepInChord, arranger.isMinor);
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
                            const baseVel = 90 * (bassResult.velocity || 1.0) * localCtx.conductorVelocity;
                            const humanVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 10 - 5))));
                            bassTrack.noteOn(delta, 1, midi, humanVel);
                            bassTrack.currentTime = currentTimeInPulses;
                            
                            let durSteps;
                            if (bassResult.durationMultiplier) {
                                durSteps = bassResult.durationMultiplier;
                            } else {
                                durSteps = (bb.style === 'whole' ? activeChord.beats : (bb.style === 'half' ? 2 : 1)) * ts.stepsPerBeat;
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
                        const cSteps = Math.round(c.beats * ts.stepsPerBeat);
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
                        const velFactor = (soloResult.velocity || 1.0) * localCtx.conductorVelocity;
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
                    const isDownbeat = (drumStep % stepsPerMeasure === 0);
                    const isQuarter = (measureStep % ts.stepsPerBeat === 0);
                    const isBackbeat = (ts.beats === 4) ? (measureStep === ts.stepsPerBeat || measureStep === ts.stepsPerBeat * 3) : false;
                    
                    // Check Fill Expiration & Crash
                    if (localGB.fillActive) {
                        const fillStep = globalStep - localGB.fillStartStep;
                        if (fillStep >= localGB.fillLength) {
                            localGB.fillActive = false;
                            if (localGB.pendingCrash) {
                                const midi = drumMap['Crash'];
                                const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                                drumTrack.noteOn(delta, 9, midi, Math.min(127, Math.round(110 * localCtx.conductorVelocity)));
                                drumTrack.currentTime = currentTimeInPulses;
                                drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                                localGB.pendingCrash = false;
                            }
                        }
                    }

                    let drumHandled = false;

                    // Play Fill (Overlay Mode)
                    if (localGB.fillActive) {
                        const fillStep = globalStep - localGB.fillStartStep;
                        if (fillStep >= 0 && fillStep < localGB.fillLength) {
                            const isLateEntry = localCtx.bandIntensity < 0.5;
                            const isFirstHalf = fillStep < (localGB.fillLength / 2);

                            if (!isLateEntry || !isFirstHalf) {
                                const notes = localGB.fillSteps[fillStep];
                                if (notes && notes.length > 0) {
                                    notes.forEach(note => {
                                        const midi = drumMap[note.name];
                                        if (midi) {
                                            const baseVel = Math.round(note.vel * 100 * localCtx.conductorVelocity);
                                            const humanVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 10 - 5))));
                                            const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                                            drumTrack.noteOn(delta, 9, midi, humanVel);
                                            drumTrack.currentTime = currentTimeInPulses;
                                            drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                                        }
                                    });
                                    drumHandled = true; 
                                }
                            }
                        }
                    }

                    if (!drumHandled) {
                        gb.instruments.forEach(inst => {
                            const val = inst.steps[drumStep];
                            if (val > 0 && !inst.muted) {
                                let velocity = val === 2 ? 1.25 : 0.9;
                                let soundName = inst.name;

                                // Genre Nuances
                                if (localGB.genreFeel === 'Rock') {
                                    if (inst.name === 'Kick' && isDownbeat) velocity *= 1.2;
                                    if (inst.name === 'Snare' && isBackbeat) velocity *= 1.2;
                                } else if (localGB.genreFeel === 'Funk') {
                                    if (val === 2) velocity *= 1.1;
                                }

                                // Ride Mode
                                if (inst.name === 'HiHat' && localGB.genreFeel !== 'Jazz' && localCtx.bandIntensity > 0.8 && isQuarter) {
                                    soundName = 'Open';
                                    velocity *= 1.1;
                                }

                                // Standard dynamics
                                if (inst.name === 'Kick') {
                                    velocity *= isDownbeat ? 1.15 : (isQuarter ? 1.05 : 0.9);
                                } else if (inst.name === 'Snare') {
                                    velocity *= isBackbeat ? 1.1 : 0.9;
                                } else if (inst.name === 'HiHat' || inst.name === 'Open') {
                                    velocity *= isQuarter ? 1.1 : 0.85;
                                    
                                    if (localGB.genreFeel === 'Jazz') {
                                        velocity *= (1.0 - (localCtx.bandIntensity * 0.2));
                                    }

                                    if (ctx.bpm > 165) {
                                        velocity *= 0.7;
                                        if (!isQuarter) velocity *= 0.6;
                                    }
                                }

                                const midi = drumMap[soundName];
                                if (midi) {
                                    const baseVel = velocity * 80 * localCtx.conductorVelocity;
                                    const humanVel = Math.min(127, Math.max(40, Math.round(baseVel + (Math.random() * 12 - 6))));
                                    const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                                    drumTrack.noteOn(delta, 9, midi, humanVel);
                                    drumTrack.currentTime = currentTimeInPulses;
                                    drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                                }
                            }
                            // Ghost Note Logic
                            else if (val === 0 && !inst.muted && inst.name === 'Snare') {
                                if ((localGB.genreFeel === 'Funk' || localGB.genreFeel === 'Jazz') && ctx.complexity > 0.4) {
                                    if (Math.random() < (ctx.complexity * 0.35)) {
                                        const midi = drumMap['Snare'];
                                        const delta = Math.max(0, currentTimeInPulses - drumTrack.currentTime);
                                        drumTrack.noteOn(delta, 9, midi, Math.round(15 * localCtx.conductorVelocity));
                                        drumTrack.currentTime = currentTimeInPulses;
                                        drumNotesOff.push({ time: currentTimeInPulses + Math.round(pulsesPerStep * 0.5), notes: [midi] });
                                    }
                                }
                            }
                        });
                    }
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