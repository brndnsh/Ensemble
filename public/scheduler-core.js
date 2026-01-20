import { ACTIONS } from './types.js';
import { ctx, gb, cb, bb, sb, hb, arranger, vizState, dispatch } from './state.js';
import { ui, updateGenreUI, triggerFlash, clearActiveVisuals } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playHarmonyNote, killHarmonyNote, updateSustain, restoreGains, killAllNotes } from './engine.js';
import { TIME_SIGNATURES } from './config.js';
import { getStepsPerMeasure, getStepInfo, getMidi, midiToNote } from './utils.js';
import { requestBuffer, syncWorker, flushWorker, stopWorker, startWorker, requestResolution } from './worker-client.js';
import { updateAutoConductor, checkSectionTransition, updateLarsTempo, conductorState } from './conductor.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { loadDrumPreset, flushBuffers } from './instrument-controller.js';
import { draw } from './animation-loop.js';
import { sendMIDINote, sendMIDIDrum, sendMIDICC, normalizeMidiVelocity, panic, sendMIDITransport } from './midi-controller.js';
import { midi as midiState } from './state.js';

let isScheduling = false;
let sessionStartTime = 0;
let isResolutionTriggered = false;

let iosAudioUnlocked = false;
const silentAudio = (typeof Audio !== 'undefined') ? new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ") : { pause:()=>{}, play:()=>Promise.resolve(), currentTime: 0 };
if (silentAudio.loop !== undefined) silentAudio.loop = true;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { ctx.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore wake lock error */ }
}

function releaseWakeLock() { 
    if (ctx.wakeLock) { 
        ctx.wakeLock.release(); 
        ctx.wakeLock = null; 
    } 
}

export function togglePlay(viz) {
    const activeViz = viz || ctx.viz;
    if (ctx.isPlaying) {
        ctx.isPlaying = false;
        ui.playBtn.textContent = 'START';
        ui.playBtn.classList.remove('playing');
        stopWorker();
        silentAudio.pause();
        silentAudio.currentTime = 0;
        releaseWakeLock();
        ctx.drawQueue = [];
        ctx.lastActiveDrumElements = null;
        cb.lastActiveChordIndex = null;
        clearActiveVisuals(activeViz);
        killAllNotes();
        panic(true); // Full MIDI reset
        sendMIDITransport('stop', ctx.audio.currentTime);
        hb.buffer.clear();
        flushBuffers();
        flushBuffers();
        ui.sequencerGrid.scrollTo({ left: 0, behavior: 'smooth' });
        if (ctx.audio) {
            if (ctx.suspendTimeout) clearTimeout(ctx.suspendTimeout);
            ctx.suspendTimeout = setTimeout(() => {
                if (!ctx.isPlaying && ctx.audio.state === 'running') ctx.audio.suspend();
            }, 3000); 
        }
    } else {
        if (ctx.suspendTimeout) clearTimeout(ctx.suspendTimeout);
        initAudio();
        
        if (ctx.audio && ctx.audio.state === 'suspended') {
            ctx.audio.resume();
        }

        ctx.step = 0;
        isResolutionTriggered = false;
        dispatch(ACTIONS.RESET_SESSION); // Reset warm-up counters
        dispatch(ACTIONS.SET_ENDING_PENDING, false);
        sessionStartTime = performance.now();
        syncWorker(); 
        const primeSteps = (arranger.totalSteps > 0) ? arranger.totalSteps * 2 : 0;
        flushBuffers(primeSteps);
        
        if (!iosAudioUnlocked) {
            silentAudio.play().catch(() => { /* ignore play error */ });
            iosAudioUnlocked = true;
        } else {
            silentAudio.play().catch(() => { /* ignore play error */ });
        }
        ctx.isPlaying = true;
        restoreGains();
        ui.playBtn.textContent = 'STOP';
        ui.playBtn.classList.add('playing');
        const startTime = ctx.audio.currentTime + 0.1;
        ctx.nextNoteTime = startTime;
        ctx.unswungNextNoteTime = startTime;
        ctx.isCountingIn = ui.countIn.checked;
        ctx.countInBeat = 0;
        requestWakeLock();
        if (activeViz) activeViz.setBeatReference(ctx.nextNoteTime);
        if (!ctx.isDrawing) {
            ctx.isDrawing = true;
            requestAnimationFrame(() => draw(activeViz));
        }
        
        // Initial MIDI cleanup
        panic(true);
        sendMIDITransport('start', startTime);

        startWorker();
        scheduler();
    }
}

