import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { getHarmonyNotes } from './harmonies.js';
import { getAccompanimentNotes, compingState } from './accompaniment.js';
import { generateResolutionNotes } from './resolution.js';
import { arranger, cb, bb, sb, gb, hb, ctx } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getMidi, getStepInfo } from './utils.js';
import { generateProceduralFill } from './fills.js';
import { analyzeForm } from './form-analysis.js';

// --- WORKER STATE ---
let timerID = null;
let interval = 25;
let bbBufferHead = 0;
let sbBufferHead = 0;
let cbBufferHead = 0;
let hbBufferHead = 0;
const LOOKAHEAD = 64;

// --- EXPORT HELPERS ---

const PPQ = 480; 

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
    }

    addEvent(time, data) {
        this.events.push({ time: Math.round(time), data });
    }

    noteOn(time, ch, note, vel) { this.addEvent(time, [0x90 | ch, note, vel]); }
    noteOff(time, ch, note) { this.addEvent(time, [0x80 | ch, note, 0]); }
    programChange(time, ch, program) { this.addEvent(time, [0xC0 | ch, program]); }
    cc(time, ch, cc, val) { this.addEvent(time, [0xB0 | ch, cc, val]); }
    pitchBend(time, ch, val) {
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xE0 | ch, normalized & 0x7F, (normalized >> 7) & 0x7F]);
    }
    setName(time, name) {
        const bytes = writeString(name);
        this.addEvent(time, [0xFF, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }
    setTempo(time, bpm) {
        const mspb = Math.round(60000000 / bpm);
        this.addEvent(time, [0xFF, 0x51, 0x03, (mspb >> 16) & 0xFF, (mspb >> 8) & 0xFF, mspb & 0xFF]);
    }
    setTimeSig(time, n, d) {
        let dp = 2; if (d === 8) dp = 3;
        this.addEvent(time, [0xFF, 0x58, 0x04, n, dp, 24, 8]);
    }
    setKeySig(time, root, isMinor) {
        const keyMap = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1 };
        const rootLookup = (root === 'F#' ? 'Gb' : (root === 'C#' ? 'Db' : root));
        let sf = keyMap[rootLookup] || 0;
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const relMajor = KEY_ORDER[(KEY_ORDER.indexOf(rootLookup) + 3) % 12];
            sf = keyMap[relMajor] || 0;
        }
        this.addEvent(time, [0xFF, 0x59, 0x02, sf < 0 ? 256 + sf : sf, isMinor ? 0x01 : 0x00]);
    }
    endOfTrack(time) { this.addEvent(time, [0xFF, 0x2F, 0x00]); }

    compile() {
        this.events.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            const typeA = a.data[0] & 0xF0;
            const typeB = b.data[0] & 0xF0;
            if (typeA === 0x80 && typeB === 0x90) return -1; 
            if (typeA === 0x90 && typeB === 0x80) return 1;
            return 0;
        });
        const binary = [];
        let lastTime = 0;
        for (const ev of this.events) {
            const dt = Math.max(0, ev.time - lastTime);
            binary.push(...writeVarInt(dt), ...ev.data);
            lastTime = ev.time;
        }
        const len = writeInt32(binary.length);
        return new Uint8Array([...writeString('MTrk'), ...len, ...binary]);
    }
}

// --- LOGIC ---

function getChordAtStep(step) {
    if (arranger.totalSteps === 0) return null;
    const targetStep = step % arranger.totalSteps;
    
    let sectionData = null;
    if (arranger.sectionMap) {
        for (let i = 0; i < arranger.sectionMap.length; i++) {
            const s = arranger.sectionMap[i];
            if (targetStep >= s.start && targetStep < s.end) {
                sectionData = s;
                break;
            }
        }
    }

    for (let i = 0; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            return { 
                chord: entry.chord, 
                stepInChord: targetStep - entry.start, 
                chordIndex: i,
                sectionStart: sectionData?.start || 0,
                sectionEnd: sectionData?.end || arranger.totalSteps
            };
        }
    }
    return null;
}

