import { arranger, cb, ctx, gb } from './state.js';
import { updateKeySelectLabels } from './main.js';
import { ui, renderSections, renderChordVisualizer, showToast } from './ui.js';
import { validateProgression } from './chords.js';
import { flushBuffers } from './instrument-controller.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { generateId, normalizeKey } from './utils.js';
import { pushHistory } from './history.js';
import { analyzeForm } from './form-analysis.js';
import { conductorState } from './conductor.js';
import { KEY_ORDER } from './config.js';

export function analyzeFormUI() {
    const form = analyzeForm();
    if (form) {
        conductorState.form = form;
        console.log(`Analyzed Form: ${form.type}`, form.roles);
    }
}

export function validateAndAnalyze() {
    validateProgression(() => {
        renderChordVisualizer();
        analyzeFormUI();
    });
}

export function clearChordPresetHighlight() {
    arranger.lastChordPreset = null;
    document.querySelectorAll('.chord-preset-chip').forEach(c => c.classList.remove('active'));
}

export function refreshArrangerUI() {
    renderSections(arranger.sections, onSectionUpdate, onSectionDelete, onSectionDuplicate);
    validateAndAnalyze();
    flushBuffers();
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
    if (field === 'reorder' || field === 'move') {
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
    arranger.sections = arranger.sections.filter(s => s.id !== id);
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
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function addSection() {
    arranger.sections.push({ id: generateId(), label: `Section ${arranger.sections.length + 1}`, value: 'I' });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function transposeKey(delta, updateRelKeyButton) {
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(ui.keySelect.value));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];
    ui.keySelect.value = newKey;
    arranger.key = newKey;
    
    const isMusicalNotation = (part) => {
        return part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) || 
               part.match(/^[#b](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i);
    };

    arranger.sections.forEach(section => {
        const parts = section.value.split(/([\s,|,-]+)/);
        const transposed = parts.map(part => {
            const noteMatch = part.match(/^([A-G][#b]?)(.*)/i);
            if (noteMatch && !isMusicalNotation(part)) {
                const root = normalizeKey(noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase());
                const newRoot = KEY_ORDER[(KEY_ORDER.indexOf(root) + delta + 12) % 12];
                return newRoot + noteMatch[2];
            }
            return part;
        });
        section.value = transposed.join('');
    });
    
    clearChordPresetHighlight();
    refreshArrangerUI();
    if (updateRelKeyButton) updateRelKeyButton();
    updateKeySelectLabels();
    syncWorker();
}

export function switchToRelativeKey(updateRelKeyButton) {
    let currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger.key));
    const wasMinor = arranger.isMinor;
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];
    
    arranger.key = newKey;
    arranger.isMinor = !wasMinor;
    ui.keySelect.value = newKey;
    
    pushHistory();
    arranger.sections.forEach(section => {
        section.value = transformRelativeProgression(section.value, shift, arranger.isMinor);
    });
    
    if (updateRelKeyButton) updateRelKeyButton();
    updateKeySelectLabels();
    refreshArrangerUI();
    syncWorker();
    showToast(`Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`);
}