function triggerResolution(time) {
    // 1. Tell worker to generate resolution
    requestResolution(ctx.step);

    // 2. We'll wait for the notes to come back via the worker-client callback
    // The worker-client already handles incoming 'notes' and puts them in buffers.
    // We just need to wait a few ms and then schedule them.
    setTimeout(() => {
        scheduleResolution(time);
    }, 50);
}

function scheduleResolution(time) {
    // Schedule the final resolution measure (Tonic chord, Kick+Crash, etc.)
    const effectiveBpm = ctx.bpm + (conductorState.larsBpmOffset || 0);
    const spb = 60.0 / effectiveBpm;
    const measureDuration = 8 * spb; // Ring out for 2 bars (approx 5-6s)

    // 1. Manual Drum Resolution
    if (gb.enabled) {
        playDrumSound('Kick', time, 1.0);
        playDrumSound('Crash', time, 0.9);
    }

    // 2. Schedule notes that came from the worker (Bass, Chords, Soloist)
    // The worker-client puts these in bb.buffer, cb.buffer, sb.buffer
    // We manually trigger the scheduling for this specific step
    // Create a dummy chord data for visuals
    
    // We use a simplified version of scheduleGlobalEvent logic
    if (bb.enabled) scheduleBass({ chord: { freqs: [] } }, ctx.step, time);
    if (sb.enabled) scheduleSoloist({ chord: { freqs: [] } }, ctx.step, time, time);
    if (cb.enabled) scheduleChords({ chord: { freqs: [] } }, ctx.step, time);
    if (hb.enabled) scheduleHarmonies({ chord: { freqs: [] } }, ctx.step, time);
    
    // 3. Add a final flash
    if (ui.visualFlash.checked) {
        ctx.drawQueue.push({ type: 'flash', time: time, intensity: 0.4, beat: 1 });
    }

    // 4. Graceful Sustain Release (at 1.5 bars)
    setTimeout(() => {
        if (ctx.isPlaying) updateSustain(false);
    }, 6 * spb * 1000);

    // 5. Stop playback after the full ring-out (2 bars)
    setTimeout(() => {
        if (ctx.isPlaying) togglePlay(); 
    }, measureDuration * 1000);
}

export function scheduler() {
    if (isScheduling) return;
    isScheduling = true;

    try {
        requestBuffer(ctx.step);
        
        // Update genre UI (countdowns)
        if (gb.pendingGenreFeel) {
            const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
            const stepsRemaining = stepsPerMeasure - (ctx.step % stepsPerMeasure);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
            updateGenreUI(stepsRemaining, ts.stepsPerBeat);
        }

        while (ctx.nextNoteTime < ctx.audio.currentTime + ctx.scheduleAheadTime) {
            if (ctx.isCountingIn) {
                scheduleCountIn(ctx.countInBeat, ctx.nextNoteTime);
                advanceCountIn();
            } else {
                const spm = getStepsPerMeasure(arranger.timeSignature);
                
                // --- Session Timer Check ---
                if (ctx.sessionTimer > 0 && !ctx.isEndingPending) {
                    const elapsedMins = (performance.now() - sessionStartTime) / 60000;
                    if (elapsedMins >= ctx.sessionTimer) {
                        dispatch(ACTIONS.SET_ENDING_PENDING, true);
                    }
                }

                // --- Resolution Trigger Logic ---
                // If ending is pending or stopAtEnd is active, and we reach a loop boundary (Step 0)
                if (ctx.step > 0 && (ctx.step % arranger.totalSteps === 0)) {
                    if (ctx.isEndingPending || ctx.stopAtEnd || isResolutionTriggered) {
                        if (!isResolutionTriggered) {
                            isResolutionTriggered = true;
                            ctx.stopAtEnd = false;
                            triggerResolution(ctx.nextNoteTime);
                        }
                        return; // Stop scheduling
                    }
                }

                if (ctx.step % spm === 0 && gb.pendingGenreFeel) {
                    applyPendingGenre();
                }

                scheduleGlobalEvent(ctx.step, ctx.nextNoteTime);
                advanceGlobalStep();
            }
        }
    } finally {
        isScheduling = false;
    }
}