function fillBuffers(currentStep, timestamp = null) {
    const targetStep = currentStep + LOOKAHEAD;
    const notesToMain = [];
    if (bbBufferHead < currentStep) bbBufferHead = currentStep;
    if (sbBufferHead < currentStep) sbBufferHead = currentStep;
    if (cbBufferHead < currentStep) cbBufferHead = currentStep;
    if (hbBufferHead < currentStep) hbBufferHead = currentStep;
    
    let head = 999999;
    if (bb.enabled) head = Math.min(head, bbBufferHead);
    if (sb.enabled) head = Math.min(head, sbBufferHead);
    if (cb.enabled) head = Math.min(head, cbBufferHead);
    if (hb.enabled) head = Math.min(head, hbBufferHead);
    if (head === 999999) head = currentStep;

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    
    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step);
        
        // --- Bass ---
        if (bb.enabled && step >= bbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4);
                if (isBassActive(bb.style, step, stepInChord)) {
                    const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / ts.stepsPerBeat, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, step, stepInChord);
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.midi) bassResult.midi = getMidi(bassResult.freq);
                        if (!bassResult.freq) bassResult.freq = 440 * Math.pow(2, (bassResult.midi - 69) / 12);
                        bb.lastFreq = bassResult.freq;
                        notesToMain.push({ ...bassResult, step, module: 'bb' });
                    }
                }
            }
            bbBufferHead++;
        }

        // --- Soloist ---
        let soloResult = null;
        if (sb.enabled && step >= sbBufferHead) {
            if (chordData) {
                const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
                const nextChordData = getChordAtStep(step + 4);
                soloResult = getSoloistNote(chord, nextChordData?.chord, step, sb.lastFreq, sb.octave, sb.style, stepInChord, false, { sectionStart, sectionEnd });
                
                if (soloResult) {
                    const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                    results.forEach(res => {
                        if (res.freq || res.midi) {
                            if (!res.midi) res.midi = getMidi(res.freq);
                            if (!res.freq) res.freq = 440 * Math.pow(2, (res.midi - 69) / 12);
                            // We only update lastFreq for the primary note (usually the first one)
                            if (!res.isDoubleStop) sb.lastFreq = res.freq;
                            notesToMain.push({ ...res, step, module: 'sb' });
                        }
                    });
                }
            }
            sbBufferHead++;
        }

        // --- Chords ---
        if (cb.enabled && step >= cbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const stepInfo = getStepInfo(step, ts);
                const chordNotes = getAccompanimentNotes(chord, step, stepInChord, step % (ts.beats * ts.stepsPerBeat), stepInfo);
                if (chordNotes.length > 0) {
                    chordNotes.forEach(n => {
                        const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
                        notesToMain.push({ ...n, freq, step, module: 'cb' });
                    });
                }
            }
            cbBufferHead++;
        }

        // --- Harmonies ---
        if (hb.enabled && step >= hbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4);
                const harmonyNotes = getHarmonyNotes(chord, nextChordData?.chord, step, hb.octave, hb.style, stepInChord, soloResult);
                if (harmonyNotes.length > 0) {
                    harmonyNotes.forEach(n => {
                        if (!n.freq) n.freq = 440 * Math.pow(2, (n.midi - 69) / 12);
                        // Explicitly ensure all articulation props are passed
                        notesToMain.push({ 
                            ...n, 
                            midi: n.midi, 
                            step, 
                            module: 'hb',
                            slideInterval: n.slideInterval,
                            slideDuration: n.slideDuration,
                            vibrato: n.vibrato
                        });
                    });
                }
            }
            hbBufferHead++;
        }
        
        head++;
    }
    if (notesToMain.length > 0) postMessage({ type: 'notes', notes: notesToMain, timestamp });
}

