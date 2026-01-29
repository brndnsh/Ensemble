import { h } from 'preact';
import { useState } from 'preact/hooks';
import React from 'preact/compat';
import { ModalManager } from '../ui-modal-controller.js';
import { useEnsembleState, useDispatch } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { arranger } from '../state.js';
import { generateSong } from '../song-generator.js';
import { pushHistory } from '../history.js';
import { normalizeKey } from '../utils.js';
import { refreshArrangerUI, clearChordPresetHighlight, validateAndAnalyze, updateGroupingUI } from '../arranger-controller.js';
import { showToast } from '../ui.js';

export function GenerateSongModal() {
    const dispatch = useDispatch();
    const isOpen = useEnsembleState(s => s.playback.modals.generateSong);
    
    // Internal component state for form values
    const [key, setKey] = useState('Random');
    const [timeSignature, setTimeSignature] = useState('Random');
    const [structure, setStructure] = useState('pop');
    const [useSeed, setUseSeed] = useState(false);
    const [seedType, setSeedType] = useState('Verse');

    const close = () => {
        dispatch(ACTIONS.SET_MODAL, { modal: 'generateSong', open: false });
        const overlay = document.getElementById('generateSongOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    const handleConfirm = () => {
        let seed = null;
        if (useSeed) {
            const targetId = arranger.lastInteractedSectionId;
            const section = arranger.sections.find(s => s.id === targetId) || arranger.sections[0];
            if (section && section.value) {
                seed = {
                    type: seedType,
                    value: section.value
                };
            } else {
                showToast("No section found to seed from.");
                // We'll continue anyway, just without the seed
            }
        }

        const newSections = generateSong({ key, timeSignature, structure, seed });

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
                            <select value={key} onChange={(e) => setKey(e.target.value)}>
                                <option value="Random">Random</option>
                                <option value="C">C</option><option value="Db">Db</option><option value="D">D</option><option value="Eb">Eb</option><option value="E">E</option><option value="F">F</option><option value="Gb">Gb</option><option value="G">G</option><option value="Ab">Ab</option><option value="A">A</option><option value="Bb">Bb</option><option value="B">B</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="setting-label">Time Signature</label>
                            <select value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)}>
                                <option value="Random">Random</option>
                                <option value="4/4">4/4</option><option value="3/4">3/4</option><option value="2/4">2/4</option><option value="5/4">5/4</option><option value="6/8">6/8</option><option value="7/8">7/8</option><option value="12/8">12/8</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="setting-label">Structure</label>
                            <select value={structure} onChange={(e) => setStructure(e.target.value)}>
                                <option value="pop">Pop (Verse-Chorus-Bridge)</option>
                                <option value="blues">12-Bar Blues</option>
                                <option value="jazz">Jazz Standard (AABA)</option>
                                <option value="loop">Short Loop (4 Bars)</option>
                            </select>
                        </div>
                        
                        <div class="setting-item" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
                                <span class="setting-label" style="margin: 0;">Seed from current section</span>
                            </label>
                        </div>

                        {useSeed && (
                            <div class="setting-item animate-in">
                                <label class="setting-label">Seed as...</label>
                                <select value={seedType} onChange={(e) => setSeedType(e.target.value)}>
                                    <option value="Verse">Verse</option>
                                    <option value="Chorus">Chorus</option>
                                    <option value="Bridge">Bridge</option>
                                    <option value="Intro">Intro</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <button class="primary-btn" style="width: 100%; margin-top: 1.5rem; padding: 1rem;" onClick={handleConfirm}>Generate Song</button>
            </div>
        </div>
    );
}