function applyPendingGenre() {
    const payload = gb.pendingGenreFeel;
    if (!payload) return;

    gb.genreFeel = payload.feel;
    if (payload.swing !== undefined) gb.swing = payload.swing;
    if (payload.sub !== undefined) gb.swingSub = payload.sub;
    if (payload.genreName) gb.lastSmartGenre = payload.genreName;
    
    if (payload.drum) {
        loadDrumPreset(payload.drum);
    }

    gb.pendingGenreFeel = null;
    updateGenreUI(0);
    
    ctx.nextNoteTime = ctx.unswungNextNoteTime;

    syncAndFlushWorker(ctx.step);
    triggerFlash(0.15);
}

function advanceCountIn() {
    const effectiveBpm = ctx.bpm + (conductorState.larsBpmOffset || 0);
    const beatDuration = 60.0 / effectiveBpm;
    ctx.nextNoteTime += beatDuration;
    ctx.unswungNextNoteTime += beatDuration;
    ctx.countInBeat++;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (ctx.countInBeat >= ts.beats) {
        ctx.isCountingIn = false;
        ctx.step = 0; 
    }
}

function scheduleCountIn(beat, time) {
     if (ui.visualFlash.checked) ctx.drawQueue.push({ type: 'flash', time: time, intensity: 0.3, beat: 1 });
     const osc = ctx.audio.createOscillator();
     const gain = ctx.audio.createGain();
     osc.connect(gain);
     gain.connect(ctx.masterGain);
     const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
     let freq = 440;
     if (beat === 0) freq = 1000;
     else if (ts.grouping && ts.grouping.length > 1) {
         let accumulated = 0;
         for (let g of ts.grouping) {
             if (beat === accumulated && beat !== 0) { freq = 800; break; }
             accumulated += g;
         }
     } else {
         if (beat === 0) freq = 1000;
         else if (arranger.timeSignature === '4/4' && beat === 2) freq = 800;
         else if (arranger.timeSignature === '6/8' && beat === 3) freq = 800;
         else if (arranger.timeSignature === '12/8' && (beat === 3 || beat === 6 || beat === 9)) freq = 800;
     }
     osc.frequency.setValueAtTime(freq, time);
     gain.gain.setValueAtTime(0.3, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
     osc.onended = () => { gain.disconnect(); osc.disconnect(); };
     osc.start(time);
     osc.stop(time + 0.1);
}

function advanceGlobalStep() {
    updateLarsTempo(ctx.step);
    const effectiveBpm = ctx.bpm + (conductorState.larsBpmOffset || 0);
    const sixteenth = 0.25 * (60.0 / effectiveBpm);
    let duration = sixteenth;
    if (gb.swing > 0) {
        // Find current time signature for swing logic
        const sInfo = getStepInfo(ctx.step, TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'], arranger.measureMap, TIME_SIGNATURES);
        const ts = TIME_SIGNATURES[sInfo.tsName] || TIME_SIGNATURES['4/4'];
        if (ts.stepsPerBeat === 4) {
            const shift = (sixteenth / 3) * (gb.swing / 100);
            duration += (gb.swingSub === '16th') ? ((ctx.step % 2 === 0) ? shift : -shift) : (((ctx.step % 4) < 2) ? shift : -shift);
        }
    }
    ctx.nextNoteTime += duration;
    ctx.unswungNextNoteTime += sixteenth;
    ctx.step++;
}

function getChordAtStep(step) {
    if (arranger.totalSteps === 0) return null;
    const targetStep = step % arranger.totalSteps;
    for (let i = 0; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            return { chord: entry.chord, stepInChord: targetStep - entry.start, chordIndex: i };
        }
    }
    return null;
}

export function scheduleDrums(step, time, isDownbeat, isQuarter, isBackbeat, absoluteStep, isGroupStart) {
    const conductorVel = ctx.conductorVelocity || 1.0;
    const finalTime = time + calculatePocketOffset(ctx, gb);

    const header = document.querySelector('.groove-panel-header h2');
    if (header) header.style.color = gb.fillActive ? 'var(--soloist-color)' : '';
    
    if (gb.fillActive) {
        const fillStep = absoluteStep - gb.fillStartStep;
        if (fillStep >= gb.fillLength) {
            gb.fillActive = false;
            if (gb.pendingCrash) { playDrumSound('Crash', finalTime, 1.1 * conductorVel); gb.pendingCrash = false; }
        }
    }
    
    if (gb.fillActive) {
        const fillStep = absoluteStep - gb.fillStartStep;
        if (fillStep >= 0 && fillStep < gb.fillLength) {
            if (ctx.bandIntensity >= 0.5 || fillStep >= (gb.fillLength / 2)) {
                const notes = gb.fillSteps[fillStep];
                if (notes && notes.length > 0) {
                    notes.forEach(note => playDrumSound(note.name, finalTime, note.vel * conductorVel));
                    return;
                }
            }
        }
    }

    gb.instruments.forEach(inst => {
        const { shouldPlay, velocity, soundName, instTimeOffset } = applyGrooveOverrides({
            step, inst, stepVal: inst.steps[step], ctx, gb, isDownbeat, isQuarter, isBackbeat, isGroupStart
        });

                if (shouldPlay && !inst.muted) {

                    playDrumSound(soundName, finalTime + instTimeOffset, velocity * conductorVel);

                    sendMIDIDrum(soundName, finalTime + instTimeOffset, Math.min(1.0, velocity * conductorVel), midiState.drumsOctave);

                }

        
    });
}

export function scheduleBass(chordData, step, time) {
    const noteEntry = bb.buffer.get(step);
    bb.buffer.delete(step);
    if (noteEntry && noteEntry.freq) {
        const { freq, durationSteps, velocity, timingOffset, muted } = noteEntry; 
        const { chord } = chordData;
        const adjustedTime = time + (timingOffset || 0);
        bb.lastPlayedFreq = freq;
        const midi = getMidi(freq);
        const { name, octave } = midiToNote(midi);
        const spb = 60.0 / ctx.bpm;
        const duration = (durationSteps || 4) * 0.25 * spb;
        const finalVel = (velocity || 1.0) * (ctx.conductorVelocity || 1.0);
        if (vizState.enabled && ctx.viz) {
            ctx.viz.truncateNotes('bass', adjustedTime);
            ctx.drawQueue.push({ type: 'bass_vis', name, octave, midi, time: adjustedTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration });
        }
        playBassNote(freq, adjustedTime, duration, finalVel, muted);
        if (!muted) {
            // Bass is strictly monophonic, so we force Mono mode to kill previous notes
            sendMIDINote(midiState.bassChannel, midi + (midiState.bassOctave * 12), normalizeMidiVelocity(finalVel), adjustedTime, duration, true);
        }
    }
}

export function scheduleSoloist(chordData, step, time, unswungTime) {
    const notes = sb.buffer.get(step);
    sb.buffer.delete(step);
    
    if (notes && notes.length > 0) {
        // Enforce monophony at the scheduler level if double stops are disabled.
        // This acts as a safety net if the worker sends overlapping notes.
        const notesToPlay = sb.doubleStops ? notes : [notes[0]];
        
        // Power-compensation for double stops: Scale volume by 1/sqrt(N)
        const numVoices = notesToPlay.filter(n => n.freq).length;
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

        notesToPlay.forEach(noteEntry => {
            if (noteEntry && noteEntry.freq) {
                const { freq, durationSteps, velocity, bendStartInterval, style, timingOffset, noteType } = noteEntry;
                const { chord } = chordData;
                const offsetS = (timingOffset || 0); 
                
                if (!noteEntry.isDoubleStop) {
                    sb.lastPlayedFreq = freq;
                }
                
                const midi = noteEntry.midi || getMidi(freq);
                const { name, octave } = midiToNote(midi);
                const spb = 60.0 / ctx.bpm;
                const duration = (durationSteps || 4) * 0.25 * spb;
                const baseVel = (velocity || 1.0) * (ctx.conductorVelocity || 1.0);
                const vel = baseVel * polyphonyComp;
                const playTime = unswungTime + offsetS;
                
                playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);
                
                // Soloist is monophonic UNLESS double stops are enabled
                const isMono = !sb.doubleStops;
                
                // Support Pitch Bend for MIDI scoops
                let bend = 0;
                if (bendStartInterval !== 0) {
                    // Map semitones to 14-bit value (-8192 to 8191)
                    // Assuming standard 2-semitone range.
                    bend = Math.round(-(bendStartInterval / 2) * 8192);
                }

                sendMIDINote(midiState.soloistChannel, midi + (midiState.soloistOctave * 12), normalizeMidiVelocity(vel), playTime, duration, { isMono, bend });
                
                if (vizState.enabled && ctx.viz) {
                    if (isMono) {
                        ctx.viz.truncateNotes('soloist', playTime);
                    }
                    ctx.drawQueue.push({ type: 'soloist_vis', name, octave, midi, time: playTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration, noteType });
                }
                sb.lastNoteEnd = playTime + duration;
            }
        });
    }
}

