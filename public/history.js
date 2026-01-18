import { arranger } from './state.js';
import { ui, showToast } from './ui.js';
import { renderSections, updateActiveChordUI } from './ui.js';
import { validateProgression } from './chords.js';
import { renderChordVisualizer } from './ui.js';
import { flushBuffers } from './instrument-controller.js';
import { saveCurrentState } from './persistence.js';

// We need some function references that are usually in main.js
// For now, we'll assume they are globally available or we'll pass them.
// Refactoring to use a more event-driven approach later.

export function pushHistory() {
    arranger.history.push(JSON.stringify(arranger.sections));
    if (arranger.history.length > 20) arranger.history.shift();
}

export function undo(refreshArrangerUI) {
    if (arranger.history.length === 0) return;
    const last = arranger.history.pop();
    arranger.sections = JSON.parse(last);
    if (refreshArrangerUI) {
        refreshArrangerUI();
    }
    showToast("Undo successful");
}
