import { ctx, gb, cb, bb, sb, vizState, storage, arranger, subscribe } from './state.js';
import { ui, initUI, showToast, triggerFlash, updateOctaveLabel, renderChordVisualizer, renderGrid, renderGridState, clearActiveVisuals, renderSections, initTabs, renderMeasurePagination, setupPanelMenus, updateActiveChordUI, updateKeySelectLabels, updateRelKeyButton, updateGenreUI } from './ui.js';
import { initAudio, playNote, playDrumSound, playBassNote, playSoloNote, playChordScratch, getVisualTime, updateSustain, restoreGains, killAllNotes } from './engine.js';
import { KEY_ORDER, MIXER_GAIN_MULTIPLIERS, APP_VERSION, TIME_SIGNATURES } from './config.js';
import { SONG_TEMPLATES, DRUM_PRESETS, CHORD_PRESETS } from './presets.js';
import { normalizeKey, getMidi, midiToNote, generateId, compressSections, decompressSections, getStepsPerMeasure, getStepInfo } from './utils.js';
import { validateProgression, transformRelativeProgression } from './chords.js';
import { exportToMidi } from './midi-export.js';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, startWorker, stopWorker, flushWorker, requestBuffer, syncWorker } from './worker-client.js';
import { initPWA, triggerInstall } from './pwa.js';
import { saveCurrentState, debounceSaveState, renderUserPresets, renderUserDrumPresets } from './persistence.js';
import { conductorState, applyConductor, updateAutoConductor, checkSectionTransition } from './conductor.js';
import { pushHistory, undo } from './history.js';
import { shareProgression } from './sharing.js';
import { analyzeFormUI, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, onSectionUpdate, onSectionDelete, onSectionDuplicate, addSection, transposeKey, switchToRelativeKey } from './arranger-controller.js';
import { switchMeasure, updateMeasures, loadDrumPreset, cloneMeasure, clearDrumPresetHighlight, handleTap, resetToDefaults, flushBuffers, togglePower, getPowerConfig, setInstrumentControllerRefs, initializePowerButtons } from './instrument-controller.js';
import { updateStyle, setupPresets, setupUIHandlers } from './ui-controller.js';
import { applyTheme, setBpm } from './app-controller.js';

let userPresets = storage.get('userPresets');
let userDrumPresets = storage.get('userDrumPresets');
let iosAudioUnlocked = false;
let isScheduling = false;
let viz;

/** @type {HTMLAudioElement} */
const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ");
silentAudio.loop = true;

/**
 * Diagnostic: Enables detailed logging of worker/scheduler interactions.
 */
