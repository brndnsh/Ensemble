import { arranger, groove } from './state.js';
import { getStepsPerMeasure, getStepInfo } from './utils.js';
import { clearDrumPresetHighlight } from './instrument-controller.js';
import { TIME_SIGNATURES } from './config.js';
import { UIStore } from './ui-store.js';

export function initSequencerHandlers(ui) {
    if (!ui.sequencerGrid) return;

    let isDragging = false;
    let dragType = 0; // The target value we are painting (0, 1, or 2)

    ui.sequencerGrid.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target.classList.contains('step')) {
            isDragging = true;
            const instIdx = parseInt(target.dataset.instIdx);
            const stepIdx = parseInt(target.dataset.stepIdx);
            const inst = groove.instruments[instIdx];
            if (!inst) return;

            // Toggle logic for the first click
            if (inst.steps[stepIdx] === 0) dragType = 1;
            else if (inst.steps[stepIdx] === 1) dragType = 2;
            else dragType = 0;

            inst.steps[stepIdx] = dragType;
            target.classList.toggle('active', dragType === 1);
            target.classList.toggle('accented', dragType === 2);
            clearDrumPresetHighlight();
        }
    });

    ui.sequencerGrid.addEventListener('mouseover', (e) => {
        if (!isDragging) return;
        const target = e.target;
        if (target.classList.contains('step')) {
            const instIdx = parseInt(target.dataset.instIdx);
            const stepIdx = parseInt(target.dataset.stepIdx);
            const inst = groove.instruments[instIdx];
            if (!inst) return;

            if (inst.steps[stepIdx] !== dragType) {
                inst.steps[stepIdx] = dragType;
                target.classList.toggle('active', dragType === 1);
                target.classList.toggle('accented', dragType === 2);
                clearDrumPresetHighlight();
            }
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    ui.sequencerGrid.addEventListener('click', (e) => {
        const target = e.target;
        
        // 1. Handle Step Clicks (Already handled by mousedown + drag, 
        // but we keep the other click handlers for audition/mute)
        if (target.classList.contains('step')) {
            return;
        }

        // 2. Handle Track Symbol (Audition)
        if (target.classList.contains('track-symbol')) {
            const instIdx = parseInt(target.dataset.instIdx);
            const inst = groove.instruments[instIdx];
            if (!inst) return;

            import('./engine.js').then(({ initAudio, playDrumSound }) => {
                import('./state.js').then(({ playback }) => {
                    initAudio();
                    playDrumSound(inst.name, playback.audio.currentTime, 1.0);
                });
            });
            target.classList.add('auditioning');
            setTimeout(() => target.classList.remove('auditioning'), 100);
            return;
        }

        // 3. Handle Mute Toggle
        if (target.classList.contains('mute-toggle')) {
            const instIdx = parseInt(target.dataset.instIdx);
            const inst = groove.instruments[instIdx];
            if (!inst) return;

            inst.muted = !inst.muted;
            target.classList.toggle('active', inst.muted);
            const symbol = target.parentElement.querySelector('.track-symbol');
            if (symbol) symbol.classList.toggle('muted', inst.muted);
            return;
        }
    });

    ui.sequencerGrid.addEventListener('keydown', (e) => {
        const target = e.target;
        if (target.classList.contains('step') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            target.click();
        }
    });
}

/**
 * Handles the rendering and state of the Drum Sequencer Grid UI.
 */
export function renderGrid(ui, skipScroll = false) {
    if (!ui.sequencerGrid) return;
    const currentScroll = ui.sequencerGrid.scrollLeft;
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const totalSteps = groove.measures * spm;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    
    const existingTracks = Array.from(ui.sequencerGrid.querySelectorAll('.track:not(.label-row)'));
    
    // --- 1. RENDER INSTRUMENT TRACKS ---
    groove.instruments.forEach((inst, idx) => {
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
        symbol.dataset.instIdx = idx;
        symbol.textContent = inst.symbol || inst.name.charAt(0);
        symbol.title = `Audition ${inst.name}`;
        
        const muteBtn = document.createElement('button');
        muteBtn.className = `mute-toggle ${inst.muted ? 'active' : ''}`;
        muteBtn.dataset.instIdx = idx;
        muteBtn.textContent = 'M';
        muteBtn.title = inst.muted ? 'Unmute' : 'Mute';

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
            step.dataset.instIdx = idx;
            step.dataset.stepIdx = i;
            step.role = 'button';
            step.tabIndex = 0;

            const status = inst.steps[i] === 1 ? 'active' : (inst.steps[i] === 2 ? 'accented' : 'inactive');
            step.setAttribute('aria-label', `${inst.name}, step ${i + 1}, ${status}`);
            
            const stepInfo = getStepInfo(i, ts);
            if (stepInfo.isGroupStart) step.classList.add('group-marker');
            if (stepInfo.isBeatStart) step.classList.add('beat-marker');
            
            if (inst.steps[i] === 1) step.classList.add('active');
            if (inst.steps[i] === 2) step.classList.add('accented');
        }
    });

    while (existingTracks.length > groove.instruments.length) {
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
    const totalSteps = groove.measures * spm;
    const rows = ui.sequencerGrid.querySelectorAll('.track:not(.label-row)');
    groove.instruments.forEach((inst, rowIdx) => {
        if (!rows[rowIdx]) return;
        const steps = rows[rowIdx].querySelectorAll('.step');
        steps.forEach((step, i) => {
            step.classList.toggle('active', inst.steps[i] === 1);
            step.classList.toggle('accented', inst.steps[i] === 2);

            const status = inst.steps[i] === 1 ? 'active' : (inst.steps[i] === 2 ? 'accented' : 'inactive');
            step.setAttribute('aria-label', `${inst.name}, step ${i + 1}, ${status}`);
        });
    });
    
    UIStore.cachedSteps = [];
    for (let i = 0; i < totalSteps; i++) {
        const activeInStep = [];
        groove.instruments.forEach((inst, rowIdx) => {
            if (inst.steps[i] > 0 && rows[rowIdx]) {
                const stepEl = rows[rowIdx].querySelectorAll('.step')[i];
                if (stepEl) activeInStep.push(stepEl);
            }
        });
        UIStore.cachedSteps[i] = activeInStep;
    }
}
