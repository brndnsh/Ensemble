import { useEffect } from 'preact/hooks';
import { togglePlay } from '../scheduler-core.js';
import { switchMeasure } from '../instrument-controller.js';
import { ModalManager } from '../ui-modal-controller.js';
import { playback, groove } from '../state.js';

export function GlobalShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;

            // Space: Toggle Play
            if (e.key === ' ' && !isTyping && !ModalManager.activeModal) {
                e.preventDefault();
                togglePlay(playback.viz);
            }

            // 'E': Toggle Editor
            if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                const overlay = document.getElementById('editorOverlay');
                if (overlay) {
                    if (overlay.classList.contains('active')) ModalManager.close(overlay);
                    else ModalManager.open(overlay);
                }
            }

            // 1-4: Switch Mobile Tabs
            if (['1', '2', '3', '4'].includes(e.key) && !isTyping) {
                const btns = document.querySelectorAll('.mobile-tabs-nav .tab-btn');
                const btn = btns[parseInt(e.key) - 1];
                if (btn) btn.click();
            }

            // [ ]: Switch Measures
            if (e.key === '[' && !isTyping) switchMeasure((groove.currentMeasure - 1 + groove.measures) % groove.measures);
            if (e.key === ']' && !isTyping) switchMeasure((groove.currentMeasure + 1) % groove.measures);

            // Escape: Close Modal / Unmaximize
            if (e.key === 'Escape') {
                if (document.body.classList.contains('chord-maximized')) {
                    document.body.classList.remove('chord-maximized');
                    const btn = document.getElementById('maximizeChordBtn');
                    if (btn) btn.textContent = '⛶';
                }
                if (ModalManager.activeModal) ModalManager.close();
            }
        };

        const handleOpenEditor = (e) => {
            const { sectionId } = e.detail || {};
            if (sectionId) {
                import('../state.js').then(({ arranger }) => {
                    arranger.lastInteractedSectionId = sectionId;
                });
            }
            const overlay = document.getElementById('editorOverlay');
            if (overlay) ModalManager.open(overlay);
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('open-editor', handleOpenEditor);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('open-editor', handleOpenEditor);
        };
    }, []);

    return null;
}
