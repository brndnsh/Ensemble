import { h } from 'preact';
import React from 'preact/compat';
import { ModalManager } from '../ui-modal-controller.js';
import { useEnsembleState } from '../ui-bridge.js';

export function TemplatesModal() {
    const isOpen = useEnsembleState(s => s.playback.modals.templates);

    const close = () => {
        const overlay = document.getElementById('templatesOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    return (
        <div id="templatesOverlay" class={`modal-overlay ${isOpen ? 'active' : ''}`} aria-hidden={!isOpen ? 'true' : 'false'} onClick={(e) => {
            if (e.target.id === 'templatesOverlay') close();
        }}>
            <div class="settings-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>Song Templates</h2>
                    <button id="closeTemplatesBtn" class="primary-btn" onClick={close}>Cancel</button>
                </div>
                <div class="templates-modal-label">
                    Select a template to replace your current arrangement:
                </div>
                <div id="templateChips" class="template-chips"></div>
            </div>
        </div>
    );
}
