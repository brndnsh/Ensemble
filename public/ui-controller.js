import { ui } from './ui.js';
import { groove } from './state.js';
import { switchMeasure } from './instrument-controller.js';
import { ModalManager } from './ui-modal-controller.js';
import { pushHistory } from './history.js';
import { getStepsPerMeasure } from './utils.js';

/**
 * Legacy UI Controller - Handles remaining imperative logic and global events.
 * Most UI logic has moved to Preact components in /components.
 */

export function setupUIHandlers(refs) {
    const { togglePlay } = refs;

    // Global Keydown
    window.addEventListener('keydown', e => {
        const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
        if (e.key === ' ' && !isTyping && !ModalManager.activeModal) { e.preventDefault(); togglePlay(); }
        if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) { 
            e.preventDefault(); 
            if (ui.editorOverlay.classList.contains('active')) ModalManager.close(ui.editorOverlay); 
            else ModalManager.open(ui.editorOverlay); 
        }
        if (['1', '2', '3', '4'].includes(e.key) && !isTyping) { 
            const tabItem = document.querySelectorAll('.tab-item')[parseInt(e.key) - 1]; 
            tabItem?.click(); 
        }
        if (e.key === '[' && !isTyping) switchMeasure((groove.currentMeasure - 1 + groove.measures) % groove.measures);
        if (e.key === ']' && !isTyping) switchMeasure((groove.currentMeasure + 1) % groove.measures);
        if (e.key === 'Escape') {
            if (document.body.classList.contains('chord-maximized')) {
                document.body.classList.remove('chord-maximized');
                const btn = document.getElementById('maximizeChordBtn');
                if (btn) btn.textContent = '⛶';
            }
            if (ModalManager.activeModal) ModalManager.close();
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => { 
        if (resizeTimeout) clearTimeout(resizeTimeout); 
        resizeTimeout = setTimeout(() => {
            // Future UI recalculations if needed
        }, 150); 
    });

    // --- Arrangement Editor Buttons ---

    // Global event for opening the editor from Preact components
    document.addEventListener('open-editor', (e) => {
        const { sectionId } = e.detail || {};
        if (sectionId) {
            import('./state.js').then(({ arranger }) => {
                arranger.lastInteractedSectionId = sectionId;
            });
        }
        ModalManager.open(ui.editorOverlay);
    });
}