window.enableWorkerLogging = (enabled) => {
    ctx.workerLogging = enabled;
    console.log(`[Worker] Logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { ctx.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

function releaseWakeLock() { 
    if (ctx.wakeLock) { 
        ctx.wakeLock.release(); 
        ctx.wakeLock = null; 
    } 
}

function togglePlay() {
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
        clearActiveVisuals(viz);
        killAllNotes();
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
        
        // Explicit resume here to ensure the user gesture context is fully utilized
        if (ctx.audio && ctx.audio.state === 'suspended') {
            ctx.audio.resume();
        }

        ctx.step = 0;
        flushBuffers();
        syncWorker();
        if (!iosAudioUnlocked) {
            silentAudio.play().catch(e => console.log("Audio unlock failed", e));
            iosAudioUnlocked = true;
        } else {
            silentAudio.play().catch(e => {});
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
        if (viz) viz.setBeatReference(ctx.nextNoteTime);
        if (!ctx.isDrawing) {
            ctx.isDrawing = true;
            requestAnimationFrame(draw);
        }
        startWorker();
        scheduler();
    }
}

function scheduler() {
    if (isScheduling) return;
    isScheduling = true;

    try {
        requestBuffer(ctx.step);
        
        // Update genre UI (countdowns)
        if (gb.pendingGenreFeel) {
            const stepsPerMeasure = getStepsPerMeasure();
            const stepsRemaining = stepsPerMeasure - (ctx.step % stepsPerMeasure);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
            updateGenreUI(stepsRemaining, ts.stepsPerBeat);
        }

        while (ctx.nextNoteTime < ctx.audio.currentTime + ctx.scheduleAheadTime) {
            if (ctx.isCountingIn) {
                scheduleCountIn(ctx.countInBeat, ctx.nextNoteTime);
                advanceCountIn();
            } else {
                // --- Atomic Boundary Check ---
                // We check if we're at a measure boundary BEFORE scheduling the next event.
                // This ensures that if a genre change is pending, we don't look ahead
                // and schedule the next measure using the OLD genre logic.
                const spm = getStepsPerMeasure();
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

/**
 * Applies the queued genre feel changes immediately.
 */
function applyPendingGenre() {
    const payload = gb.pendingGenreFeel;
    if (!payload) return;

    gb.genreFeel = payload.feel;
    if (payload.swing !== undefined) gb.swing = payload.swing;
    if (payload.sub !== undefined) gb.swingSub = payload.sub;
    if (payload.genreName) gb.lastSmartGenre = payload.genreName;

    gb.pendingGenreFeel = null;
    updateGenreUI(0);
    
    // Snap clock to unswung grid to prevent accumulated drift from previous swing
    ctx.nextNoteTime = ctx.unswungNextNoteTime;

    syncAndFlushWorker(ctx.step);
    triggerFlash(0.15);
}

function advanceCountIn() {
    const beatDuration = 60.0 / ctx.bpm;
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
    const sixteenth = 0.25 * (60.0 / ctx.bpm);
    let duration = sixteenth;
    if (gb.swing > 0) {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
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

function scheduleDrums(step, time, isDownbeat, isQuarter, isBackbeat, absoluteStep, isGroupStart) {
    const conductorVel = ctx.conductorVelocity || 1.0;
    
    // --- Intelligent Pocket ---
    let pocketOffset = 0;
    // Push slightly ahead during high intensity/climaxes
    if (ctx.bandIntensity > 0.75) pocketOffset -= 0.008; 
    // Lay back during low intensity/cool-downs
    else if (ctx.bandIntensity < 0.3) pocketOffset += 0.010;
    
    // Genre-specific "Dilla" feel
    if (gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Hip Hop') pocketOffset += 0.015;
    
    const finalTime = time + pocketOffset;

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
        let instTime = finalTime;

        // --- Neo-Soul "Dilla" Quantization Mismatch ---
        if (gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Hip Hop') {
            // Hats push forward (straighter), Snare drags back (lazier)
            if (inst.name === 'HiHat' || inst.name === 'Open') instTime -= 0.012; 
            if (inst.name === 'Snare') instTime += 0.008;
        }

        let stepVal = inst.steps[step];
        let velocity = stepVal === 2 ? 1.25 : 0.9;
        let shouldPlay = stepVal > 0;
        let soundName = inst.name;

                            // --- Hip Hop Procedural Overrides ---
                            if (gb.genreFeel === 'Hip Hop' && !inst.muted) {
                                const loopStep = step % 16;
                                
                                // 1. "Boom Bap" Swing (MPC-60 style)
                                // Hard swing on even 16ths (e.g. step 1, 3, 5...)
                                // We simulate this by delaying the note if it's an offbeat 16th.
                                if (loopStep % 2 === 1) {
                                    // 0.035s is roughly a heavy 60-65% swing at 90 BPM
                                    instTime += 0.035; 
                                }

                                // 2. Kick Ghosting (The "Skippy" Kick)
                                if (inst.name === 'Kick') {
                                    // Random ghost kick on 'a' of 1 or 3 (Steps 3, 11)
                                    if ((loopStep === 3 || loopStep === 11) && Math.random() < 0.3) {
                                        shouldPlay = true;
                                        velocity = 0.6; // Soft ghost
                                    }
                                }

                                // 3. Lazy Snare (Slightly late backbeat)
                                if (inst.name === 'Snare' && (loopStep === 4 || loopStep === 12)) {
                                    instTime += 0.015; // Drag the backbeat
                                    velocity = 1.15; // Heavy hit
                                }
                            }

                            // --- Funk Procedural Overrides ---
                            if (gb.genreFeel === 'Funk' && !inst.muted) {
                                const loopStep = step % 16;
                                
                                // 1. Intelligent Snare Ghosting
                                if (inst.name === 'Snare' && stepVal === 0) {
                                    // Target "e" (1) and "a" (3) subdivisions for syncopation
                                    const isSubdivision = loopStep % 4 !== 0 && loopStep % 4 !== 2; 
                                    if (isSubdivision) {
                                        const kickInst = gb.instruments.find(i => i.name === 'Kick');
                                        const kickPlaying = kickInst && kickInst.steps[step] > 0;
                                        
                                        // Avoid masking the kick; syncopate against it
                                        if (!kickPlaying && Math.random() < (ctx.complexity * 0.5)) { 
                                            shouldPlay = true;
                                            velocity = 0.15 + (Math.random() * 0.1); 
                                        }
                                    }
                                }
                                
                                // 2. Dynamic Hi-Hat Barks
                                if (inst.name === 'HiHat' && shouldPlay) {
                                    // Open high-hat on the "ah" (last 16th of a beat) creates a "lifting" feel
                                    if (loopStep % 4 === 3 && Math.random() < (ctx.bandIntensity * 0.35)) {
                                        soundName = 'Open';
                                        velocity *= 1.1; // Accent the bark
                                    }
                                }
                            }

                            // --- Disco Procedural Overrides ---
                            if (gb.genreFeel === 'Disco' && !inst.muted) {
                                const loopStep = step % 16;
                                
                                // 1. Four-on-the-Floor Kick
                                if (inst.name === 'Kick') {
                                    shouldPlay = (loopStep % 4 === 0);
                                    if (shouldPlay) velocity = (loopStep === 0) ? 1.2 : 1.1; 
                                }
                                
                                // 2. Backbeat Snare (plus optional ghosting)
                                if (inst.name === 'Snare') {
                                    shouldPlay = (loopStep === 4 || loopStep === 12);
                                    if (shouldPlay) velocity = 1.15;
                                    
                                    // Ghost notes at end of phrase
                                    if (loopStep === 15 && Math.random() < 0.2) {
                                        shouldPlay = true;
                                        velocity = 0.4;
                                    }
                                }
                                
                                // 3. Offbeat Hi-Hat Breathing
                                if (inst.name === 'HiHat' || inst.name === 'Open') {
                                    shouldPlay = false; // Reset pattern
                                    
                                    // Always play the offbeat "tsst"
                                    if (loopStep % 4 === 2) {
                                        shouldPlay = true;
                                        // Modulate Open vs Closed based on intensity
                                        if (ctx.bandIntensity > 0.6) {
                                            soundName = 'Open';
                                            velocity = 1.1;
                                        } else {
                                            soundName = 'HiHat'; // Closed
                                            velocity = 0.9;
                                        }
                                    }
                                    
                                    // 16th note "chick" glue
                                    if (loopStep % 2 === 1) { // 1, 3, 5, 7...
                                        if (Math.random() < 0.6) {
                                            shouldPlay = true;
                                            soundName = 'HiHat';
                                            velocity = 0.5; // Quiet
                                        }
                                    }
                                }
                            }

                            // --- Reggae Procedural Overrides ---
                            if (gb.genreFeel === 'Reggae' && !inst.muted) {
                                const loopStep = step % 16;
                                
                                // Dynamic Style Switching based on Intensity
                                if (inst.name === 'Kick') {
                                    // 1. Steppers (High Intensity) - Four on the floor
                                    if (ctx.bandIntensity > 0.7) {
                                        shouldPlay = (loopStep % 4 === 0);
                                        if (shouldPlay) velocity = 1.15;
                                    } 
                                    // 2. Rockers (Medium Intensity) - Kick on 1 and 3
                                    // (Preset "One Drop" is on 3 only)
                                    else if (ctx.bandIntensity > 0.45) {
                                        // Add Kick on Beat 1 (Step 0)
                                        if (loopStep === 0) {
                                            shouldPlay = true;
                                            velocity = 1.1;
                                        }
                                        // Ensure Beat 3 is playing
                                        if (loopStep === 8) {
                                            shouldPlay = true;
                                            velocity = 1.15;
                                        }
                                    }
                                    // Low intensity = Default "One Drop" (Kick on 3 only)
                                }
                            }

                            // --- Jazz Procedural Overrides ---
                            if (gb.genreFeel === 'Jazz' && !inst.muted) {
                                const loopStep = step % 16;
                                if (inst.name === 'Open') {
                                    shouldPlay = false;
                                    if ([0, 4, 6, 8, 12, 14].includes(loopStep)) {
                                        shouldPlay = true;
                                        if (loopStep % 4 === 0) velocity = 1.15; 
                                        else velocity = 0.75; 
                                    }
                                } else if (inst.name === 'HiHat') {
                                    shouldPlay = false;
                                    if (loopStep === 4 || loopStep === 12) {
                                        shouldPlay = true;
                                        velocity = 0.8;
                                    }
                                } else if (inst.name === 'Kick') {
                                    shouldPlay = false;
                                    if (loopStep % 4 === 0) { shouldPlay = true; velocity = 0.35; }
                                    const bombProb = ctx.bandIntensity * 0.3;
                                    if (Math.random() < bombProb) {
                                        if ([10, 14, 15].includes(loopStep)) { shouldPlay = true; velocity = 0.9 + (Math.random() * 0.2); }
                                    }
                                } else if (inst.name === 'Snare') {
                                    shouldPlay = false;
                                    if (Math.random() < 0.08) { shouldPlay = true; velocity = 0.25; }
                                    if (loopStep === 14) {
                                        if (Math.random() < 0.6 + (ctx.bandIntensity * 0.3)) { shouldPlay = true; velocity = 0.85; }
                                    } else if (loopStep === 6) {
                                        if (Math.random() < 0.3 + (ctx.bandIntensity * 0.3)) { shouldPlay = true; velocity = 0.8; }
                                    }
                                }
                            }

                            // --- Blues Procedural Overrides ---
                            if (gb.genreFeel === 'Blues' && !inst.muted) {
                                const loopStep = step % 16;
                                
                                if (inst.name === 'HiHat') {
                                    // Classic Foot Chick on 2 & 4
                                    shouldPlay = false;
                                    if (loopStep === 4 || loopStep === 12) {
                                        shouldPlay = true;
                                        velocity = 0.85;
                                    }
                                } else if (inst.name === 'Open') {
                                    // Blues Shuffle Ride Pattern
                                    // Use a combination of solid quarters and probabilistic "skip" notes
                                    shouldPlay = false;
                                    if (loopStep % 4 === 0) {
                                        // Solid pulse on 1, 2, 3, 4
                                        shouldPlay = true;
                                        velocity = 1.1;
                                    } else if (loopStep % 2 === 0) {
                                        // The "skip" note (8th note upbeat)
                                        // Probability increases with intensity/complexity
                                        const skipProb = 0.4 + (ctx.bandIntensity * 0.5);
                                        if (Math.random() < skipProb) {
                                            shouldPlay = true;
                                            velocity = 0.7;
                                        }
                                    }
                                } else if (inst.name === 'Kick') {
                                    // Traditional Blues: Heavy on 1, interactive elsewhere
                                    // If not already scheduled by pattern, ensure 1 is there
                                    if (loopStep === 0) {
                                        shouldPlay = true;
                                        velocity = 1.2;
                                    }
                                } else if (inst.name === 'Snare') {
                                    // Shuffle "Backbeat" on 2 & 4
                                    if (loopStep === 4 || loopStep === 12) {
                                        shouldPlay = true;
                                        velocity = 1.1;
                                    }
                                }
                            }

        if (shouldPlay && !inst.muted) {
            // Tame accents for Funk Hi-Hats at high intensity to prevent them from overpowering the mix
            if (gb.genreFeel === 'Funk' && (inst.name === 'HiHat' || inst.name === 'Open')) {
                 if (stepVal === 2 && ctx.bandIntensity > 0.6) velocity = 1.0; // Cap accents
                 else if (stepVal !== 2) velocity = Math.min(velocity, 0.75); // Cap others
            }
            
            // --- Neo-Soul Global Dampening ---
            if (gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Hip Hop') {
                velocity *= 0.75; // General dampening for "chill" vibe
            }
            
            // --- Snare Timbre Shifting ---
            if (inst.name === 'Snare') {
                if (gb.lastDrumPreset === 'Bossa Nova') {
                    soundName = 'Sidestick';
                    
                    // --- Bossa Procedural Variation ---
                    // Add subtle 16th-note syncopation to break the static loop
                    const loopStep = step % 32; 
                    if (ctx.bandIntensity > 0.5) {
                        // "Samba" skip on the 'a' of beat 2 or 4
                        if ((loopStep === 7 || loopStep === 23) && Math.random() < 0.2) {
                            shouldPlay = true;
                            velocity = 0.6;
                        }
                    }
                    // Pickup ghost note at end of phrase
                    if (loopStep === 31 && Math.random() < 0.2) {
                        shouldPlay = true;
                        velocity = 0.45;
                    }

                } else if (gb.genreFeel === 'Acoustic') {
                    soundName = (ctx.bandIntensity > 0.7) ? 'Snare' : 'Sidestick';
                } else if (ctx.bandIntensity < 0.35 && gb.genreFeel !== 'Rock') {
                    soundName = 'Sidestick';
                }
            }

            if (gb.genreFeel === 'Rock') {
                // --- Rock "Stadium" Logic ---
                const loopStep = step % 16;

                // 1. "Right-Hand Lead" Hi-Hat Pulse (Human Feel)
                if (inst.name === 'HiHat' || inst.name === 'Open') {
                    if (loopStep % 4 === 0) velocity *= 1.05; // Downbeats heavier
                    else if (loopStep % 4 === 2) velocity *= 0.95; // Upbeats lighter
                }

                // 2. Procedural Kick Variation (The "Skip")
                if (inst.name === 'Kick') {
                    // Add "And of 3" kick (Step 10) randomly in normal/high intensity
                    if (loopStep === 10 && ctx.bandIntensity > 0.4 && Math.random() < 0.25) {
                        shouldPlay = true;
                        velocity = 0.9; // Not a full accent
                    }
                }

                // 3. Subtle Snare Ghosts ("Grease")
                if (inst.name === 'Snare' && !shouldPlay) {
                    // Ghost on 'a' of 2 (Step 7) or 'e' of 3 (Step 9) - classic syncopation
                    if ((loopStep === 7 || loopStep === 9) && ctx.bandIntensity > 0.35 && ctx.bandIntensity < 0.75) {
                        if (Math.random() < 0.12) {
                            shouldPlay = true;
                            velocity = 0.35; // Very soft
                        }
                    }
                }

                // "Anthem" Mode (High Intensity)
                if (ctx.bandIntensity > 0.7) {
                    if (inst.name === 'HiHat' && shouldPlay) {
                        // Switch to Open Hat (Washy Ride feel)
                        soundName = 'Open';
                        velocity *= 1.1; 
                    }
                    if (inst.name === 'Snare' && shouldPlay) {
                        // Heavy Backbeat
                        velocity *= 1.15;
                    }
                    // Add heavy downbeat kick emphasis
                    if (inst.name === 'Kick' && isDownbeat) {
                         velocity *= 1.25;
                    }
                } 
                // "Tight" Mode (Low Intensity)
                else if (ctx.bandIntensity < 0.4) {
                    if (inst.name === 'Snare' && shouldPlay) {
                         // Tighter, controlled snare
                         velocity *= 0.85;
                         // Use Sidestick for very quiet verses
                         if (ctx.bandIntensity < 0.25) soundName = 'Sidestick';
                    }
                    if (inst.name === 'HiHat') {
                        // Tight, closed hats
                        velocity *= 0.8;
                    }
                    // Reduce ghost notes or extra kicks
                    if (inst.name === 'Kick' && !isDownbeat) {
                        velocity *= 0.7;
                    }
                }
                // Standard Rock Fallback
                else {
                    if (inst.name === 'Kick' && isDownbeat) velocity *= 1.2;
                    if (inst.name === 'Snare' && isBackbeat) velocity *= 1.2;
                }
            } else if (gb.genreFeel === 'Funk' && stepVal === 2) velocity *= 1.1;

            if (gb.genreFeel === 'Disco' && inst.name === 'Open') {
                velocity *= 1.15; // Accentuate the "Pea-Soup" open hat
            }
            
            if (inst.name === 'HiHat' && gb.genreFeel !== 'Jazz' && ctx.bandIntensity > 0.8 && isQuarter) { soundName = 'Open'; velocity *= 1.1; }
            if (inst.name === 'Kick') velocity *= isDownbeat ? 1.15 : (isGroupStart ? 1.1 : (isQuarter ? 1.05 : 0.9));
            else if (inst.name === 'Snare') velocity *= isBackbeat ? 1.1 : 0.9;
            else if (inst.name === 'HiHat' || inst.name === 'Open') {
                velocity *= isQuarter ? 1.1 : 0.85;
                if (gb.genreFeel === 'Jazz' && inst.name !== 'HiHat' && inst.name !== 'Open') { 
                    // Legacy dampening check removed for Ride/Chick as they have set velocities now.
                    // Kept empty to ensure no double-application if logic changes.
                } else if (gb.genreFeel !== 'Jazz') {
                     // Fast tempo dampening for non-jazz
                     if (ctx.bpm > 165) { velocity *= 0.7; if (!isQuarter) velocity *= 0.6; }
                }
            }
            playDrumSound(soundName, instTime, velocity * conductorVel);
        }
    });
}

function scheduleBass(chordData, step, time) {
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
        if (vizState.enabled) ctx.drawQueue.push({ type: 'bass_vis', name, octave, midi, time: adjustedTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration });
        playBassNote(freq, adjustedTime, duration, finalVel, muted);
    }
}

function scheduleSoloist(chordData, step, time, unswungTime) {
    const noteEntry = sb.buffer.get(step);
    sb.buffer.delete(step);
    if (noteEntry && noteEntry.freq) {
        const { freq, durationSteps, velocity, bendStartInterval, style, timingOffset, noteType } = noteEntry;
        const { chord } = chordData;
        const offsetS = (timingOffset || 0); // timingOffset is in seconds from standardized object
        sb.lastPlayedFreq = freq;
        const midi = noteEntry.midi || getMidi(freq);
        const { name, octave } = midiToNote(midi);
        const spb = 60.0 / ctx.bpm;
        const duration = (durationSteps || 4) * 0.25 * spb;
        const vel = (velocity || 1.0) * (ctx.conductorVelocity || 1.0);
        const playTime = unswungTime + offsetS;
        
        playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);
        
        if (vizState.enabled) {
            ctx.drawQueue.push({ type: 'soloist_vis', name, octave, midi, time: playTime, chordNotes: chord.freqs.map(f => getMidi(f)), duration, noteType });
        }
        sb.lastNoteEnd = playTime + duration;
    }
}

function scheduleChordVisuals(chordData, t) {
    if (chordData.stepInChord === 0) {
        ctx.drawQueue.push({ type: 'chord_vis', time: t, index: chordData.chordIndex, chordNotes: chordData.chord.freqs.map(f => getMidi(f)), rootMidi: chordData.chord.rootMidi, intervals: chordData.chord.intervals, duration: chordData.chord.beats * (60/ctx.bpm) });
        if (ui.visualFlash.checked) {
            ctx.drawQueue.push({ type: 'flash', time: t, intensity: 0.15, beat: 0 });
        }
    }
}

function scheduleChords(chordData, step, time, stepInfo) {
    const notes = cb.buffer.get(step);
    cb.buffer.delete(step);
    
    if (notes && notes.length > 0) {
        const spb = 60.0 / ctx.bpm;
        notes.forEach(n => {
            const { freq, velocity, timingOffset, durationSteps, muted, instrument, dry, ccEvents } = n;
            const playTime = time + (timingOffset || 0);

            // Handle Sustain Events
            if (ccEvents && ccEvents.length > 0) {
                ccEvents.forEach(cc => {
                   if (cc.controller === 64) {
                       const isSustain = cc.value >= 64;
                       const ccTime = playTime + (cc.timingOffset || 0); 
                       updateSustain(isSustain, ccTime);
                   }
               });
            }

            if (!muted && freq) {
               const duration = (durationSteps || 1) * 0.25 * spb;
               playNote(freq, playTime, duration, {
                   vol: velocity, 
                   index: 0, 
                   instrument: instrument || 'Piano',
                   dry: dry
               });
            }
        });
    }
}

function scheduleGlobalEvent(step, swungTime) {
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const stepInfo = getStepInfo(step, ts);
    
    updateAutoConductor();
    checkSectionTransition(step, spm);
    
    const drumStep = step % (gb.measures * spm);
    const t = swungTime + (Math.random() - 0.5) * (gb.humanize / 100) * 0.025;

    // --- 1. Metronome / Pulse ---
    if (ui.metronome.checked && stepInfo.isBeatStart) {
        let freq = stepInfo.isMeasureStart ? 1000 : (stepInfo.isGroupStart ? 800 : 600);
        
        // Fallback for standard meters without complex groupings
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

    const straightness = (sb.style === 'neo') ? 0.35 : ((sb.style === 'blues') ? 0.45 : 0.65);
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
        scheduleChordVisuals(chordData, t);
        if (bb.enabled) scheduleBass(chordData, step, t);
        if (sb.enabled) scheduleSoloist(chordData, step, t, soloistTime);
        if (cb.enabled) scheduleChords(chordData, step, t, stepInfo);
    }
}

function updateDrumVis(ev) {
    if (ctx.lastActiveDrumElements) ctx.lastActiveDrumElements.forEach(s => s.classList.remove('playing'));
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const stepMeasure = Math.floor(ev.step / spm);
    if (gb.followPlayback && stepMeasure !== gb.currentMeasure && ctx.isPlaying) switchMeasure(stepMeasure, true);
    const offset = gb.currentMeasure * spm;
    if (ev.step >= offset && ev.step < offset + spm) {
        const activeSteps = gb.cachedSteps[ev.step - offset];
        if (activeSteps) { activeSteps.forEach(s => s.classList.add('playing')); ctx.lastActiveDrumElements = activeSteps; }
        else ctx.lastActiveDrumElements = null;
    } else ctx.lastActiveDrumElements = null;
    ctx.lastPlayingStep = ev.step;
}

function updateChordVis(ev) { updateActiveChordUI(ev.index); }

function draw() {
    if (!ctx.audio) return;
    if (ctx.autoIntensity && ui.intensitySlider) {
        const val = Math.round(ctx.bandIntensity * 100);
        if (parseInt(ui.intensitySlider.value) !== val) { ui.intensitySlider.value = val; if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`; }
    }
    if (!ctx.isPlaying && ctx.drawQueue.length === 0) { ctx.isDrawing = false; clearActiveVisuals(viz); return; }
    const now = getVisualTime();
    while (ctx.drawQueue.length > 0 && ctx.drawQueue[0].time < now - 2.0) ctx.drawQueue.shift();
    if (ctx.drawQueue.length > 300) ctx.drawQueue = ctx.drawQueue.slice(ctx.drawQueue.length - 200);
    while (ctx.drawQueue.length && ctx.drawQueue[0].time <= now) {
        const ev = ctx.drawQueue.shift();
        if (ev.type === 'drum_vis') updateDrumVis(ev);
        else if (ev.type === 'chord_vis') {
            updateChordVis(ev);
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushChord({ time: ev.time, notes: ev.chordNotes, rootMidi: ev.rootMidi, intervals: ev.intervals, duration: ev.duration });
        } else if (ev.type === 'bass_vis') {
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushNote('bass', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'soloist_vis') {
            if (viz && vizState.enabled && ctx.isDrawing) viz.pushNote('soloist', { midi: ev.midi, time: ev.time, noteName: ev.name, octave: ev.octave, duration: ev.duration });
        } else if (ev.type === 'flash') triggerFlash(ev.intensity);
    }
    if (viz && vizState.enabled && ctx.isDrawing) {
        viz.setRegister('bass', bb.octave); viz.setRegister('soloist', sb.octave); viz.setRegister('chords', cb.octave);
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        viz.render(now, ctx.bpm, ts.beats);
    }
    requestAnimationFrame(draw);
}

