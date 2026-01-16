import { arranger, cb, ctx, gb } from './state.js';
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
import { KEY_ORDER } from './config.js';

export function analyzeFormUI() {
    const form = analyzeForm();
    if (form) {
        conductorState.form = form;
        console.log(`Analyzed Form: ${form.sequence}`, form.sections);
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

export function transposeKey(delta, updateRelKeyButton) {
    if (!ui.keySelect) {
        console.warn("[Arranger] ui.keySelect not found in transposeKey");
        return;
    }
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
    
    arranger.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
    if (updateRelKeyButton) updateRelKeyButton();
    updateKeySelectLabels();
}

export function switchToRelativeKey(updateRelKeyButton) {
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
        section.value = transformRelativeProgression(section.value, shift, arranger.isMinor);
    });
    
    arranger.isDirty = true;
    if (typeof updateRelKeyButton === 'function') {
        updateRelKeyButton();
    } else {
        console.warn("[Arranger] updateRelKeyButton is not a function", updateRelKeyButton);
    }
    updateKeySelectLabels();
    refreshArrangerUI();
    showToast(`Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`);
}
