import { ctx, cb, sb, gb, arranger, dispatch } from './state.js';
import { ui, triggerFlash } from './ui.js';
import { getSectionEnergy } from './form-analysis.js';
import { debounceSaveState } from './persistence.js';
import { generateProceduralFill } from './fills.js';

export const conductorState = { 
    target: 0.5, 
    stepSize: 0.0005,
    loopCount: 0,
    formIteration: 0, // Tracks how many times the ENTIRE song has looped
    form: null,
    larsBpmOffset: 0
};

export function applyConductor() {
    const intensity = ctx.bandIntensity; // 0.0 - 1.0
    const complexity = ctx.complexity;   // 0.0 - 1.0

    // --- 1. Master Dynamics ---
    let targetDensity = 'standard';
    if (intensity < 0.4) targetDensity = 'thin';
    else if (intensity > 0.85) targetDensity = 'rich';
    
    if (ui.densitySelect && ui.densitySelect.value !== targetDensity) {
        ui.densitySelect.value = targetDensity;
    }

    const targetVelocity = 0.8 + (intensity * 0.3); // 0.8x to 1.1x

    // --- 2. Complexity / Busyness ---
    const targetHookProb = 0.2 + (complexity * 0.6);

    // --- 3. Musical Conversation (Soloist Density) ---
    // If soloist is active, the accompanist should "listen" and back off.
    const isSoloistBusy = sb.enabled && sb.busySteps > 0;
    const targetIntentDensity = isSoloistBusy ? (0.3 * (1 - complexity)) : (0.5 + intensity * 0.4);

    dispatch('UPDATE_CONDUCTOR_DECISION', {
        density: targetDensity,
        velocity: targetVelocity,
        hookProb: targetHookProb,
        intent: { density: targetIntentDensity }
    });

    // --- 4. Micro-Timing (Pocket) ---
    let targetBassPocket = 0;
    const genre = gb.genreFeel;
    if (genre === 'Neo-Soul') targetBassPocket = 0.025; // 25ms "Dilla" lag
    else if (genre === 'Funk') targetBassPocket = -0.005; // 5ms "Ahead of the beat" push for Funk energy
    
    dispatch('SET_PARAM', { module: 'bb', param: 'pocketOffset', value: targetBassPocket });

    // --- 5. Intensity-Aware Mixing ---
    if (ctx.masterLimiter && ctx.audio) {
        // Dynamic Compression: Tighter at high intensity to glue the mix
        const targetThreshold = -0.5 - (intensity * 1.5); // -0.5 to -2.0 dB
        const targetRatio = 12 + (intensity * 8); // 12:1 to 20:1
        
        ctx.masterLimiter.threshold.setTargetAtTime(targetThreshold, ctx.audio.currentTime, 0.5);
        ctx.masterLimiter.ratio.setTargetAtTime(targetRatio, ctx.audio.currentTime, 0.5);
    }

    debounceSaveState();
}

/**
 * Updates auto-intensity and monitors the band's "conversation".
 */
export function updateAutoConductor() {
    if (!ctx.autoIntensity || !ctx.isPlaying) return;

    if (Math.abs(ctx.bandIntensity - conductorState.target) > 0.001) {
        // Asymmetric ramping: humans tend to build energy gradually but can stop/drop quickly
        const multiplier = (ctx.bandIntensity > conductorState.target) ? 2.5 : 1.0;
        let newIntensity = ctx.bandIntensity + ((ctx.bandIntensity < conductorState.target) ? Math.abs(conductorState.stepSize) : -Math.abs(conductorState.stepSize)) * multiplier;
        newIntensity = Math.max(0.01, Math.min(1.0, newIntensity));
        
        dispatch('SET_BAND_INTENSITY', newIntensity);
        
        const val = Math.round(newIntensity * 100);
        if (ui.intensitySlider) {
            if (parseInt(ui.intensitySlider.value) !== val) {
                ui.intensitySlider.value = val;
                if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
            }
        }
        applyConductor();
    }
}

/**
 * Calculates and applies tempo drift for "Lars Mode".
 */