function init() {
    try {
        initUI();
        const savedState = storage.get('currentState');
        if (savedState && savedState.sections) {
            arranger.sections = savedState.sections; arranger.key = savedState.key || 'C'; arranger.timeSignature = savedState.timeSignature || '4/4'; arranger.isMinor = savedState.isMinor || false; arranger.notation = savedState.notation || 'roman'; arranger.lastChordPreset = savedState.lastChordPreset || 'Pop (Standard)'; ctx.theme = savedState.theme || 'auto'; ctx.bpm = savedState.bpm || 100; ctx.bandIntensity = savedState.bandIntensity !== undefined ? savedState.bandIntensity : 0.5; ctx.complexity = savedState.complexity !== undefined ? savedState.complexity : 0.3; ctx.autoIntensity = savedState.autoIntensity !== undefined ? savedState.autoIntensity : true; ctx.metronome = savedState.metronome || false; ctx.applyPresetSettings = savedState.applyPresetSettings !== undefined ? savedState.applyPresetSettings : false; vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false;
            
            if (savedState.cb) { 
                cb.enabled = savedState.cb.enabled !== undefined ? savedState.cb.enabled : true; 
                cb.style = savedState.cb.style || 'smart'; 
                cb.instrument = 'Piano'; // Always force Piano
                cb.octave = savedState.cb.octave; cb.density = savedState.cb.density; cb.volume = savedState.cb.volume; cb.reverb = savedState.cb.reverb; 
                cb.practiceMode = savedState.cb.practiceMode || false;
            }
            if (savedState.bb) { bb.enabled = savedState.bb.enabled !== undefined ? savedState.bb.enabled : false; bb.style = savedState.bb.style || 'smart'; bb.octave = savedState.bb.octave; bb.volume = savedState.bb.volume; bb.reverb = savedState.bb.reverb; }
            if (savedState.sb) { sb.enabled = savedState.sb.enabled !== undefined ? savedState.sb.enabled : false; sb.style = savedState.sb.style || 'smart'; sb.octave = (savedState.sb.octave === 77 || savedState.sb.octave === 67 || savedState.sb.octave === undefined) ? 72 : savedState.sb.octave; sb.volume = savedState.sb.volume; sb.reverb = savedState.sb.reverb; }
            if (savedState.gb) { 
                gb.enabled = savedState.gb.enabled !== undefined ? savedState.gb.enabled : true; 
                gb.volume = savedState.gb.volume; 
                gb.reverb = savedState.gb.reverb; 
                gb.swing = savedState.gb.swing; 
                gb.swingSub = savedState.gb.swingSub; 
                gb.measures = savedState.gb.measures || 1; 
                gb.humanize = savedState.gb.humanize !== undefined ? savedState.gb.humanize : 20; 
                gb.followPlayback = savedState.gb.followPlayback !== undefined ? savedState.gb.followPlayback : (savedState.gb.autoFollow !== undefined ? savedState.gb.autoFollow : true); 
                gb.lastDrumPreset = savedState.gb.lastDrumPreset || 'Standard'; 
                if (savedState.gb.pattern) { 
                    savedState.gb.pattern.forEach(savedInst => { 
                        const inst = gb.instruments.find(i => i.name === savedInst.name); 
                        if (inst) { inst.steps.fill(0); savedInst.steps.forEach((v, i) => { if (i < 128) inst.steps[i] = v; }); } 
                    }); 
                } 
                gb.genreFeel = savedState.gb.genreFeel || 'Rock'; 
                gb.lastSmartGenre = savedState.gb.lastSmartGenre || 'Rock'; 
                gb.activeTab = savedState.gb.activeTab || 'smart'; 
                gb.mobileTab = savedState.gb.mobileTab || 'chords'; 
                gb.currentMeasure = 0; 
            }
            ui.keySelect.value = arranger.key; ui.timeSigSelect.value = arranger.timeSignature; ui.bpmInput.value = ctx.bpm;
            if (ui.intensitySlider) { ui.intensitySlider.value = Math.round(ctx.bandIntensity * 100); if (ui.intensityValue) ui.intensityValue.textContent = `${ui.intensitySlider.value}%`; ui.intensitySlider.disabled = ctx.autoIntensity; ui.intensitySlider.style.opacity = ctx.autoIntensity ? 0.5 : 1; }
            if (ui.complexitySlider) { ui.complexitySlider.value = Math.round(ctx.complexity * 100); let label = 'Low'; if (ctx.complexity > 0.33) label = 'Medium'; if (ctx.complexity > 0.66) label = 'High'; if (ui.complexityValue) ui.complexityValue.textContent = label; }
            if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = ctx.autoIntensity;
            document.querySelectorAll('.genre-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.genre === gb.lastSmartGenre); });
            ui.notationSelect.value = arranger.notation; ui.densitySelect.value = cb.density; 
            if (ui.practiceModeCheck) ui.practiceModeCheck.checked = cb.practiceMode;
                if (ui.chordVol) ui.chordVol.value = cb.volume;
                if (ui.chordReverb) ui.chordReverb.value = cb.reverb;
                if (ui.bassVol) ui.bassVol.value = bb.volume;
                if (ui.bassReverb) ui.bassReverb.value = bb.reverb;
                if (ui.soloistVol) ui.soloistVol.value = sb.volume;
                if (ui.soloistReverb) ui.soloistReverb.value = sb.reverb;
                if (ui.drumVol) ui.drumVol.value = gb.volume;
                if (ui.drumReverb) ui.drumReverb.value = gb.reverb;
                if (ui.swingSlider) ui.swingSlider.value = gb.swing;
                if (ui.swingBase) ui.swingBase.value = gb.swingSub;
                if (ui.humanizeSlider) ui.humanizeSlider.value = gb.humanize;
                if (ui.drumBarsSelect) ui.drumBarsSelect.value = gb.measures;
                if (ui.metronome) ui.metronome.checked = ctx.metronome;
                if (ui.applyPresetSettings) ui.applyPresetSettings.checked = ctx.applyPresetSettings;
                
                applyTheme(ctx.theme); 
            }
             else { 
            applyTheme('auto'); 
            if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = true;
            if (ui.intensitySlider) {
                ui.intensitySlider.disabled = true;
                ui.intensitySlider.style.opacity = 0.5;
            }
        }
        updateRelKeyButton(); updateKeySelectLabels();
        viz = new UnifiedVisualizer('unifiedVizContainer'); viz.addTrack('bass', 'var(--success-color)'); viz.addTrack('soloist', 'var(--soloist-color)');
        setInstrumentControllerRefs(() => scheduler(), viz);
        initTabs(); setupPanelMenus(); renderGrid(); renderMeasurePagination(switchMeasure);
        if (!savedState || !savedState.gb || !savedState.gb.pattern) loadDrumPreset('Basic Rock');
        setupPresets({ togglePlay }); setupUIHandlers({ togglePlay, previewChord: window.previewChord, init, viz, silentAudio, iosAudioUnlocked, POWER_CONFIG: getPowerConfig() });
        renderUserPresets(onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, togglePlay);
        renderUserDrumPresets(switchMeasure); loadFromUrl(); renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        
        initializePowerButtons();
        
        // --- BACKGROUND RECOVERY ---
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log("[Main] Page visible. Checking audio state...");
                if (ctx.audio) {
                    console.log(`[Main] Current AudioContext state: ${ctx.audio.state}`);
                    // If suspended but we are supposed to be playing, try a soft resume
                    if (ctx.audio.state === 'suspended' && ctx.isPlaying) {
                        ctx.audio.resume().catch(e => console.error("[Main] Background resume failed:", e));
                    }
                }
                // Ensure silentAudio is still playing if we are active (iOS Safari hack)
                if (ctx.isPlaying && silentAudio.paused) {
                    silentAudio.play().catch(() => {});
                }
            }
        });

        validateProgression(() => { renderChordVisualizer(); analyzeFormUI(); });
        
        // --- WORKER INIT ---
        initWorker(() => scheduler(), (notes) => { 
            notes.forEach(n => { 
                if (n.module === 'bb') bb.buffer.set(n.step, n); 
                else if (n.module === 'sb') sb.buffer.set(n.step, n); 
                else if (n.module === 'cb') {
                    if (!cb.buffer.has(n.step)) cb.buffer.set(n.step, []);
                    cb.buffer.get(n.step).push(n);
                }
            }); 
            if (ctx.isPlaying) scheduler(); // Run scheduler to consume new notes immediately
        });
        
        // Auto-sync worker on state changes
        subscribe(() => syncWorker());
        
        syncWorker(); document.querySelector('.app-main-layout').classList.add('loaded');
        const versionEl = document.getElementById('appVersion'); if (versionEl) versionEl.textContent = `Ensemble v${APP_VERSION}`;
    } catch (e) { console.error("Error during init:", e); }
}