export function scheduleChordVisuals(chordData, t) {
    if (chordData.stepInChord === 0) {
        ctx.drawQueue.push({ type: 'chord_vis', time: t, index: chordData.chordIndex, chordNotes: chordData.chord.freqs.map(f => getMidi(f)), rootMidi: chordData.chord.rootMidi, intervals: chordData.chord.intervals, duration: chordData.chord.beats * (60/ctx.bpm) });
        if (ui.visualFlash.checked) {
            ctx.drawQueue.push({ type: 'flash', time: t, intensity: 0.15, beat: 0 });
        }
    }
}

export function scheduleChords(chordData, step, time) {
    const notes = cb.buffer.get(step);
    cb.buffer.delete(step);
    
    if (notes && notes.length > 0) {
        const spb = 60.0 / ctx.bpm;
        // Count how many non-muted notes are in this step for volume normalization
        const numVoices = notes.filter(n => !n.muted && n.freq).length;

        notes.forEach(n => {
            const { freq, velocity, timingOffset, durationSteps, muted, instrument, dry, ccEvents } = n;
            const playTime = time + (timingOffset || 0);

            if (ccEvents && ccEvents.length > 0) {
                ccEvents.forEach(cc => {
                   if (cc.controller === 64) {
                       const isSustain = cc.value >= 64;
                       const ccTime = playTime + (cc.timingOffset || 0); 
                       updateSustain(isSustain, ccTime);
                       sendMIDICC(midiState.chordsChannel, 64, cc.value, ccTime);
                   }
               });
            }

            if (!muted && freq) {
               const duration = (durationSteps || 1) * 0.25 * spb;
               playNote(freq, playTime, duration, {
                   vol: velocity, 
                   index: 0, 
                   instrument: instrument || 'Piano',
                   dry: dry,
                   numVoices: numVoices
               });
               sendMIDINote(midiState.chordsChannel, getMidi(freq) + (midiState.chordsOctave * 12), normalizeMidiVelocity(velocity), playTime, duration);
            }
        });
    }
}

