import { arranger } from './state.js';
import { ui, renderSections, renderChordVisualizer, showToast, updateKeySelectLabels } from './ui.js';
import { validateProgression, transformRelativeProgression } from './chords.js';
import { flushBuffers } from './instrument-controller.js';
import { restoreGains } from './engine.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { generateId, normalizeKey } from './utils.js';
import { pushHistory } from './history.js';
import { analyzeForm } from './form-analysis.js';
import { conductorState } from './conductor.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';

const GROUPING_OPTIONS = {
    '5/4': [[3, 2], [2, 3]],
    '7/8': [[2, 2, 3], [3, 2, 2], [2, 3, 2]],
    '7/4': [[4, 3], [3, 4]]
};

export function initArrangerHandlers() {
    if (ui.groupingLabel) {
        ui.groupingLabel.addEventListener('click', () => {
            const ts = arranger.timeSignature;
            const options = GROUPING_OPTIONS[ts];
            if (!options) return;

            const current = arranger.grouping || TIME_SIGNATURES[ts].grouping;
            const currentIndex = options.findIndex(opt => opt.join('+') === current.join('+'));
            const nextIndex = (currentIndex + 1) % options.length;
            
            arranger.grouping = options[nextIndex];
            updateGroupingUI();
            flushBuffers();
            syncWorker();
            saveCurrentState();
        });
    }
}

export function updateGroupingUI() {
    if (!ui.groupingToggle || !ui.groupingLabel) return;
    
    const ts = arranger.timeSignature;
    const hasOptions = GROUPING_OPTIONS[ts] !== undefined;
    
    ui.groupingToggle.style.display = hasOptions ? 'flex' : 'none';
    
    if (hasOptions) {
        const current = arranger.grouping || TIME_SIGNATURES[ts].grouping;
        ui.groupingLabel.textContent = current.join('+');
    }
}

export function analyzeFormUI() {
    const form = analyzeForm();
    if (form) {
        conductorState.form = form;
        // console.log(`Analyzed Form: ${form.sequence}`, form.sections);
    }
}

export function validateAndAnalyze() {
    validateProgression(() => {
        renderChordVisualizer();
        analyzeFormUI();
    });
}

export function clearChordPresetHighlight() {
    // Only remove the UI class, don't clear the state tracking
    document.querySelectorAll('.chord-preset-chip, .user-preset-chip').forEach(c => c.classList.remove('active'));
}

export function refreshArrangerUI() {
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateAndAnalyze();
    syncWorker();
    flushBuffers();
    restoreGains();
    saveCurrentState();
}

export function onSectionUpdate(id, field, value) {
    if (field === 'reorder') {
        const newSections = value.map(sid => arranger.sections.find(s => s.id === sid));
        if (JSON.stringify(newSections.map(s => s.id)) !== JSON.stringify(arranger.sections.map(s => s.id))) {
            pushHistory();
            arranger.sections = newSections;
        } else {
            return;
        }
    } else {
        const index = arranger.sections.findIndex(s => s.id === id);
        if (index === -1) return;
        const section = arranger.sections[index];
        if (field === 'move') {
            const newIndex = index + value;
            if (newIndex >= 0 && newIndex < arranger.sections.length) {
                pushHistory();
                const temp = arranger.sections[index];
                arranger.sections[index] = arranger.sections[newIndex];
                arranger.sections[newIndex] = temp;
            } else {
                return;
            }
        } else {
            section[field] = value;
        }
    }
    arranger.isDirty = true;
    if (field === 'reorder' || field === 'move' || field === 'seamless') {
        renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    }
    if (field === 'reorder' || field === 'move' || field === 'value') {
        clearChordPresetHighlight();
    }
    validateAndAnalyze();
    flushBuffers();
    saveCurrentState();
}

export function onSectionDelete(id) {
    if (arranger.sections.length <= 1) return;
    
    const section = arranger.sections.find(s => s.id === id);
    // Prompt if section has content (ignoring the default 'I' for new sections)
    if (section && section.value && section.value.trim() !== '' && section.value.trim() !== 'I') {
        if (!confirm(`Delete section "${section.label || 'Untitled'}" and its chords?`)) return;
    }

    arranger.sections = arranger.sections.filter(s => s.id !== id);
    arranger.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function onSectionDuplicate(id) {
    const section = arranger.sections.find(s => s.id === id);
    if (!section) return;
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger.sections.findIndex(s => s.id === id);
    arranger.sections.splice(index + 1, 0, newSection);
    arranger.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function addSection() {
    arranger.sections.push({ id: generateId(), label: `Section ${arranger.sections.length + 1}`, value: 'I', repeat: 1 });
    arranger.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function transposeKey(delta) {
    // Use arranger.key as the source of truth, fallback to UI if somehow missing
    const currentKeyName = arranger.key || (ui.keySelect ? ui.keySelect.value : 'C');
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];

    arranger.key = newKey;
    if (ui.keySelect) ui.keySelect.value = newKey;
    
    const isMusicalNotation = (part) => {
        return part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) || 
               part.match(/^[#b\u266F\u266D](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i);
    };

    arranger.sections.forEach(section => {
        const parts = section.value.split(/([\s,|,-]+)/);
        const transposed = parts.map(part => {
            const noteMatch = part.match(/^([A-G](?:[#b\u266F\u266D])?)(.*)/i);
            if (noteMatch && !isMusicalNotation(part)) {
                let rootStr = noteMatch[1];
                // Normalize Unicode to ASCII for lookup
                rootStr = rootStr.replace('\u266F', '#').replace('\u266D', 'b');
                
                const root = normalizeKey(rootStr.charAt(0).toUpperCase() + rootStr.slice(1).toLowerCase());
                const rootIndex = KEY_ORDER.indexOf(root);
                
                if (rootIndex !== -1) {
                    const newRoot = KEY_ORDER[(rootIndex + delta + 12) % 12];
                    return newRoot + noteMatch[2];
                }
            }
            return part;
        });
        section.value = transposed.join('');

        // Also transpose explicit section key if present
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + delta + 12) % 12];
            }
        }
    });
    
    arranger.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
    updateRelKeyButton();
    updateKeySelectLabels();
}

export function switchToRelativeKey() {
    const wasMinor = !!arranger.isMinor;
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger.key));
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];
    
    arranger.key = newKey;
    arranger.isMinor = !wasMinor;
    
    if (ui.keySelect) {
        ui.keySelect.value = newKey;
    } else {
        console.warn("[Arranger] ui.keySelect not found in switchToRelativeKey");
    }
    
    pushHistory();
    arranger.sections.forEach(section => {
        section.value = transformRelativeProgression(section.value, shift);

        // Also transpose explicit section key if present
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + shift + 12) % 12];
            }
        }
    });
    
    arranger.isDirty = true;
    updateRelKeyButton();
    updateKeySelectLabels();
    refreshArrangerUI();
    showToast(`Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`);
}
