import { dispatch } from './state.js';
import { ACTIONS } from './types.js';
import { midiToNote, formatUnicodeSymbols } from './utils.js';

export function showToast(msg) {
    dispatch(ACTIONS.SHOW_TOAST, msg);
}

export function triggerFlash(intensity = 0.25) {
    dispatch(ACTIONS.TRIGGER_FLASH, intensity);
}

export function updateOctaveLabel(labelEl, octave, headerEl) {
    if (!labelEl) return;
    const { name, octave: octNum } = midiToNote(octave);
    labelEl.textContent = `${formatUnicodeSymbols(name)}${octNum}`;
    if (headerEl) headerEl.textContent = `(C${octNum})`;
}
