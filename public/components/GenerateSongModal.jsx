import { h } from 'preact';
import React from 'preact/compat';
import { ModalManager } from '../ui-modal-controller.js';
import { useEnsembleState } from '../ui-bridge.js';
import { arranger, dispatch } from '../state.js';
import { generateSong } from '../song-generator.js';
import { pushHistory } from '../history.js';
import { normalizeKey } from '../utils.js';
import { refreshArrangerUI, clearChordPresetHighlight, validateAndAnalyze, updateGroupingUI } from '../arranger-controller.js';
import { showToast } from '../ui.js';

export function GenerateSongModal() {
    const isOpen = useEnsembleState(s => s.playback.modals.generateSong);

    const close = () => {
        const overlay = document.getElementById('generateSongOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    const handleConfirm = () => {
        const key = document.getElementById('genKeySelect')?.value || 'Random';
        const timeSignature = document.getElementById('genTimeSigSelect')?.value || 'Random';
        const structure = document.getElementById('genStructureSelect')?.value || 'pop';

        const newSections = generateSong({ key, timeSignature, structure });

        pushHistory();

        if (arranger.isDirty && arranger.sections.length > 1) {
            if (!confirm("Replace current arrangement with generated song?")) return;
        }

        arranger.sections = newSections;
        
        if (newSections.length > 0) {
            const first = newSections[0];
            if (first.key && first.key !== 'Random') {
                arranger.key = first.key;
            }
            if (first.timeSignature && first.timeSignature !== 'Random') {
                arranger.timeSignature = first.timeSignature;
                updateGroupingUI();
            }
        }

        arranger.isMinor = false;
        arranger.isDirty = true;
        
        clearChordPresetHighlight();
        refreshArrangerUI();
        validateAndAnalyze();
        
        close();
        showToast("Generated new song!");
    };

    return (
        <div id="generateSongOverlay" class={`modal-overlay ${isOpen ? 'active' : ''}`} aria-hidden={!isOpen ? 'true' : 'false'} onClick={(e) => {
            if (e.target.id === 'generateSongOverlay') close();
        }}>
            <div class="modal-content settings-content" onClick={(e) => e.stopPropagation()}>
                <button class="close-modal-btn" id="closeGenerateSongBtn" aria-label="Close Generator" onClick={close}>✕</button>
                <h3>Song Generator</h3>
                
                <div class="settings-controls">
                    <div class="settings-section">
                        <div class="setting-item">
                            <label class="setting-label">Root Key</label>
                            <select id="genKeySelect">
                                <option value="Random">Random</option>
                                <option value="C">C</option><option value="Db">Db</option><option value="D">D</option><option value="Eb">Eb</option><option value="E">E</option><option value="F">F</option><option value="Gb">Gb</option><option value="G">G</option><option value="Ab">Ab</option><option value="A">A</option><option value="Bb">Bb</option><option value="B">B</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="setting-label">Time Signature</label>
                            <select id="genTimeSigSelect">
                                <option value="Random">Random</option>
                                <option value="4/4">4/4</option><option value="3/4">3/4</option><option value="2/4">2/4</option><option value="5/4">5/4</option><option value="6/8">6/8</option><option value="7/8">7/8</option><option value="12/8">12/8</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="setting-label">Structure</label>
                            <select id="genStructureSelect">
                                <option value="pop">Pop (Verse-Chorus-Bridge)</option>
                                <option value="blues">12-Bar Blues</option>
                                <option value="jazz">Jazz Standard (AABA)</option>
                                <option value="loop">Short Loop (4 Bars)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button id="confirmGenerateSongBtn" class="primary-btn" style="width: 100%; margin-top: 1.5rem; padding: 1rem;" onClick={handleConfirm}>Generate Song</button>
            </div>
        </div>
    );
}
