import { gb, arranger, ctx, cb, bb, sb, vizState } from './state.js';
import { ui, renderGrid, renderMeasurePagination, renderGridState, showToast, updateOctaveLabel, renderSections, renderChordVisualizer, initTabs } from './ui.js';
import { DRUM_PRESETS } from './presets.js';
import { saveCurrentState } from './persistence.js';
import { syncWorker, flushWorker } from './worker-client.js';
import { MIXER_GAIN_MULTIPLIERS } from './config.js';
import { applyTheme, setBpm } from './app-controller.js';
import { onSectionUpdate, onSectionDelete, onSectionDuplicate, analyzeFormUI } from './arranger-controller.js';
import { getStepsPerMeasure } from './utils.js';
import { killAllNotes, restoreGains, killChordBus, killBassBus, killSoloistBus, killDrumBus, killAllPianoNotes, killSoloistNote, killBassNote, killDrumNote } from './engine.js';

let schedulerRef = null;
let vizRef = null;

export function setInstrumentControllerRefs(scheduler, viz) {
    schedulerRef = scheduler;
    vizRef = viz;
}

export function switchMeasure(idx, skipScroll = false) {
    if (gb.currentMeasure === idx) return;
    gb.currentMeasure = idx;
    renderMeasurePagination(switchMeasure);
    renderGrid(skipScroll);
}

export function updateMeasures(val) {
    gb.measures = parseInt(val);
    if (gb.currentMeasure >= gb.measures) gb.currentMeasure = 0;
    renderMeasurePagination(switchMeasure);
    renderGrid();
    saveCurrentState();
}

export function loadDrumPreset(name) {
    let p = DRUM_PRESETS[name];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    gb.lastDrumPreset = name;
    gb.measures = p.measures || 1; 
    gb.currentMeasure = 0;
    ui.drumBarsSelect.value = String(gb.measures);
    
    if (p.swing !== undefined) { gb.swing = p.swing; ui.swingSlider.value = p.swing; }
    if (p.sub) { gb.swingSub = p.sub; ui.swingBase.value = p.sub; }
    gb.instruments.forEach(inst => {
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const pattern = p[inst.name] || new Array(spm).fill(0);
        inst.steps.fill(0);
        pattern.forEach((v, i) => { if (i < 128) inst.steps[i] = v; });
    });
    renderMeasurePagination(switchMeasure);
    renderGrid();
}

export function cloneMeasure() {
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const sourceOffset = gb.currentMeasure * spm;
    gb.instruments.forEach(inst => {
        const pattern = inst.steps.slice(sourceOffset, sourceOffset + spm);
        for (let m = 0; m < gb.measures; m++) {
            if (m === gb.currentMeasure) continue;
            const targetOffset = m * spm;
            for (let i = 0; i < spm; i++) {
                inst.steps[targetOffset + i] = pattern[i];
            }
        }
    });
    showToast(`Measure ${gb.currentMeasure + 1} copied to all`);
    renderGridState();
}

export function clearDrumPresetHighlight() {
    gb.lastDrumPreset = null;
    document.querySelectorAll('.drum-preset-chip').forEach(c => c.classList.remove('active'));
}

let tapTimes = [];
export function handleTap(setBpmRef) {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length-1] > 2000) tapTimes = [];
    tapTimes.push(now);
    
    if (tapTimes.length > 8) tapTimes.shift();

    if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i-1]);
        }
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        setBpmRef(Math.round(60000 / avg));
    }
}

export function flushBuffers() {
    flushBuffer('chord');
    flushBuffer('bass');
    flushBuffer('soloist');
}

export function flushBuffer(type) {
    if (type === 'bass' || type === 'all') {
        if (bb.lastPlayedFreq !== null) bb.lastFreq = bb.lastPlayedFreq;
        bb.buffer.clear();
        killBassNote();
        killBassBus();
    }
    if (type === 'soloist' || type === 'all') {
        if (sb.lastPlayedFreq !== null) sb.lastFreq = sb.lastPlayedFreq;
        sb.buffer.clear();
        killSoloistNote();
        killSoloistBus();
    }
    if (type === 'chord' || type === 'all') {
        cb.buffer.clear();
        killAllPianoNotes();
        killChordBus();
    }
    if (type === 'groove' || type === 'all') {
        killDrumNote();
        killDrumBus();
    }
    
    flushWorker(ctx.step);
}

