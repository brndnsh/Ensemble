import { startExport } from './worker-client.js';
import { showToast } from './ui.js';
import { syncWorker } from './worker-client.js';

export function exportToMidi(options = {}) {
    showToast("Starting MIDI Export...");
    // Ensure worker has latest state
    syncWorker();
    startExport(options);
}