window.previewChord = (index) => {
    if (ctx.isPlaying) return; 
    initAudio(); 
    const chord = arranger.progression[index]; 
    if (!chord) return;
    
    // Disable sustain for auditioning
    const wasSustainActive = ctx.sustainActive;
    ctx.sustainActive = false;
    
    const now = ctx.audio.currentTime; 
    chord.freqs.forEach(f => playNote(f, now, 1.0, { vol: 0.15, instrument: 'Piano' }));
    
    // Restore sustain state (though usually false when not playing)
    ctx.sustainActive = wasSustainActive;

    const cards = document.querySelectorAll('.chord-card'); 
    if (cards[index]) { 
        cards[index].classList.add('active'); 
        setTimeout(() => { if (!ctx.isPlaying) cards[index].classList.remove('active'); }, 300); 
    }
};

/**
 * Collects current state and sends a combined sync+flush message to the worker.
 * This ensures atomic state update and buffer regeneration at measure boundaries.
 */
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
        sb: { style: sb.style, octave: sb.octave, enabled: sb.enabled, lastFreq: sb.lastFreq, volume: sb.volume },
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

    // Atomic Buffer Clearing:
    // We clear the client-side buffers for all instruments to ensure 
    // no stale notes from the previous genre/state are played.
    cb.buffer.clear();
    bb.buffer.clear();
    sb.buffer.clear();
    gb.fillActive = false; // Cancel any active fill

    killAllNotes();
    flushWorker(step, syncData);
    restoreGains();
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search); let hasParams = false;
    if (params.get('s')) { arranger.sections = decompressSections(params.get('s')); hasParams = true; }
    else if (params.get('prog')) { arranger.sections = [{ id: generateId(), label: 'Main', value: params.get('prog') }]; hasParams = true; }
    if (hasParams) clearChordPresetHighlight();
    if (params.get('key')) { ui.keySelect.value = normalizeKey(params.get('key')); arranger.key = ui.keySelect.value; }
    if (params.get('ts')) { arranger.timeSignature = params.get('ts'); ui.timeSigSelect.value = arranger.timeSignature; }
    if (params.get('bpm')) { setBpm(params.get('bpm'), viz); }
    if (params.get('style')) updateStyle('chord', params.get('style'));
    if (params.get('notation')) { arranger.notation = params.get('notation'); ui.notationSelect.value = arranger.notation; }
}

window.addEventListener('load', () => { init(); initPWA(); });