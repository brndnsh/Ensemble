import { ctx, cb, bb, sb, hb, gb, arranger, subscribe } from './state.js';
import { initUI, renderChordVisualizer, renderGrid, renderSections, initTabs, renderMeasurePagination, setupPanelMenus } from './ui.js';
import { initAudio, playNote } from './engine.js';
import { APP_VERSION } from './config.js';
import { validateProgression } from './chords.js';
import { UnifiedVisualizer } from './visualizer.js';
import { initWorker, syncWorker } from './worker-client.js';
import { initPWA } from './pwa.js';
import { renderUserPresets, renderUserDrumPresets } from './persistence.js';
import { analyzeFormUI, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, onSectionUpdate, onSectionDelete, onSectionDuplicate } from './arranger-controller.js';
import { switchMeasure, loadDrumPreset, setInstrumentControllerRefs, initializePowerButtons, getPowerConfig } from './instrument-controller.js';
import { setupPresets, setupUIHandlers } from './ui-controller.js';
import { draw } from './animation-loop.js';
import { scheduler, togglePlay } from './scheduler-core.js';
import { hydrateState, loadFromUrl } from './state-hydration.js';

let viz;

/**
 * Diagnostic: Enables detailed logging of worker/scheduler interactions.
 */
window.enableWorkerLogging = (enabled) => {
    ctx.workerLogging = enabled;
    console.log(`[Worker] Logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

function init() {
    try {
        // --- WORKER INIT ---
        initWorker(() => scheduler(), (notes) => { 
            const sbUpdatedSteps = new Set();
            notes.forEach(n => { 
                if (n.module === 'bb') bb.buffer.set(n.step, n); 
                else if (n.module === 'sb') {
                    // ENFORCE MONOPHONIC: If double stops are disabled, skip additional notes for the same step
                    if (!sb.doubleStops && sb.buffer.has(n.step)) return;

                    if (!sbUpdatedSteps.has(n.step)) {
                        sb.buffer.set(n.step, []);
                        sbUpdatedSteps.add(n.step);
                    }
                    sb.buffer.get(n.step).push(n);
                }
                else if (n.module === 'hb') {
                    if (!hb.buffer.has(n.step)) hb.buffer.set(n.step, []);
                    hb.buffer.get(n.step).push(n);
                }
                else if (n.module === 'cb') {
                    if (!cb.buffer.has(n.step)) cb.buffer.set(n.step, []);
                    cb.buffer.get(n.step).push(n);
                }
            }); 
            if (ctx.isPlaying) scheduler(); 
        });

        initUI();
        viz = new UnifiedVisualizer('unifiedVizContainer'); 
        ctx.viz = viz;
        viz.addTrack('bass', 'var(--success-color)'); 
        viz.addTrack('soloist', 'var(--soloist-color)');
        viz.addTrack('harmony', 'var(--violet)');

        hydrateState();
        loadFromUrl(viz);

        setInstrumentControllerRefs(() => scheduler(), viz);
        initTabs(); 
        setupPanelMenus(); 
        renderGrid(); 
        renderMeasurePagination(switchMeasure);
        
        const hasDrumPattern = gb.instruments.some(inst => inst.steps.some(s => s > 0));
        if (!hasDrumPattern) loadDrumPreset(gb.lastDrumPreset || 'Basic Rock');
        
        setupPresets({ togglePlay: () => togglePlay(viz) }); 
        setupUIHandlers({ 
            togglePlay: () => togglePlay(viz), 
            previewChord: window.previewChord, 
            init, 
            viz, 
            POWER_CONFIG: getPowerConfig() 
        });

        renderUserPresets(onSectionUpdate, onSectionDelete, onSectionDuplicate, validateAndAnalyze, clearChordPresetHighlight, refreshArrangerUI, () => togglePlay(viz));
        renderUserDrumPresets(switchMeasure); 
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
        initializePowerButtons();

        // --- BACKGROUND RECOVERY ---
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (ctx.audio && ctx.audio.state === 'suspended' && ctx.isPlaying) {
                    ctx.audio.resume().catch(() => {});
                }
            }
        });

        validateProgression(() => { renderChordVisualizer(); analyzeFormUI(); });
        
        subscribe((action, payload) => syncWorker(action, payload));
        syncWorker(); 

        document.querySelector('.app-main-layout').classList.add('loaded');
        const versionEl = document.getElementById('appVersion'); 
        if (versionEl) versionEl.textContent = `Ensemble v${APP_VERSION}`;

        // Start animation loop
        ctx.isDrawing = true;
        requestAnimationFrame(() => draw(viz));

    } catch (e) { console.error("Error during init:", e); }
}

window.previewChord = (index) => {
    if (ctx.isPlaying) return; 
    initAudio(); 
    const chord = arranger.progression[index]; 
    if (!chord) return;
    const wasSustainActive = ctx.sustainActive;
    ctx.sustainActive = false;
    const now = ctx.audio.currentTime; 
    chord.freqs.forEach(f => playNote(f, now, 1.0, { vol: 0.15, instrument: 'Piano' }));
    ctx.sustainActive = wasSustainActive;
    const cards = document.querySelectorAll('.chord-card'); 
    if (cards[index]) { 
        cards[index].classList.add('active'); 
        setTimeout(() => { if (!ctx.isPlaying) cards[index].classList.remove('active'); }, 300); 
    }
};

window.addEventListener('load', () => { init(); initPWA(); });