export function scheduleHarmonies(chordData, step, time) {
    const notes = hb.buffer.get(step);
    hb.buffer.delete(step);
    
    if (notes && notes.length > 0) {
        const spb = 60.0 / ctx.bpm;

        // If any note in this step is a chord start or movement, 
        // clear previous voices once before scheduling the new ones.
        if (notes.some(n => n.isChordStart)) {
            killHarmonyNote();
        }

        // Power-compensation for multiple voices: Scale volume by 1/sqrt(N)
        const numVoices = notes.filter(n => n.freq || n.midi).length;
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

        notes.forEach(n => {
            const { freq, velocity, timingOffset, durationSteps, midi, style, slideInterval, slideDuration, vibrato } = n;
            const playTime = time + (timingOffset || 0);
            const m = midi || getMidi(freq);

            if (freq || m) {
                const duration = (durationSteps || 1) * 0.25 * spb;
                const baseVel = velocity * (ctx.conductorVelocity || 1.0);
                const finalVel = baseVel * polyphonyComp;
                
                playHarmonyNote(freq || 440, playTime, duration, finalVel, style, m, slideInterval, slideDuration, vibrato);
                sendMIDINote(midiState.harmonyChannel, m + (midiState.harmonyOctave * 12), normalizeMidiVelocity(finalVel), playTime, duration);
                
                if (vizState.enabled && ctx.viz) {
                    const { name, octave } = midiToNote(m);
                    ctx.drawQueue.push({ type: 'harmony_vis', name, octave, midi: m, time: playTime, duration });
                }
            }
        });
    }
}

