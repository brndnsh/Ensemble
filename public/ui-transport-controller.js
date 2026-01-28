import { ui } from './ui.js';
import { dispatch } from './state.js';
import { ACTIONS } from './types.js';
import { setBpm } from './app-controller.js';
import { handleTap } from './instrument-controller.js';
import { saveCurrentState } from './persistence.js';

/**
 * Initializes event handlers for transport controls (Play, BPM, Swing).
 * @param {Object} refs - References to external controllers (viz, togglePlay).
 */
export function initTransportHandlers(refs) {
    const { togglePlay, viz } = refs;

    // 1. Playback Controls
    if (ui.playBtn) {
        // Remove old listeners is handled by the fact that this is run once on init,
        // but if we re-run it, we might duplicate. The original setupUIHandlers was run once.
        ui.playBtn.addEventListener('click', togglePlay);
    }

    // 2. Tempo Controls
    if (ui.bpmInput) {
        ui.bpmInput.addEventListener('input', (e) => setBpm(e.target.value, viz));
    }

    if (ui.tapBtn) {
        ui.tapBtn.addEventListener('click', () => handleTap((val) => setBpm(val, viz)));
    }

    // 3. Swing Controls
    if (ui.swingSlider) {
        ui.swingSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            dispatch(ACTIONS.SET_SWING, val);
            saveCurrentState();
        });
    }

    if (ui.swingBase) {
        ui.swingBase.addEventListener('change', (e) => {
            dispatch(ACTIONS.SET_SWING_SUB, e.target.value);
            saveCurrentState();
        });
    }
}
