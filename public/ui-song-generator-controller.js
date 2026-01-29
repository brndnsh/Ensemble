import { ui as globalUI, showToast } from './ui.js';
import { arranger } from './state.js';
import { generateSong } from './song-generator.js';
import { pushHistory } from './history.js';
import { normalizeKey } from './utils.js';
import { refreshArrangerUI, clearChordPresetHighlight, validateAndAnalyze, updateGroupingUI } from './arranger-controller.js';
import { ModalManager } from './ui-modal-controller.js';

/**
 * Domain-specific UI registry for Song Generator.
 */
const ui = {
    get generateSongOverlay() { return globalUI.generateSongOverlay; },
    get confirmGenerateSongBtn() { return globalUI.confirmGenerateSongBtn; },
    get closeGenerateSongBtn() { return globalUI.closeGenerateSongBtn; },
    get genKeySelect() { return globalUI.genKeySelect; },
    get genTimeSigSelect() { return globalUI.genTimeSigSelect; },
    get genStructureSelect() { return globalUI.genStructureSelect; },
    get genSeedCheck() { return globalUI.genSeedCheck; },
    get genSeedTypeSelect() { return globalUI.genSeedTypeSelect; },
    get editArrangementBtn() { return globalUI.editArrangementBtn; },
    get keySelect() { return globalUI.keySelect; },
    get timeSigSelect() { return globalUI.timeSigSelect; }
};

/**
 * Initializes event handlers for the Song Generator modal.
 */
export function setupSongGeneratorHandlers() {
    if (!ui.generateSongOverlay) return;

    ui.closeGenerateSongBtn?.addEventListener('click', () => {
        ModalManager.close(ui.generateSongOverlay);
    });

    ui.confirmGenerateSongBtn.addEventListener('click', () => {
        const key = ui.genKeySelect.value;
        const timeSignature = ui.genTimeSigSelect.value;
        const structure = ui.genStructureSelect.value;

        // Seeding logic
        let seed = null;
        if (ui.genSeedCheck && ui.genSeedCheck.checked) {
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId) || arranger.sections[0];
            if (section && section.value) {
                seed = {
                    type: ui.genSeedTypeSelect.value,
                    value: section.value
                };
            } else {
                showToast("No section found to seed from.");
            }
        }

        const newSections = generateSong({ key, timeSignature, structure, seed });

        pushHistory();

        if (arranger.isDirty && arranger.sections.length > 1) {
            if (!confirm("Replace current arrangement with generated song?")) return;
        }

        arranger.sections = newSections;
        
        // Update global arranger state to match the generated song's first section details
        if (newSections.length > 0) {
            const first = newSections[0];
            if (first.key && first.key !== 'Random') {
                arranger.key = first.key;
                ui.keySelect.value = normalizeKey(first.key);
            }
            if (first.timeSignature && first.timeSignature !== 'Random') {
                arranger.timeSignature = first.timeSignature;
                ui.timeSigSelect.value = first.timeSignature;
                updateGroupingUI();
            }
        }

        arranger.isMinor = false; // Reset to Major if not specified
        arranger.isDirty = true; // generated content is "dirty" vs a saved preset
        
        clearChordPresetHighlight();
        refreshArrangerUI();
        validateAndAnalyze(); // Ensure playback engine is updated
        
        ModalManager.close(ui.generateSongOverlay);
        showToast("Generated new song!");
    });
}
