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
        ctx.bandIntensity += conductorState.stepSize;
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
        let nextIndex = currentIndex + 1;
        
        if (!nextEntry) {
            nextEntry = arranger.stepMap[0]; // Loop back to start
            isLoopEnd = true;
            nextIndex = 0;
        }
        
        if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopEnd) {
            let shouldFill = true;
            if (isLoopEnd) {
                conductorState.loopCount++;
                if (arranger.totalSteps <= 64) {
                    const freq = ctx.bandIntensity > 0.75 ? 1 : (ctx.bandIntensity > 0.4 ? 2 : 4);
                    shouldFill = (conductorState.loopCount % freq === 0);
                }
            }

            if (shouldFill) {
                let targetEnergy = 0.5;
                if (conductorState.form && conductorState.form.roles[nextIndex]) {
                    const role = conductorState.form.roles[nextIndex];
                    const currentInt = ctx.bandIntensity;
                    
                    switch (role) {
                        case 'Exposition': targetEnergy = 0.45; break;
                        case 'Development': targetEnergy = Math.min(0.7, currentInt + 0.15); break;
                        case 'Contrast': targetEnergy = (currentInt > 0.6) ? 0.4 : 0.8; break;
                        case 'Build': targetEnergy = 0.75; break;
                        case 'Climax': targetEnergy = 0.95; break;
                        case 'Recapitulation': targetEnergy = 0.6; break;
                        case 'Resolution': targetEnergy = 0.3; break;
                        default: targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                    }
                } else {
                    targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                }

                if (isLoopEnd && ctx.autoIntensity) {
                    targetEnergy = Math.max(0.3, Math.min(0.9, targetEnergy + (Math.random() * 0.2 - 0.1)));
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
                    conductorState.nextDecisionStep = currentStep + stepsPerMeasure * 4; 
                }
            }
        }
    }
}