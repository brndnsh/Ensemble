import { ctx, cb, sb, gb, arranger } from './state.js';
import { ui, triggerFlash } from './ui.js';
import { getSectionEnergy } from './form-analysis.js';
import { debounceSaveState } from './persistence.js';
import { generateProceduralFill } from './fills.js';

export const conductorState = { 
    target: 0.5, 
    nextDecisionStep: 0, 
    stepSize: 0.0005,
    loopCount: 0,
    formIteration: 0, // Tracks how many times the ENTIRE song has looped
    form: null
};

export function applyConductor() {
    const intensity = ctx.bandIntensity; // 0.0 - 1.0
    const complexity = ctx.complexity;   // 0.0 - 1.0

    // --- 1. Master Dynamics ---
    if (intensity < 0.4) cb.density = 'thin';
    else if (intensity > 0.85) cb.density = 'rich';
    else cb.density = 'standard';
    if (ui.densitySelect) ui.densitySelect.value = cb.density;

    ctx.conductorVelocity = 0.8 + (intensity * 0.3); // 0.8x to 1.1x

    // --- 2. Complexity / Busyness ---
    sb.hookRetentionProb = 0.2 + (complexity * 0.6);

    // --- 3. Musical Conversation (Soloist Density) ---
    // If soloist is active, the accompanist should "listen" and back off.
    const isSoloistBusy = sb.enabled && sb.busySteps > 0;
    ctx.intent.density = isSoloistBusy ? (0.3 * (1 - complexity)) : (0.5 + intensity * 0.4);

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
        ctx.bandIntensity += ((ctx.bandIntensity < conductorState.target) ? Math.abs(conductorState.stepSize) : -Math.abs(conductorState.stepSize)) * multiplier;
        ctx.bandIntensity = Math.max(0.01, Math.min(1.0, ctx.bandIntensity));
        
        const val = Math.round(ctx.bandIntensity * 100);
        if (ui.intensitySlider) {
            if (parseInt(ui.intensitySlider.value) !== val) {
                ui.intensitySlider.value = val;
                if (ui.intensityValue) ui.intensityValue.textContent = `${val}%`;
            }
        }
        applyConductor();
    }
}

export function checkSectionTransition(currentStep, stepsPerMeasure) {
    if (!gb.enabled) return;
    
    // Find where we are
    const total = arranger.totalSteps;
    if (total === 0) return;
    const modStep = currentStep % total;
    
    // Find current section entry
    const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
    if (!entry) return;
    
    const sectionEnd = entry.end;
    const fillStart = sectionEnd - stepsPerMeasure;
    
    if (modStep === fillStart) {
        const currentIndex = arranger.stepMap.indexOf(entry);
        let nextEntry = arranger.stepMap[currentIndex + 1];
        let isLoopEnd = false;
        
        if (!nextEntry) {
            nextEntry = arranger.stepMap[0]; // Loop back to start
            isLoopEnd = true;
        }
        
        if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopEnd) {
            let shouldFill = true;
            if (isLoopEnd) {
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
                // We define a 8-cycle 'Grand Story' (approx 5-10 mins depending on song length)
                const grandCycle = conductorState.formIteration % 8;
                let macroFloor = 0.2;
                let macroCeiling = 0.6;

                if (grandCycle === 0) { macroFloor = 0.15; macroCeiling = 0.45; } // Warm up
                else if (grandCycle < 3) { macroFloor = 0.35; macroCeiling = 0.75; } // Building
                else if (grandCycle < 5) { macroFloor = 0.60; macroCeiling = 1.0; }  // The Peak
                else if (grandCycle < 7) { macroFloor = 0.30; macroCeiling = 0.60; } // The Cool Down
                else { macroFloor = 0.10; macroCeiling = 0.35; } // The Fade/Resolution

                // --- 2. THE LOCAL FUNCTIONAL ROLE ---
                if (conductorState.form && conductorState.form.sections) {
                    const nextSection = conductorState.form.sections.find(s => s.id === nextEntry.chord.sectionId);
                    
                    if (nextSection) {
                        const role = nextSection.role;
                        
                        switch (role) {
                            case 'Exposition': targetEnergy = macroFloor + 0.1; break;
                            case 'Development': targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1; break;
                            case 'Contrast': 
                                // Contrast pushes against the current macro-trend
                                targetEnergy = (currentInt > (macroFloor + macroCeiling) / 2) ? macroFloor : macroCeiling; 
                                break;
                            case 'Build': targetEnergy = macroCeiling; break;
                            case 'Climax': targetEnergy = macroCeiling + 0.1; break;
                            case 'Recapitulation': targetEnergy = macroFloor + 0.2; break;
                            case 'Resolution': targetEnergy = macroFloor - 0.1; break;
                            default: targetEnergy = getSectionEnergy(nextSection.label);
                        }

                        // Flux & Iteration adjustments (local variety)
                        if (nextSection.flux > 2.6) targetEnergy += 0.1;
                        if (nextSection.iteration === 2) targetEnergy += 0.1;
                        else if (nextSection.iteration >= 3) targetEnergy -= 0.15;
                    } else {
                        targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                    }
                } else {
                    targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                }

                // Clamp to the Macro-Arc boundaries
                targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));

                // Final human performance variance
                targetEnergy += (Math.random() * 0.15 - 0.075);
                targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));

                if (isLoopEnd && ctx.autoIntensity) {
                    // Add a bit of "performance drift" on loops
                    targetEnergy = Math.max(0.3, Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1)));
                }

                gb.fillSteps = generateProceduralFill(gb.genreFeel, ctx.bandIntensity, stepsPerMeasure);
                gb.fillActive = true;
                gb.fillStartStep = currentStep;
                gb.fillLength = stepsPerMeasure;
                gb.pendingCrash = true;
                
                if (ui.visualFlash && ui.visualFlash.checked) {
                    triggerFlash(0.25);
                }
                
                if (ctx.autoIntensity) {
                    conductorState.target = targetEnergy;
                    const rampSteps = stepsPerMeasure;
                    const diff = conductorState.target - ctx.bandIntensity;
                    conductorState.stepSize = diff / rampSteps; 
                }
            }
        }
    }
}