export function updateLarsTempo(currentStep) {
    if (!gb.larsMode || !ctx.isPlaying) {
        if (conductorState.larsBpmOffset !== 0) {
            conductorState.larsBpmOffset = 0;
            updateBpmUI();
        }
        return;
    }

    // 1. Determine target drift based on section energy and global band intensity
    const total = arranger.totalSteps;
    if (total === 0) return;
    const modStep = currentStep % total;
    const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
    if (!entry) {
        return;
    }

    // Use section label energy as a base (-0.5 to +0.5 normalized drift)
    const labelEnergy = getSectionEnergy(entry.chord.sectionLabel); // 0.1 to 0.9
    
    // Blend with global band intensity (which includes macro-arc and randomness)
    // If the label is generic (e.g., "Section 1"), rely more on bandIntensity.
    const isGeneric = entry.chord.sectionLabel.toLowerCase().includes('section');
    const energy = isGeneric ? ctx.bandIntensity : (labelEnergy * 0.6 + ctx.bandIntensity * 0.4);
    
    // Lars Mode Intensity scales the maximum drift. 
    // Max drift at 100% intensity is +/- 15 BPM (based on live recording research).
    const maxDrift = 15 * gb.larsIntensity;
    let targetOffset = (energy - 0.5) * 2 * maxDrift;

    // "Fill Rush" - Drummers often push even harder during transitions/fills
    if (gb.fillActive) {
        targetOffset += (8 * gb.larsIntensity); // Increased to +8 BPM surge during fills
    }

    // 2. Smoothly ramp towards target offset
    const lerpFactor = gb.fillActive ? 0.08 : 0.03; // Snappier transitions
    conductorState.larsBpmOffset += (targetOffset - conductorState.larsBpmOffset) * lerpFactor;

    if (Math.abs(conductorState.larsBpmOffset) < 0.01) {
        // Only reset if we are very close to zero AND the target is zero
        if (Math.abs(targetOffset) < 0.01) {
            conductorState.larsBpmOffset = 0;
        }
    }

    updateBpmUI();
}

export function updateBpmUI() {
    if (!ui.bpmInput || !ui.bpmControlGroup) return;
    
    const baseBpm = ctx.bpm;
    const offset = conductorState.larsBpmOffset;
    const effectiveBpm = Math.round(baseBpm + offset);

    if (gb.larsMode && ctx.isPlaying) {
        ui.bpmControlGroup.classList.add('lars-active');
        
        // Calculate intensity of the color (0 to 1)
        // Saturate the color shift at 6 BPM offset
        const intensity = Math.min(1, Math.abs(offset) / 6);
        
        if (Math.abs(offset) > 0.1) {
            const isPushing = offset > 0;
            const targetColor = isPushing ? 'var(--blue)' : 'var(--red)';
            const mixPercent = 20 + Math.round(intensity * 80); 
            const blendedColor = `color-mix(in srgb, var(--text-color), ${targetColor} ${mixPercent}%)`;
            
            ui.bpmInput.style.color = blendedColor;
            
            if (ui.bpmLabel) {
                // On desktop (label visible), show secondary counter
                const direction = isPushing ? '↗' : '↘';
                ui.bpmLabel.textContent = `${effectiveBpm} ${direction}`;
                ui.bpmLabel.style.color = blendedColor;
            }
        } else {
            ui.bpmInput.style.color = '';
            if (ui.bpmLabel) {
                ui.bpmLabel.textContent = 'BPM';
                ui.bpmLabel.style.color = '';
            }
        }
    } else {
        ui.bpmControlGroup.classList.remove('lars-active');
        ui.bpmInput.style.color = '';
        if (ui.bpmLabel) {
            ui.bpmLabel.textContent = 'BPM';
            ui.bpmLabel.style.color = '';
        }
    }
}

