import { groove, arranger, playback, chords, bass, soloist, harmony, vizState } from './state.js';
import { ui, renderMeasurePagination, showToast, initTabs } from './ui.js';
import { DRUM_PRESETS } from './presets.js';
import { saveCurrentState } from './persistence.js';
import { syncWorker, flushWorker } from './worker-client.js';
import { MIXER_GAIN_MULTIPLIERS } from './config.js';
import { applyTheme } from './app-controller.js';
import { analyzeFormUI } from './arranger-controller.js';
import { getStepsPerMeasure } from './utils.js';
import { restoreGains, killChordBus, killBassBus, killSoloistBus, killHarmonyBus, killDrumBus, killAllPianoNotes, killSoloistNote, killHarmonyNote, killBassNote, killDrumNote } from './engine.js';

let vizRef = null;

export function setInstrumentControllerRefs(scheduler, viz) {
    vizRef = viz;
}

export function switchMeasure(idx) {
    if (groove.currentMeasure === idx) return;
    groove.currentMeasure = idx;
    renderMeasurePagination(switchMeasure);
}

export function updateMeasures(val) {
    groove.measures = parseInt(val);
    if (groove.currentMeasure >= groove.measures) groove.currentMeasure = 0;
    renderMeasurePagination(switchMeasure);
    // renderGrid removed
    saveCurrentState();
}

export function loadDrumPreset(name) {
    let p = DRUM_PRESETS[name];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    const newInstruments = groove.instruments.map(inst => {
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const pattern = p[inst.name] || new Array(spm).fill(0);
        const newSteps = new Array(128).fill(0);
        pattern.forEach((v, i) => { if (i < 128) newSteps[i] = v; });
        return { ...inst, steps: newSteps };
    });

    Object.assign(groove, {
        lastDrumPreset: name,
        measures: p.measures || 1,
        currentMeasure: 0,
        instruments: newInstruments,
        swing: p.swing !== undefined ? p.swing : groove.swing,
        swingSub: p.sub || groove.swingSub
    });
    
    renderMeasurePagination(switchMeasure);
}

export function cloneMeasure() {
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const sourceOffset = groove.currentMeasure * spm;
    const newInstruments = groove.instruments.map(inst => {
        const newSteps = [...inst.steps];
        const pattern = inst.steps.slice(sourceOffset, sourceOffset + spm);
        for (let m = 0; m < groove.measures; m++) {
            if (m === groove.currentMeasure) continue;
            const targetOffset = m * spm;
            for (let i = 0; i < spm; i++) {
                newSteps[targetOffset + i] = pattern[i];
            }
        }
        return { ...inst, steps: newSteps };
    });
    Object.assign(groove, { instruments: newInstruments });
    showToast(`Measure ${groove.currentMeasure + 1} copied to all`);
}