export function handleExport(options) {
    try {
        const { includedTracks = ['chords', 'bass', 'soloist', 'harmonies', 'drums'], targetDuration = 3, loopMode = 'time', filename } = options;
        if (arranger.progression.length === 0) { postMessage({ type: 'error', data: "No progression to export" }); return; }

        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const totalStepsOneLoop = arranger.totalSteps;
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const loopSeconds = (totalStepsOneLoop / ts.stepsPerBeat) * (60 / ctx.bpm);
        let loopCount = (loopMode === 'once') ? 1 : Math.max(1, Math.min(100, Math.ceil((targetDuration * 60) / loopSeconds)));
        const totalStepsWithoutEnding = totalStepsOneLoop * loopCount;
        const totalStepsExport = totalStepsWithoutEnding + 16; // Add one resolution measure

        // --- 1:1 TIMING MAP GENERATION ---
        const stepTimes = new Array(totalStepsExport + 128);
        const secondsPerBeat = 60.0 / ctx.bpm;
        const sixteenthSec = 0.25 * secondsPerBeat;
        
        let accumulatedSeconds = 0;
        for (let i = 0; i < stepTimes.length; i++) {
            stepTimes[i] = accumulatedSeconds;
            
            let duration = sixteenthSec;
            if (gb.swing > 0 && ts.stepsPerBeat === 4) {
                const shift = (sixteenthSec / 3) * (gb.swing / 100);
                if (gb.swingSub === '16th') {
                    duration += (i % 2 === 0) ? shift : -shift;
                } else {
                    duration += ((i % 4) < 2) ? shift : -shift;
                }
            }
            accumulatedSeconds += duration;
        }

        // Helper to convert any absolute second timestamp to MIDI Pulses
        const toPulses = (t) => Math.round(t * (ctx.bpm / 60.0) * PPQ);

        const metaTrack = new MidiTrack();
        const chordTrack = new MidiTrack();
        const bassTrack = new MidiTrack();
        const soloistTrack = new MidiTrack();
        const harmonyTrack = new MidiTrack();
        const drumTrack = new MidiTrack();

        metaTrack.setName(0, 'Ensemble Export');
        metaTrack.setTempo(0, ctx.bpm);
        metaTrack.setKeySig(0, arranger.key, arranger.isMinor);
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        metaTrack.setTimeSig(0, tsNum, tsDenom);

        chordTrack.setName(0, 'Chords'); chordTrack.programChange(0, 0, 4);
        bassTrack.setName(0, 'Bass'); bassTrack.programChange(0, 1, 34);
        soloistTrack.setName(0, 'Soloist'); soloistTrack.programChange(0, 2, 80);
        harmonyTrack.setName(0, 'Harmonies'); harmonyTrack.programChange(0, 3, 61); // Brass/Synth
        drumTrack.setName(0, 'Drums');

        const prevStates = { cb: cb.enabled, bb: bb.enabled, sb: sb.enabled, hb: hb.enabled, gb: gb.enabled, intensity: ctx.bandIntensity, doubleStops: sb.doubleStops, sessionSteps: sb.sessionSteps };
        cb.enabled = true; bb.enabled = true; sb.enabled = true; hb.enabled = true; gb.enabled = true;
        sb.sessionSteps = 1000; // Bypass warm-up for export
        compingState.lockedUntil = 0; compingState.lastChordIndex = -1;
        sb.busySteps = 0; sb.isResting = false; sb.currentPhraseSteps = 0;

        // --- EXPORT CONDUCTOR ---
        const exportConductor = {
            loopCount: 0,
            formIteration: 0,
            targetIntensity: ctx.bandIntensity,
            stepSize: 0,
            form: analyzeForm()
        };

        const checkWorkerTransition = (step) => {
            if (!gb.enabled) return;
            const modStep = step % totalStepsOneLoop;
            
            if (modStep === 0 && step > 0) {
                exportConductor.loopCount++;
                exportConductor.formIteration++;
            }

            const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
            if (!entry) return;
            
            const sectionEnd = entry.end;
            const fillStart = sectionEnd - stepsPerMeasure;
            
            if (modStep === fillStart) {
                const currentIndex = arranger.stepMap.indexOf(entry);
                let nextEntry = arranger.stepMap[currentIndex + 1];
                let isLoopEnd = false;
                if (!nextEntry) { nextEntry = arranger.stepMap[0]; isLoopEnd = true; }
                
                if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopEnd) {
                    let shouldFill = true;
                    if (isLoopEnd && totalStepsOneLoop <= 64) {
                        const freq = ctx.bandIntensity > 0.75 ? 1 : (ctx.bandIntensity > 0.4 ? 2 : 4);
                        shouldFill = (exportConductor.loopCount % freq === 0);
                    }
                    if (shouldFill) {
                        gb.fillSteps = generateProceduralFill(gb.genreFeel, ctx.bandIntensity, stepsPerMeasure);
                        gb.fillActive = true;
                        gb.fillStartStep = step;
                        gb.fillLength = stepsPerMeasure;
                        gb.pendingCrash = true;
                    }
                }
            }
            
            if (ctx.autoIntensity && modStep === 0 && exportConductor.formIteration > 0) {
                const grandCycle = exportConductor.formIteration % 8;
                let target = 0.5;
                if (grandCycle < 3) target = 0.6;
                else if (grandCycle < 5) target = 0.9; 
                else target = 0.4; 
                ctx.bandIntensity = ctx.bandIntensity + (target - ctx.bandIntensity) * 0.5;
            }

            // --- Intelligent Harmony Export Scaling ---
            // Mirror the conductor's logic: scale complexity with intensity
            hb.complexity = Math.max(0, (ctx.bandIntensity - 0.2) * 1.25);
            
            // "Final Build" for MIDI: If we are in the last loop of the export, push for a climax
            const isLastLoop = (exportConductor.loopCount >= loopCount - 1);
            if (isLastLoop && loopCount > 1) {
                hb.complexity = Math.max(hb.complexity, 0.85);
            }
        };

        for (let globalStep = 0; globalStep < totalStepsWithoutEnding; globalStep++) {
            checkWorkerTransition(globalStep);

            const stepTimeS = stepTimes[globalStep];

            const measureStep = globalStep % stepsPerMeasure;
            const stepInfo = getStepInfo(globalStep, ts);
            const chordData = getChordAtStep(globalStep);

            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(globalStep + 4);

                if (includedTracks.includes('chords')) {
                    const notes = getAccompanimentNotes(chord, globalStep, stepInChord, measureStep, stepInfo);
                    const numVoices = notes.filter(n => n.midi > 0).length;
                    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

                    notes.forEach(n => {
                        const noteTimeS = stepTimeS + (n.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        
                        if (n.midi > 0) {
                            n.ccEvents.forEach(cc => chordTrack.cc(notePulse, 0, cc.controller, cc.value));
                            
                            // Safe MIDI Velocity for Chords with power compensation
                            let finalVel = n.velocity * polyphonyComp;
                            if (n.muted) finalVel *= 0.3; // Scale ghost "chucks"
                            const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));
                            
                            chordTrack.noteOn(notePulse, 0, n.midi, midiVel);
                            
                            let endTimeS;
                            if (n.durationSteps < 1) {
                                endTimeS = noteTimeS + (n.durationSteps * sixteenthSec);
                            } else {
                                const targetStepIdx = globalStep + Math.round(n.durationSteps);
                                endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (n.durationSteps * sixteenthSec));
                            }
                            if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;
                            
                            chordTrack.noteOff(toPulses(endTimeS), 0, n.midi);
                        } else if (n.ccEvents.length > 0) {
                            n.ccEvents.forEach(cc => chordTrack.cc(notePulse, 0, cc.controller, cc.value));
                        }
                    });
                }

                if (includedTracks.includes('bass') && isBassActive(bb.style, globalStep, stepInChord)) {
                    const res = getBassNote(chord, nextChordData?.chord, stepInChord / ts.stepsPerBeat, bb.lastFreq, bb.octave, bb.style, chordData.chordIndex, globalStep, stepInChord);
                    if (res && res.midi) {
                        const noteTimeS = stepTimeS + (res.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        
                        // Safe MIDI Velocity for Bass
                        let finalVel = res.velocity;
                        if (res.muted) finalVel *= 0.25; 
                        const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));

                        bassTrack.noteOn(notePulse, 1, res.midi, midiVel);
                        
                        let endTimeS;
                        if (res.durationSteps < 1) {
                            endTimeS = noteTimeS + (res.durationSteps * sixteenthSec);
                        } else {
                            const targetStepIdx = globalStep + Math.round(res.durationSteps);
                            endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (res.durationSteps * sixteenthSec));
                        }
                        if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;

                        // Add small release tail (20ms) to bass notes to prevent "choked" sound 
                        endTimeS += 0.02;

                        bassTrack.noteOff(toPulses(endTimeS), 1, res.midi);
                        bb.lastFreq = 440 * Math.pow(2, (res.midi - 69) / 12);
                    }
                }

                if (includedTracks.includes('soloist')) {
                    const { sectionStart, sectionEnd } = chordData;
                    const soloResult = getSoloistNote(chord, nextChordData?.chord, globalStep, sb.lastFreq, sb.octave, sb.style, stepInChord, false, { sectionStart, sectionEnd });
                    if (soloResult) {
                        const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                        const polyphonyComp = 1 / Math.sqrt(Math.max(1, results.length));

                        results.forEach(res => {
                            if (res.midi) {
                                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                                const notePulse = Math.max(0, toPulses(noteTimeS));
                                
                                // Safe MIDI Velocity for Soloist with power compensation
                                const midiVel = Math.max(1, Math.min(127, Math.round(res.velocity * polyphonyComp * 127)));

                                if (res.bendStartInterval) {
                                    soloistTrack.pitchBend(notePulse, 2, Math.round(-(res.bendStartInterval / 2) * 8192));
                                    soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
                                    soloistTrack.pitchBend(toPulses(stepTimeS + sixteenthSec), 2, 0);
                                } else {
                                    soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
                                }
                                
                                let endTimeS;
                                if (res.durationSteps < 1) {
                                    endTimeS = noteTimeS + (res.durationSteps * sixteenthSec);
                                } else {
                                    const targetStepIdx = globalStep + Math.round(res.durationSteps);
                                    endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (res.durationSteps * sixteenthSec));
                                }
                                if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;

                                // Add small release tail (15ms) for soloist
                                endTimeS += 0.015;

                                soloistTrack.noteOff(toPulses(endTimeS), 2, res.midi);
                                if (!res.isDoubleStop) sb.lastFreq = 440 * Math.pow(2, (res.midi - 69) / 12);
                            }
                        });
                    }
                }

                if (includedTracks.includes('harmonies')) {
                    const harmonyNotes = getHarmonyNotes(chord, nextChordData?.chord, globalStep, hb.octave, hb.style, stepInChord);
                    const polyphonyComp = 1 / Math.sqrt(Math.max(1, harmonyNotes.length));

                    harmonyNotes.forEach(n => {
                        const noteTimeS = stepTimeS + (n.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        const midiVel = Math.max(1, Math.min(127, Math.round(n.velocity * polyphonyComp * 127)));

                        harmonyTrack.noteOn(notePulse, 3, n.midi, midiVel);

                        let endTimeS;
                        if (n.durationSteps < 1) {
                            endTimeS = noteTimeS + (n.durationSteps * sixteenthSec);
                        } else {
                            const targetStepIdx = globalStep + Math.round(n.durationSteps);
                            endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (n.durationSteps * sixteenthSec));
                        }
                        harmonyTrack.noteOff(toPulses(endTimeS), 3, n.midi);
                    });
                }
            }

            if (includedTracks.includes('drums')) {
                let pocketOffset = 0;
                if (gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Hip Hop') pocketOffset += 0.015;

                if (ctx.bandIntensity > 0.75) pocketOffset -= 0.008; 
                else if (ctx.bandIntensity < 0.3) pocketOffset += 0.010;

                const drumTimeS = stepTimeS + pocketOffset;
                const drumPulse = Math.max(0, toPulses(drumTimeS));
                
                const nextStepTimeS = stepTimes[globalStep + 1] || (stepTimeS + sixteenthSec);
                const tightDurationS = (nextStepTimeS - stepTimeS) * 0.75; 
                const drumMap = { 
                    'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46, 'Crash': 49,
                    'Clave': 75, 'Conga': 63, 'Bongo': 60, 'Perc': 67, 'Shaker': 82, 'Guiro': 74,
                    'High Tom': 50, 'Mid Tom': 47, 'Low Tom': 43
                };

                let fillPlayed = false;

                if (gb.fillActive) {
                    const fillStep = globalStep - gb.fillStartStep;
                    
                    if (fillStep >= 0 && fillStep < gb.fillLength) {
                        if (ctx.bandIntensity >= 0.5 || fillStep >= (gb.fillLength / 2)) {
                            const fillNotes = gb.fillSteps[fillStep];
                            if (fillNotes && fillNotes.length > 0) {
                                fillNotes.forEach(n => {
                                    const midi = drumMap[n.name];
                                    if (midi) {
                                        const durS = n.name === 'Crash' ? secondsPerBeat : tightDurationS;
                                        // Safe MIDI Velocity for Drums (Fills)
                                        const midiVel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
                                        drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                        drumTrack.noteOff(toPulses(drumTimeS + durS), 9, midi);
                                    }
                                });
                                fillPlayed = true; 
                            }
                        }
                    } else if (fillStep === gb.fillLength) {
                        gb.fillActive = false;
                        if (gb.pendingCrash) {
                            drumTrack.noteOn(drumPulse, 9, drumMap['Crash'], 110);
                            drumTrack.noteOff(toPulses(drumTimeS + secondsPerBeat), 9, drumMap['Crash']);
                            gb.pendingCrash = false;
                        }
                    }
                }

                if (!fillPlayed) {
                    gb.instruments.forEach(inst => {
                        const val = inst.steps[globalStep % (gb.measures * stepsPerMeasure)];
                        if (val > 0 && !inst.muted) {
                            const midi = drumMap[inst.name];
                            if (midi) {
                                const durS = inst.name === 'Crash' ? secondsPerBeat : tightDurationS;
                                // Safe MIDI Velocity for Drums (Grid)
                                const baseVel = val === 2 ? 110 : 90;
                                const midiVel = Math.max(1, Math.min(127, baseVel));
                                drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                drumTrack.noteOff(toPulses(drumTimeS + durS), 9, midi);
                            }
                        }
                    });
                }
            }
        }

        // --- FINAL RESOLUTION MEASURE ---
        const resolutionStep = totalStepsWithoutEnding;
        const resTimeS = stepTimes[resolutionStep];

        const resolutionNotes = generateResolutionNotes(resolutionStep, arranger, { 
            bb: includedTracks.includes('bass'), 
            cb: includedTracks.includes('chords'), 
            sb: includedTracks.includes('soloist'), 
            hb: includedTracks.includes('harmonies'),
            gb: includedTracks.includes('drums') 
        });

        resolutionNotes.forEach(n => {
            let track;
            let channel = 0;
            if (n.module === 'bb') { track = bassTrack; channel = 1; }
            else if (n.module === 'cb') { track = chordTrack; channel = 0; }
            else if (n.module === 'sb') { track = soloistTrack; channel = 2; }
            else if (n.module === 'hb') { track = harmonyTrack; channel = 3; }
            else if (n.module === 'gb') { track = drumTrack; channel = 9; }
            
            if (!track) return;

            const offsetS = n.timingOffset || 0;
            const notePulse = toPulses(resTimeS + offsetS);

            if (n.ccEvents) {
                n.ccEvents.forEach(cc => {
                     track.cc(toPulses(resTimeS + (cc.timingOffset || 0)), channel, cc.controller, cc.value);
                });
            }

            if (n.midi > 0) {
                 if (n.module === 'sb' && n.bendStartInterval) {
                     track.pitchBend(notePulse, channel, Math.round(-(n.bendStartInterval / 2) * 8192));
                 }
                 
                 track.noteOn(notePulse, channel, n.midi, n.midiVelocity || 90);

                 if (n.module === 'sb' && n.bendStartInterval) {
                     track.pitchBend(toPulses(resTimeS + sixteenthSec), channel, 0);
                 }
                 
                 const durationS = (n.durationSteps || 1) * sixteenthSec;
                 track.noteOff(toPulses(resTimeS + offsetS + durationS), channel, n.midi);
            } else if (n.module === 'gb' && n.name) {
                const drumMap = { 
                    'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46, 'Crash': 49,
                    'Clave': 75, 'Conga': 63, 'Bongo': 60, 'Perc': 67, 'Shaker': 82, 'Guiro': 74,
                    'High Tom': 50, 'Mid Tom': 47, 'Low Tom': 43
                };
                const midi = drumMap[n.name];
                if (midi) {
                    track.noteOn(notePulse, channel, midi, n.midiVelocity || 110);
                    const durS = (n.name === 'Crash') ? 3.0 : 0.1;
                    track.noteOff(toPulses(resTimeS + offsetS + durS), channel, midi);
                }
            }
        });

        // Cleanup: Release sustain for chords if they were active
        if (includedTracks.includes('chords')) {
            chordTrack.cc(toPulses(resTimeS + (16.1 * sixteenthSec)), 0, 64, 0);
        }

        const finalPulse = toPulses(stepTimes[totalStepsExport - 1] + sixteenthSec);
        const finalTrackList = [metaTrack];
        const trackRefs = { chords: chordTrack, bass: bassTrack, soloist: soloistTrack, harmonies: harmonyTrack, drums: drumTrack };
        ['chords', 'bass', 'soloist', 'harmonies', 'drums'].forEach(key => {
            if (includedTracks.includes(key)) {
                trackRefs[key].endOfTrack(finalPulse);
                finalTrackList.push(trackRefs[key]);
            }
        });
        metaTrack.endOfTrack(finalPulse);

        cb.enabled = prevStates.cb; bb.enabled = prevStates.bb; sb.enabled = prevStates.sb; hb.enabled = prevStates.hb; gb.enabled = prevStates.gb; ctx.bandIntensity = prevStates.intensity; sb.doubleStops = prevStates.doubleStops; sb.sessionSteps = prevStates.sessionSteps;

        const header = new Uint8Array([...writeString('MThd'), ...writeInt32(6), ...writeInt16(1), ...writeInt16(finalTrackList.length), ...writeInt16(PPQ)]);
        const trackChunks = finalTrackList.map(t => t.compile());
        const totalSize = header.length + trackChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalSize);
        result.set(header, 0);
        let offset = header.length;
        trackChunks.forEach(c => { result.set(c, offset); offset += c.length; });

        let finalFilename = (filename || 'ensemble-export').replace(/\.midi?$/i, '') + '.mid';
        postMessage({ type: 'exportComplete', blob: result, filename: finalFilename });
    } catch (e) { postMessage({ type: 'error', data: e.message, stack: e.stack }); }
}

