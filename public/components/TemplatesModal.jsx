import { h } from 'preact';
import { ModalManager } from '../ui-modal-controller.js';

export function TemplatesModal() {
    const close = () => {
        const overlay = document.getElementById('templatesOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    return (
        <div id="templatesOverlay" class="settings-overlay">
            <div class="settings-content">
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
