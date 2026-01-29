import { h } from 'preact';
import { ModalManager } from '../ui-modal-controller.js';

export function ExportModal() {
    const close = () => {
        const overlay = document.getElementById('exportOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    const adjustExportDuration = (delta) => {
        const input = document.getElementById('exportDurationInput');
        if (!input) return;
        const current = parseInt(input.value);
        const next = Math.max(1, Math.min(20, current + delta));
        input.value = next;
    };

    const handleModeChange = (e) => {
        const isTime = e.target.value === 'time';
        const container = document.getElementById('exportDurationContainer');
        const stepper = document.getElementById('exportDurationStepper');
        if (container) {
            container.style.opacity = isTime ? '1' : '0.5';
            container.style.pointerEvents = isTime ? 'auto' : 'none';
        }
        if (stepper) {
            stepper.style.borderColor = isTime ? 'var(--accent-color)' : 'var(--border-color)';
            stepper.style.backgroundColor = isTime ? 'var(--card-bg)' : 'var(--input-bg)';
        }
    };

    return (
        <div id="exportOverlay" class="settings-overlay">
            <div class="settings-content">
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
                    <h2>MIDI Export Options</h2>
                    <button id="closeExportBtn" class="primary-btn" style="padding: 0.4rem 1rem; font-size: 0.9rem; background: transparent; border: 1px solid var(--border-color); color: var(--text-color);" onClick={close}>Cancel</button>
                </div>
                
                <div class="settings-controls">
                    <div class="settings-section">
                        <h3>File Info</h3>
                        <div class="setting-item">
                            <label class="setting-label">
                                <span>Filename</span>
                            </label>
                            <input type="text" id="exportFilenameInput" value="Ensemble Export" style="width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px;" spellcheck="false" />
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>Tracks to Include</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportChordsCheck" checked />
                                Chords
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportBassCheck" checked />
                                Bass
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportSoloistCheck" checked />
                                Soloist
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportHarmoniesCheck" checked />
                                Harmonies
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportDrumsCheck" checked />
                                Drums
                            </label>
                        </div>
                    </div>

                    <div class="settings-section" style="border-bottom: none;">
                        <h3>Duration</h3>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="exportMode" value="once" checked onChange={handleModeChange} />
                                <span>Cycle Through Once</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="exportMode" value="time" onChange={handleModeChange} />
                                <span>Target Duration (Minutes)</span>
                            </label>
                            <div id="exportDurationContainer" style="margin-left: 1.8rem; opacity: 0.5; pointer-events: none; transition: opacity 0.2s;">
                                 <div id="exportDurationStepper" class="stepper-control" style="display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; width: fit-content;">
                                    <button id="exportDurationDec" aria-label="Decrease Duration" class="stepper-btn" style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;" onClick={() => adjustExportDuration(-1)}>-</button>
                                    <input type="number" id="exportDurationInput" value="3" min="1" max="20" readonly style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;" />
                                    <button id="exportDurationInc" aria-label="Increase Duration" class="stepper-btn" style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;" onClick={() => adjustExportDuration(1)}>+</button>
                                 </div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <button id="confirmExportBtn" class="primary-btn" style="width: 100%; padding: 1rem;">
                            Download MIDI
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