if (typeof self !== 'undefined') {
    self.onmessage = (e) => {
        try {
            const { type, data } = e.data;
            const timestamp = data?.timestamp || null;
            switch (type) {
                case 'start': if (!timerID) { timerID = setInterval(() => { postMessage({ type: 'tick' }); }, interval); } break;
                case 'stop': if (timerID) { clearInterval(timerID); timerID = null; } break;
                case 'syncState':
                    if (data.arranger) { Object.assign(arranger, data.arranger); arranger.totalSteps = data.arranger.totalSteps; arranger.stepMap = data.arranger.stepMap; arranger.sectionMap = data.arranger.sectionMap; }
                    if (data.cb) {
                        Object.assign(cb, data.cb);
                        if (data.cb.rhythmicMask !== undefined) cb.rhythmicMask = data.cb.rhythmicMask;
                    }
                    if (data.bb) Object.assign(bb, data.bb);
                    if (data.sb) Object.assign(sb, data.sb);
                    if (data.hb) {
                        Object.assign(hb, data.hb);
                        if (data.hb.rhythmicMask !== undefined) hb.rhythmicMask = data.hb.rhythmicMask;
                    }
                    if (data.gb) {
                        Object.assign(gb, data.gb);
                        if (data.gb.instruments) { data.gb.instruments.forEach(di => { const inst = gb.instruments.find(i => i.name === di.name); if (inst) { inst.steps = di.steps; inst.muted = di.muted; } }); }
                        if (data.gb.snareMask !== undefined) gb.snareMask = data.gb.snareMask;
                    }
                    if (data.ctx) Object.assign(ctx, data.ctx);
                    break;
                case 'requestBuffer': 
                    if (ctx.workerLogging) console.log(`[Worker] requestBuffer: step=${data.step}, currentHeads=[bb:${bbBufferHead}, sb:${sbBufferHead}, cb:${cbBufferHead}]`);
                    fillBuffers(data.step, timestamp); 
                    break;
                case 'flush':
                    if (ctx.workerLogging) console.log(`[Worker] flush: step=${data.step}`);
                    // Sync first if data is provided to ensure correct style/genre
                    if (data.syncData) {
                        const syncData = data.syncData;
                        if (syncData.arranger) { Object.assign(arranger, syncData.arranger); arranger.totalSteps = syncData.arranger.totalSteps; arranger.stepMap = syncData.arranger.stepMap; arranger.sectionMap = syncData.arranger.sectionMap; }
                        if (syncData.cb) {
                            Object.assign(cb, syncData.cb);
                            if (syncData.cb.rhythmicMask !== undefined) cb.rhythmicMask = syncData.cb.rhythmicMask;
                        }
                        if (syncData.bb) Object.assign(bb, syncData.bb);
                        if (syncData.sb) Object.assign(sb, syncData.sb);
                        if (syncData.hb) {
                            Object.assign(hb, syncData.hb);
                            if (syncData.hb.rhythmicMask !== undefined) hb.rhythmicMask = syncData.hb.rhythmicMask;
                        }
                        if (syncData.gb) {
                            Object.assign(gb, syncData.gb);
                            if (syncData.gb.instruments) { syncData.gb.instruments.forEach(di => { const inst = gb.instruments.find(i => i.name === di.name); if (inst) { inst.steps = di.steps; inst.muted = di.muted; } }); }
                            if (syncData.gb.snareMask !== undefined) gb.snareMask = syncData.gb.snareMask;
                        }
                        if (syncData.ctx) Object.assign(ctx, syncData.ctx);
                    }
                    
                    bbBufferHead = data.step; sbBufferHead = data.step; cbBufferHead = data.step; hbBufferHead = data.step;
                    sb.isResting = false; sb.busySteps = 0; sb.currentPhraseSteps = 0;
                    sb.sessionSteps = 0;
                    sb.deviceBuffer = [];
                    bb.busySteps = 0;
                    sb.motifBuffer = []; sb.hookBuffer = []; sb.isReplayingMotif = false;
                    hb.motifBuffer = [];
                    hb.lastMidis = [];
                    
                    // Reset accompaniment memory
                    compingState.lastChordIndex = -1;
                    compingState.lockedUntil = 0;
                    compingState.rhythmPattern = [];

                    if (data.primeSteps > 0) {
                        handlePrime(data.primeSteps);
                    }

                    fillBuffers(data.step, timestamp);
                    break;
                case 'prime':
                    handlePrime(data);
                    break;
                case 'resolution':
                    handleResolution(data.step, timestamp);
                    break;
                case 'export': handleExport(data); break;
            }
        } catch (err) { postMessage({ type: 'error', data: err.message, stack: err.stack }); }
    };
}