export function scheduleGlobalEvent(step, swungTime) {
    const globalTS = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepInfo = getStepInfo(step, globalTS, arranger.measureMap, TIME_SIGNATURES);
    const ts = TIME_SIGNATURES[stepInfo.tsName] || globalTS;
    
    updateAutoConductor();
    
    // --- NEW: Rhythm Section Mask Calculation ---
    // Extract the snare pattern for the current measure to share with the ensemble
    const spm = getStepsPerMeasure(stepInfo.tsName);
    if (step % spm === 0) {
        let snareMask = 0;
        const snare = gb.instruments.find(i => i.name === 'Snare');
        if (snare) {
            for (let i = 0; i < 16; i++) {
                if (snare.steps[i] > 0) snareMask |= (1 << i);
            }
        }
        if (gb.snareMask !== snareMask) {
            gb.snareMask = snareMask;
            // Immediate sync to worker so harmony module can "hear" the new drum pattern
            syncWorker(ACTIONS.SET_PARAM, { module: 'gb', param: 'snareMask', value: snareMask });
        }
    }

    checkSectionTransition(step, spm);
    
    // MIDI Automation
    if (midiState.enabled && midiState.selectedOutputId && step % 4 === 0) {
        const intensityCC = Math.floor(ctx.bandIntensity * 127);
        const soloistTensionCC = Math.floor(sb.tension * 127);
        
        sendMIDICC(midiState.soloistChannel, 1, soloistTensionCC, swungTime);
        sendMIDICC(midiState.soloistChannel, 11, intensityCC, swungTime);
        sendMIDICC(midiState.chordsChannel, 11, intensityCC, swungTime);
        sendMIDICC(midiState.bassChannel, 11, intensityCC, swungTime);
    }

    const drumStep = step % (gb.measures * spm);
    const t = swungTime + (Math.random() - 0.5) * (gb.humanize / 100) * 0.025;

    if (ui.metronome.checked && stepInfo.isBeatStart) {
        let freq = stepInfo.isMeasureStart ? 1000 : (stepInfo.isGroupStart ? 800 : 600);
        if (ts.beats === 4 && stepInfo.beatIndex === 2 && !stepInfo.isGroupStart) freq = 800;

        const osc = ctx.audio.createOscillator();
        const g = ctx.audio.createGain();
        osc.connect(g); g.connect(ctx.masterGain);
        osc.frequency.setValueAtTime(freq, swungTime);
        g.gain.setValueAtTime(0.15, swungTime);
        g.gain.exponentialRampToValueAtTime(0.001, swungTime + 0.05);
        osc.start(swungTime); osc.stop(swungTime + 0.05);
        osc.onended = () => { g.disconnect(); osc.disconnect(); };
    }

    const feel = gb.genreFeel;
    const straightness = (feel === 'Reggae') ? 0.5 : ((sb.style === 'neo') ? 0.65 : ((sb.style === 'blues') ? 0.55 : (sb.style === 'bossa' ? 0.75 : 0.65)));
    const soloistTime = (ctx.unswungNextNoteTime * straightness) + (swungTime * (1.0 - straightness)) + (Math.random() - 0.5) * (gb.humanize / 100) * 0.025;
    
    if (gb.enabled) {
        const isQuarter = stepInfo.isBeatStart;
        const isBackbeat = (ts.beats === 4) ? (stepInfo.beatIndex === 1 || stepInfo.beatIndex === 3) : false;

        if (stepInfo.isBeatStart && ui.visualFlash.checked) {
            ctx.drawQueue.push({ 
                type: 'flash', 
                time: swungTime, 
                intensity: (stepInfo.isMeasureStart ? 0.2 : (stepInfo.isGroupStart ? 0.15 : 0.1)), 
                beat: (stepInfo.isMeasureStart ? 1 : 0) 
            });
        }
        
        ctx.drawQueue.push({ type: 'drum_vis', step: drumStep, time: swungTime });
        scheduleDrums(drumStep, t, stepInfo.isMeasureStart, isQuarter, isBackbeat, step, stepInfo.isGroupStart);
    }

    const chordData = getChordAtStep(step);
    if (chordData) {
        if (chordData.chord.key && chordData.chord.key !== ctx.currentKey) {
            ctx.currentKey = chordData.chord.key;
            window.dispatchEvent(new CustomEvent('key-change', { detail: { key: ctx.currentKey } }));
        }
        scheduleChordVisuals(chordData, t);
        if (bb.enabled) scheduleBass(chordData, step, t);
        if (sb.enabled) scheduleSoloist(chordData, step, t, soloistTime);
        if (cb.enabled) scheduleChords(chordData, step, t);
        if (hb.enabled) scheduleHarmonies(chordData, step, t);
    }
}