export function clearDrumPresetHighlight() {
    groove.lastDrumPreset = null;
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

export function flushBuffers(primeSteps = 0) {
    // 1. Clear local buffers
    bass.buffer.clear();
    soloist.buffer.clear();
    chords.buffer.clear();
    harmony.buffer.clear();
    
    // 2. Kill current sounds and buses
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killDrumNote();
    
    killChordBus();
    killBassBus();
    killSoloistBus();
    killDrumBus();

    // 3. Prepare sync data for atomicity
    const syncData = {
        arranger: { 
            progression: arranger.progression, 
            stepMap: arranger.stepMap, 
            sectionMap: arranger.sectionMap,
            totalSteps: arranger.totalSteps,
            key: arranger.key,
            isMinor: arranger.isMinor,
            timeSignature: arranger.timeSignature
        },
        chords: { style: chords.style, octave: chords.octave, density: chords.density, enabled: chords.enabled, volume: chords.volume },
        bass: { style: bass.style, octave: bass.octave, enabled: bass.enabled, lastFreq: bass.lastFreq, volume: bass.volume },
        soloist: { style: soloist.style, octave: soloist.octave, enabled: soloist.enabled, lastFreq: soloist.lastFreq, volume: soloist.volume, doubleStops: soloist.doubleStops, sessionSteps: soloist.sessionSteps },
        harmony: { style: harmony.style, octave: harmony.octave, enabled: harmony.enabled, volume: harmony.volume, complexity: harmony.complexity },
        groove: { 
            genreFeel: groove.genreFeel, 
            enabled: groove.enabled, 
            volume: groove.volume,
            measures: groove.measures,
            swing: groove.swing,
            swingSub: groove.swingSub,
            instruments: groove.instruments.map(i => ({ name: i.name, steps: [...i.steps], muted: i.muted }))
        },
        playback: { bpm: playback.bpm, bandIntensity: playback.bandIntensity, complexity: playback.complexity, autoIntensity: playback.autoIntensity }
    };

    // 4. Trigger a BUNDLED worker flush
    flushWorker(playback.step, syncData, primeSteps);
    restoreGains();
}

export function flushBuffer(type, primeSteps = 0) {
    if (type === 'bass' || type === 'all') {
        if (bass.lastPlayedFreq !== null) bass.lastFreq = bass.lastPlayedFreq;
        bass.buffer.clear();
        killBassNote();
        killBassBus();
    }
    if (type === 'soloist' || type === 'all') {
        if (soloist.lastPlayedFreq !== null) soloist.lastFreq = soloist.lastPlayedFreq;
        soloist.buffer.clear();
        killSoloistNote();
        killSoloistBus();
    }
    if (type === 'chord' || type === 'all') {
        chords.buffer.clear();
        killAllPianoNotes();
        killChordBus();
    }
    if (type === 'harmony' || type === 'all') {
        harmony.buffer.clear();
        killHarmonyNote();
        killHarmonyBus();
    }
    if (type === 'groove' || type === 'all') {
        killDrumNote();
        killDrumBus();
    }
    
    // Solo flush (usually from UI toggles)
    if (type !== 'none') {
        flushWorker(playback.step, null, primeSteps);
    }
    restoreGains();
}

export function getPowerConfig() {
    return {
        chord: { state: chords, els: [ui.chordPowerBtn, ui.chordPowerBtnDesktop] },
        groove: { state: groove, els: [ui.groovePowerBtn, ui.groovePowerBtnDesktop], cleanup: () => document.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing')) },
        bass: { state: bass, els: [ui.bassPowerBtn, ui.bassPowerBtnDesktop] },
        soloist: { state: soloist, els: [ui.soloistPowerBtn, ui.soloistPowerBtnDesktop] },
        harmony: { state: harmony, els: [ui.harmonyPowerBtn, ui.harmonyPowerBtnDesktop] },
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

    if (['chord', 'bass', 'soloist', 'harmony'].includes(type)) {
        flushBuffer(type);
    } else {
        restoreGains(); // Ensure newly enabled buses are audible
    }

    if (c.state.enabled) {
        if (c.onEnable) c.onEnable();
        restoreGains();
    }

    saveCurrentState();
}

export function resetToDefaults() {
    playback.bpm = 100;
    arranger.notation = 'roman';
    arranger.key = 'C';
    arranger.timeSignature = '4/4';
    applyTheme('auto');
    arranger.sections.forEach(s => s.color = '#3b82f6');
    
    chords.volume = 0.5;
    chords.reverb = 0.3;
    chords.instrument = 'Clean';
    chords.octave = 65;
    chords.density = 'standard';
    chords.pianoRoots = false;
    chords.activeTab = 'smart';
    
    bass.volume = 0.45;
    bass.reverb = 0.05;
    bass.octave = 38;
    bass.style = 'smart';
    bass.activeTab = 'smart';
    
    soloist.volume = 0.5;
    soloist.reverb = 0.6;
    soloist.octave = 72;
    soloist.style = 'smart';
    soloist.activeTab = 'smart';
    soloist.doubleStops = false;
    
    harmony.volume = 0.4;
    harmony.reverb = 0.4;
    harmony.octave = 60;
    harmony.style = 'smart';
    harmony.complexity = 0.5;
    harmony.activeTab = 'smart';
    
    groove.volume = 0.5;
    groove.reverb = 0.2;
    groove.swing = 0;
    groove.swingSub = '8th';
    groove.genreFeel = 'Rock';
    groove.activeTab = 'smart';

    ui.bpmInput.value = 100;
    ui.keySelect.value = 'C';
    ui.timeSigSelect.value = '4/4';
    ui.notationSelect.value = 'roman';
    ui.densitySelect.value = 'standard';
    ui.chordVol.value = 0.5;
    ui.chordReverb.value = 0.3;
    ui.bassVol.value = 0.45;
    ui.bassReverb.value = 0.05;
    ui.soloistVol.value = 0.5;
    ui.soloistReverb.value = 0.6;
    ui.harmonyVol.value = 0.4;
    ui.harmonyReverb.value = 0.4;
    ui.harmonyComplexity.value = 0.5;
    if (ui.harmonyComplexityValue) ui.harmonyComplexityValue.textContent = '50%';
    ui.drumVol.value = 0.5;
    ui.drumReverb.value = 0.2;
    ui.swingSlider.value = 0;
    ui.swingBase.value = '8th';
    ui.masterVol.value = 0.5;
    ui.countIn.checked = true;
    ui.metronome.checked = false;
    ui.visualFlash.checked = false;
    ui.hapticCheck.checked = false;
    if (playback.audio) {
        const time = playback.audio.currentTime;
        const rampTime = time + 0.04;
        
        const resetNodes = [
            { node: playback.masterGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.master },
            { node: playback.chordsGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.chords },
            { node: playback.bassGain, target: 0.45 * MIXER_GAIN_MULTIPLIERS.bass },
            { node: playback.soloistGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.soloist },
            { node: playback.harmoniesGain, target: 0.4 * MIXER_GAIN_MULTIPLIERS.harmonies },
            { node: playback.drumsGain, target: 0.5 * MIXER_GAIN_MULTIPLIERS.drums }
        ];

        resetNodes.forEach(rn => {
            if (rn.node) {
                rn.node.gain.setValueAtTime(rn.node.gain.value, time);
                rn.node.gain.exponentialRampToValueAtTime(Math.max(0.0001, rn.target), rampTime);
            }
        });
    }

    playback.bandIntensity = 0.5;
    playback.complexity = 0.3;
    playback.autoIntensity = true;
    playback.conductorVelocity = 1.0;
    if (ui.intensitySlider) {
        ui.intensitySlider.value = 50;
        if (ui.intensityValue) ui.intensityValue.textContent = '50%';
        ui.intensitySlider.disabled = true;
        ui.intensitySlider.style.opacity = 0.5;
    }
    if (ui.autoIntensityCheck) ui.autoIntensityCheck.checked = true;
    if (ui.soloistDoubleStops) ui.soloistDoubleStops.checked = false;
    if (ui.complexitySlider) {
        ui.complexitySlider.value = 30;
        if (ui.complexityValue) ui.complexityValue.textContent = 'Low';
    }

    // renderSections removed
    analyzeFormUI();
    // renderChordVisualizer removed
    syncWorker();
    flushBuffers();
    
    groove.instruments.forEach(inst => {
        inst.steps = new Array(128).fill(0);
        inst.muted = false;
    });
    loadDrumPreset('Standard');
    // renderGrid removed 
    initTabs();

    document.querySelectorAll('.genre-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.genre === groove.genreFeel);
    });

    saveCurrentState();
    showToast("Settings reset");
}