export function handleResolution(step, timestamp = null) {
    const notesToMain = generateResolutionNotes(step, arranger, { bb: bb.enabled, cb: cb.enabled, sb: sb.enabled, hb: hb.enabled, gb: gb.enabled });
    postMessage({ type: 'notes', notes: notesToMain, timestamp });
}

function handlePrime(steps) {
    if (!sb.enabled || arranger.totalSteps === 0) return;
    
    // Default to 2 full loops of the progression to establish firm musical context
    const stepsToPrime = steps || (arranger.totalSteps * 2);
    
    if (ctx.workerLogging) {
        console.log(`[Worker] Priming engine for ${stepsToPrime} steps...`);
    }

    // Reset soloist state for priming
    sb.isResting = false;
    sb.busySteps = 0;
    bb.busySteps = 0;
    sb.currentPhraseSteps = 0;
    sb.motifBuffer = [];
    sb.hookBuffer = [];
    sb.isReplayingMotif = false;

    const start = performance.now();

    // We simulate running through the progression (wrapping around)
    // ensuring that when we finish, the state is primed for Step 0.
    for (let i = 0; i < stepsToPrime; i++) {
        const s = i; 
        const chordData = getChordAtStep(s);
        
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(s + 4);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];

            // 1. Prime Bass (if enabled) to update bb.lastFreq
            if (bb.enabled) {
                if (isBassActive(bb.style, s, stepInChord)) {
                    const centerMidi = bb.octave;
                    const bassResult = getBassNote(
                        chord, 
                        nextChordData?.chord, 
                        stepInChord / ts.stepsPerBeat, 
                        bb.lastFreq, 
                        centerMidi, 
                        bb.style, 
                        chordData.chordIndex, 
                        s, 
                        stepInChord
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                         if (!bassResult.freq) bassResult.freq = 440 * Math.pow(2, (bassResult.midi - 69) / 12);
                         bb.lastFreq = bassResult.freq;
                    }
                }
            }

            // 2. Prime Soloist
            const { sectionStart, sectionEnd } = chordData;
            // Manually increment sessionSteps for priming logic
            sb.sessionSteps = (sb.sessionSteps || 0) + 1;
            
            const soloResult = getSoloistNote(
                chord, 
                nextChordData?.chord, 
                s, 
                sb.lastFreq, 
                sb.octave, 
                sb.style, 
                stepInChord,
                true,
                { sectionStart, sectionEnd }
            );
            
            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                results.forEach(res => {
                    if (res.freq || res.midi) {
                         if (!res.freq) res.freq = 440 * Math.pow(2, (res.midi - 69) / 12);
                         if (!res.isDoubleStop) sb.lastFreq = res.freq;
                    }
                });
            }
        }
    }
    
    const elapsed = performance.now() - start;
    if (ctx.workerLogging) {
        console.log(`[Worker] Priming complete in ${elapsed.toFixed(2)}ms`);
    }

    // Reset physical and session state for the REAL start at Step 0
    sb.busySteps = 0;
    bb.busySteps = 0;
    sb.sessionSteps = 0;
}