export function getPowerConfig() {
    return {
        chord: { state: cb, els: [ui.chordPowerBtn, ui.chordPowerBtnDesktop] },
        groove: { state: gb, els: [ui.groovePowerBtn, ui.groovePowerBtnDesktop], cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
        bass: { state: bb, els: [ui.bassPowerBtn, ui.bassPowerBtnDesktop] },
        soloist: { state: sb, els: [ui.soloistPowerBtn, ui.soloistPowerBtnDesktop] },
        viz: { 
            state: vizState, 
            els: [ui.vizPowerBtn], 
            cleanup: () => { 
                if (vizRef) vizRef.clear(); 
                if (ui.vizPanel) ui.vizPanel.classList.add('collapsed');
            },
            onEnable: () => {
                if (ui.vizPanel) ui.vizPanel.classList.remove('collapsed');
            }
        }
    };
}

export function initializePowerButtons() {
    const config = getPowerConfig();
    Object.keys(config).forEach(type => {
        const c = config[type];
        c.els.forEach(el => {
            if (el) el.classList.toggle('active', !!c.state.enabled);
        });
        
        // Ensure panels match minimized state on load
        if (type === 'viz') {
            if (ui.vizPanel) ui.vizPanel.classList.toggle('collapsed', !c.state.enabled);
        }
    });
}

export function togglePower(type) {
    const config = getPowerConfig();
    const c = config[type];
    if (!c) return;
    
    c.state.enabled = !c.state.enabled;
    
    c.els.forEach(el => {
        if (el) el.classList.toggle('active', c.state.enabled);
    });
    
    if (!c.state.enabled && c.cleanup) {
        c.cleanup();
    } 
    
    syncWorker(); // Essential: tell worker about state change BEFORE flushing/requesting new notes

    if (['chord', 'bass', 'soloist'].includes(type)) {
        flushBuffer(type);
    } else {
        restoreGains(); // Ensure newly enabled buses are audible
    }

    if (c.state.enabled) {
        if (c.onEnable) c.onEnable();
        restoreGains();
    }
}

export function resetToDefaults() {
    ctx.bpm = 100;
    arranger.notation = 'roman';
    arranger.key = 'C';
    arranger.timeSignature = '4/4';
    applyTheme('auto');
    arranger.sections.forEach(s => s.color = '#3b82f6');
    
    cb.volume = 0.5;
    cb.reverb = 0.3;
    cb.instrument = 'Clean';
    cb.octave = 65;
    cb.density = 'standard';
    
    bb.volume = 0.45;
    bb.reverb = 0.05;
    bb.octave = 38;
    bb.style = 'smart';
    
    sb.volume = 0.5;
    sb.reverb = 0.6;
    sb.octave = 72;
    sb.style = 'smart';
    
    gb.volume = 0.5;
    gb.reverb = 0.2;
    gb.swing = 0;
    gb.swingSub = '8th';
    gb.genreFeel = 'Rock';
    gb.activeTab = 'smart';

    ui.bpmInput.value = 100;
    ui.keySelect.value = 'C';
    ui.timeSigSelect.value = '4/4';
    ui.notationSelect.value = 'roman';
    ui.densitySelect.value = 'standard';
    ui.octave.value = 65;
    ui.bassOctave.value = 38;
    ui.soloistOctave.value = 72;
    ui.chordVol.value = 0.5;
    ui.chordReverb.value = 0.3;
    ui.bassVol.value = 0.45;
    ui.bassReverb.value = 0.05;
    ui.soloistVol.value = 0.5;
    ui.soloistReverb.value = 0.6;
    ui.drumVol.value = 0.5;
    ui.drumReverb.value = 0.2;
    ui.swingSlider.value = 0;
    ui.swingBase.value = '8th';
    ui.masterVol.value = 0.5;
    ui.countIn.checked = true;
    ui.metronome.checked = false;
    ui.visualFlash.checked = false;
    ui.hapticCheck.checked = false;
    if (ctx.audio) {
        const time = ctx.audio.currentTime;
        const rampTime = time + 0.04;
        
        const resetNodes = [
            { node: ctx.masterGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.master },
            { node: ctx.chordsGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.chords },
            { node: ctx.bassGain, target: 0.45 * MIXER_GAIN_MULTIPLIERS.bass },
            { node: ctx.soloistGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.soloist },
            { node: ctx.drumsGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.drums }
        ];

        resetNodes.forEach(rn => {
            if (rn.node) {
                rn.node.gain.setValueAtTime(rn.node.gain.value, time);
                rn.node.gain.exponentialRampToValueAtTime(Math.max(0.0001, rn.target), rampTime);
            }
        });
    }

    ctx.bandIntensity = 0.5;
    ctx.complexity = 0.3;
    ctx.autoIntensity = true;
    ctx.conductorVelocity = 1.0;
    if (ui.intensitySlider) {
        ui.intensitySlider.value = 50;
        if (ui.intensityValue) ui.intensityValue.textContent = '50%';
        ui.intensitySlider.disabled = true;
        ui.intensitySlider.style.opacity = 0.5;
    }
    if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = true;
    if (ui.complexitySlider) {
        ui.complexitySlider.value = 30;
        if (ui.complexityValue) ui.complexityValue.textContent = 'Low';
    }

    updateOctaveLabel(ui.octaveLabel, cb.octave);
    updateOctaveLabel(ui.bassOctaveLabel, bb.octave, ui.bassHeaderReg);
    updateOctaveLabel(ui.soloistOctaveLabel, sb.octave, ui.soloistHeaderReg);
    
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    analyzeFormUI();
    renderChordVisualizer();
    syncWorker();
    flushBuffers();
    
    gb.instruments.forEach(inst => {
        inst.steps = new Array(128).fill(0);
        inst.muted = false;
    });
    loadDrumPreset('Standard');
    renderGrid(); 
    initTabs();

    document.querySelectorAll('.genre-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.genre === gb.genreFeel);
    });

    saveCurrentState();
    showToast("Settings reset");
}