export function syncAndFlushWorker(step) {
    const syncData = {
        arranger: { 
            progression: arranger.progression, 
            stepMap: arranger.stepMap, 
            totalSteps: arranger.totalSteps,
            key: arranger.key,
            isMinor: arranger.isMinor,
            timeSignature: arranger.timeSignature,
            grouping: arranger.grouping
        },
        cb: { style: cb.style, octave: cb.octave, density: cb.density, enabled: cb.enabled, volume: cb.volume },
        bb: { style: bb.style, octave: bb.octave, enabled: bb.enabled, lastFreq: bb.lastFreq, volume: bb.volume },
                sb: { style: sb.style, octave: sb.octave, enabled: sb.enabled, lastFreq: sb.lastFreq, volume: sb.volume, doubleStops: sb.doubleStops },
                hb: { style: hb.style, octave: hb.octave, enabled: hb.enabled, volume: hb.volume, complexity: hb.complexity },
                gb: {
                    genreFeel: gb.genreFeel,
                    lastDrumPreset: gb.lastDrumPreset,
                    enabled: gb.enabled,
                    volume: gb.volume,
                    measures: gb.measures,
                    swing: gb.swing,
                    swingSub: gb.swingSub,
                    instruments: gb.instruments.map(i => ({ name: i.name, steps: [...i.steps], muted: i.muted }))
                },
                ctx: { bpm: ctx.bpm, bandIntensity: ctx.bandIntensity, complexity: ctx.complexity, autoIntensity: ctx.autoIntensity }
            };
        
            cb.buffer.clear();
            bb.buffer.clear();
            sb.buffer.clear();
            hb.buffer.clear();
            gb.fillActive = false;
        
            killAllNotes();    flushWorker(step, syncData);
    restoreGains();
}