export function checkSectionTransition(currentStep, stepsPerMeasure) {
    if (!gb.enabled) return;
    
    // Find where we are
    const total = arranger.totalSteps;
    if (total === 0) return;
    const modStep = currentStep % total;

    // Trigger major transitions (fills/intensity updates) only at the start of a measure.
    // We want to trigger when the measure about to be scheduled is the LAST measure of a section or the loop.
    if (modStep % stepsPerMeasure === 0) {
        const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
        if (!entry) return;

        const measureEnd = modStep + stepsPerMeasure;
        const isLoopEnd = measureEnd >= total;
        
        // Find the chord at the beginning of the NEXT section/loop iteration
        const nextChordIdx = (isLoopEnd) ? 0 : arranger.stepMap.findIndex(e => measureEnd >= e.start && measureEnd < e.end);
        const nextEntry = (nextChordIdx !== -1) ? arranger.stepMap[nextChordIdx] : null;

        if (nextEntry && (isLoopEnd || nextEntry.chord.sectionId !== entry.chord.sectionId)) {
            let shouldFill = true;

            // CHECK FOR SEAMLESS TRANSITION
            const nextSectionId = nextEntry.chord.sectionId;
            const nextSection = arranger.sections.find(s => s.id === nextSectionId);
            if (nextSection && nextSection.seamless) {
                shouldFill = false;
            }

            if (isLoopEnd && shouldFill) {
                conductorState.loopCount++;
                conductorState.formIteration++;
                
                if (arranger.totalSteps <= 64) {
                    const freq = ctx.bandIntensity > 0.75 ? 1 : (ctx.bandIntensity > 0.4 ? 2 : 4);
                    shouldFill = (conductorState.loopCount % freq === 0);
                }
            }

            if (shouldFill) {
                let targetEnergy = 0.5;
                const currentInt = ctx.bandIntensity;

                // --- 1. THE MACRO-ARC (5+ Minute Jam Logic) ---
                const grandCycle = conductorState.formIteration % 8;
                let macroFloor = 0.2, macroCeiling = 0.6;
                if (grandCycle === 0) { macroFloor = 0.15; macroCeiling = 0.45; }
                else if (grandCycle < 3) { macroFloor = 0.35; macroCeiling = 0.75; }
                else if (grandCycle < 5) { macroFloor = 0.60; macroCeiling = 1.0; }
                else if (grandCycle < 7) { macroFloor = 0.30; macroCeiling = 0.60; }
                else { macroFloor = 0.10; macroCeiling = 0.35; }

                // --- 2. THE LOCAL FUNCTIONAL ROLE ---
                if (conductorState.form && conductorState.form.sections) {
                    const nextSection = conductorState.form.sections.find(s => s.id === nextEntry.chord.sectionId);
                    if (nextSection) {
                        const role = nextSection.role;
                        switch (role) {
                            case 'Exposition': targetEnergy = macroFloor + 0.1; break;
                            case 'Development': targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1; break;
                            case 'Contrast': targetEnergy = (currentInt > (macroFloor + macroCeiling) / 2) ? macroFloor : macroCeiling; break;
                            case 'Build': targetEnergy = macroCeiling; break;
                            case 'Climax': targetEnergy = macroCeiling + 0.1; break;
                            case 'Recapitulation': targetEnergy = macroFloor + 0.2; break;
                            case 'Resolution': targetEnergy = macroFloor - 0.1; break;
                            default: targetEnergy = getSectionEnergy(nextSection.label);
                        }
                        if (nextSection.flux > 2.6) targetEnergy += 0.1;
                        if (nextSection.iteration === 2) targetEnergy += 0.1;
                        else if (nextSection.iteration >= 3) targetEnergy -= 0.15;
                    } else {
                        targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                    }
                } else {
                    targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                }

                targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
                targetEnergy += (Math.random() * 0.15 - 0.075);
                targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));

                if (isLoopEnd && ctx.autoIntensity) {
                    targetEnergy = Math.max(0.3, Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1)));
                }

                const fillSteps = generateProceduralFill(gb.genreFeel, ctx.bandIntensity, stepsPerMeasure);
                dispatch('TRIGGER_FILL', { steps: fillSteps, startStep: currentStep, length: stepsPerMeasure, crash: true });
                if (ui.visualFlash && ui.visualFlash.checked) triggerFlash(0.25);
                
                if (ctx.autoIntensity) {
                    conductorState.target = targetEnergy;
                    conductorState.stepSize = (conductorState.target - ctx.bandIntensity) / stepsPerMeasure; 
                }
            }
        }
    }

    // --- Harmonic Anticipation (Ghost Kick / Bark) ---
    // Runs at the very end of a chord if it leads into a new section or song end.
    const currentChordIdx = arranger.stepMap.findIndex(e => modStep >= e.start && modStep < e.end);
    if (currentChordIdx === -1) return;
    const entry = arranger.stepMap[currentChordIdx];

    const isChordEnd = (modStep === entry.end - 1);
    if (isChordEnd) {
        const nextEntry = arranger.stepMap[currentChordIdx + 1];
        const isTransition = !nextEntry || nextEntry.chord.sectionId !== entry.chord.sectionId;

        if (isTransition && !gb.fillActive && ctx.bandIntensity > 0.4) {
            dispatch('TRIGGER_FILL', {
                steps: { 0: [{ name: 'Kick', vel: 0.6 }, { name: 'Open', vel: 0.9 }] },
                startStep: currentStep,
                length: 1,
                crash: true
            });
        }
    }
}