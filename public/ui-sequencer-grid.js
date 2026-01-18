import { arranger, gb } from './state.js';
import { getStepsPerMeasure, getStepInfo } from './utils.js';
import { clearDrumPresetHighlight } from './instrument-controller.js';
import { TIME_SIGNATURES } from './config.js';
import { UIStore } from './ui-store.js';

/**
 * Handles the rendering and state of the Drum Sequencer Grid UI.
 */
export function renderGrid(ui, skipScroll = false) {
    if (!ui.sequencerGrid) return;
    const currentScroll = ui.sequencerGrid.scrollLeft;
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const totalSteps = gb.measures * spm;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    
    const existingTracks = Array.from(ui.sequencerGrid.querySelectorAll('.track:not(.label-row)'));
    
    // --- 1. RENDER INSTRUMENT TRACKS ---
    gb.instruments.forEach((inst, idx) => {
        let row = existingTracks[idx];
        let stepsContainer;

        if (!row) {
            row = document.createElement('div');
            row.className = 'track';
            
            const label = document.createElement('div');
            label.className = 'track-header';
            row.appendChild(label);
            
            stepsContainer = document.createElement('div');
            stepsContainer.className = 'steps';
            row.appendChild(stepsContainer);
            
            ui.sequencerGrid.insertBefore(row, ui.sequencerGrid.lastElementChild);
        } else {
            stepsContainer = row.querySelector('.steps');
        }

        const label = row.querySelector('.track-header');
        label.innerHTML = ''; // Clear to rebuild with mute button
        
        const symbol = document.createElement('span');
        symbol.className = 'track-symbol';
        symbol.textContent = inst.symbol || inst.name.charAt(0);
        symbol.title = `Audition ${inst.name}`;
        symbol.onclick = (e) => {
            e.stopPropagation();
            import('./engine.js').then(({ initAudio, playDrumSound }) => {
                import('./state.js').then(({ ctx }) => {
                    initAudio();
                    playDrumSound(inst.name, ctx.audio.currentTime, 1.0);
                });
            });
            symbol.classList.add('auditioning');
            setTimeout(() => symbol.classList.remove('auditioning'), 100);
        };
        
        const muteBtn = document.createElement('button');
        muteBtn.className = `mute-toggle ${inst.muted ? 'active' : ''}`;
        muteBtn.textContent = 'M';
        muteBtn.title = inst.muted ? 'Unmute' : 'Mute';
        muteBtn.onclick = (e) => {
            e.stopPropagation();
            inst.muted = !inst.muted;
            muteBtn.classList.toggle('active', inst.muted);
            symbol.classList.toggle('muted', inst.muted);
        };

        label.appendChild(symbol);
        label.appendChild(muteBtn);
        
        label.className = 'track-header';

        stepsContainer.style.gridTemplateColumns = `repeat(${totalSteps}, 1fr)`;

        const existingSteps = Array.from(stepsContainer.children);
        if (existingSteps.length !== totalSteps) {
            stepsContainer.innerHTML = '';
            for (let i = 0; i < totalSteps; i++) {
                const step = document.createElement('div');
                step.className = 'step';
                stepsContainer.appendChild(step);
            }
        }

        const steps = Array.from(stepsContainer.children);
        for (let i = 0; i < totalSteps; i++) {
            const step = steps[i];
            step.className = 'step';
            
            const stepInfo = getStepInfo(i, ts);
            if (stepInfo.isGroupStart) step.classList.add('group-marker');
            if (stepInfo.isBeatStart) step.classList.add('beat-marker');
            
            if (inst.steps[i] === 1) step.classList.add('active');
            if (inst.steps[i] === 2) step.classList.add('accented');
            
            step.onclick = () => {
                if (inst.steps[i] === 0) inst.steps[i] = 1;
                else if (inst.steps[i] === 1) inst.steps[i] = 2;
                else inst.steps[i] = 0;
                
                step.classList.toggle('active', inst.steps[i] === 1);
                step.classList.toggle('accented', inst.steps[i] === 2);
                clearDrumPresetHighlight();
            };
        }
    });

    while (existingTracks.length > gb.instruments.length) {
        existingTracks.pop().remove();
    }
    
    // --- 2. RENDER LABEL ROW ---
    let labelRow = ui.sequencerGrid.querySelector('.label-row');
    if (!labelRow) {
        labelRow = document.createElement('div');
        labelRow.className = 'track label-row';
        const spacer = document.createElement('div');
        spacer.className = 'track-header label-header';
        labelRow.appendChild(spacer);
        const labelSteps = document.createElement('div');
        labelSteps.className = 'steps';
        labelRow.appendChild(labelSteps);
        ui.sequencerGrid.appendChild(labelRow);
    }
    
    const labelStepsContainer = labelRow.querySelector('.steps');
    labelStepsContainer.style.gridTemplateColumns = `repeat(${totalSteps}, 1fr)`;
    
    const existingLabels = Array.from(labelStepsContainer.children);
    if (existingLabels.length !== totalSteps) {
        labelStepsContainer.innerHTML = '';
        for (let i = 0; i < totalSteps; i++) {
            labelStepsContainer.appendChild(document.createElement('div'));
        }
    }
    
    const labels = Array.from(labelStepsContainer.children);
    for (let i = 0; i < totalSteps; i++) {
        const lbl = labels[i];
        lbl.className = 'step-label';
        const stepInfo = getStepInfo(i, ts);
        if (stepInfo.isBeatStart) {
            lbl.textContent = stepInfo.beatIndex + 1;
            lbl.classList.add('beat-start');
            if (stepInfo.isGroupStart) lbl.classList.add('group-start');
        } else {
            lbl.textContent = (i % ts.stepsPerBeat) + 1;
        }
    }

    if (!skipScroll) {
        ui.sequencerGrid.scrollLeft = currentScroll;
    }

    renderGridState(ui);
}

export function renderGridState(ui) {
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const totalSteps = gb.measures * spm;
    const rows = ui.sequencerGrid.querySelectorAll('.track:not(.label-row)');
    gb.instruments.forEach((inst, rowIdx) => {
        if (!rows[rowIdx]) return;
        const steps = rows[rowIdx].querySelectorAll('.step');
        steps.forEach((step, i) => {
            step.classList.toggle('active', inst.steps[i] === 1);
            step.classList.toggle('accented', inst.steps[i] === 2);
        });
    });
    
    UIStore.cachedSteps = [];
    for (let i = 0; i < totalSteps; i++) {
        const activeInStep = [];
        gb.instruments.forEach((inst, rowIdx) => {
            if (inst.steps[i] > 0 && rows[rowIdx]) {
                const stepEl = rows[rowIdx].querySelectorAll('.step')[i];
                if (stepEl) activeInStep.push(stepEl);
            }
        });
        UIStore.cachedSteps[i] = activeInStep;
    }
}
