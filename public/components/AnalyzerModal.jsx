import { h } from 'preact';
import React from 'preact/compat';
import { ModalManager } from '../ui-modal-controller.js';
import { useEnsembleState } from '../ui-bridge.js';

export function AnalyzerModal() {
    const isOpen = useEnsembleState(s => s.playback.modals.analyzer);

    const close = () => {
        const overlay = document.getElementById('analyzerOverlay');
        if (overlay) ModalManager.close(overlay);
    };

    return (
        <div id="analyzerOverlay" class={`modal-overlay ${isOpen ? 'active' : ''}`} aria-hidden={!isOpen ? 'true' : 'false'} onClick={(e) => {
            if (e.target.id === 'analyzerOverlay') close();
        }}>
            <div class="modal-content analyzer-modal settings-content" onClick={(e) => e.stopPropagation()}>
                <button class="close-modal-btn" id="closeAnalyzerBtn" aria-label="Close Analyzer" onClick={close}>✕</button>
                
                <div class="analyzer-body">
                    <h3>Audio Workbench</h3>
                    
                    <div class="analyzer-mode-switch" style="display: flex; gap: 8px; margin: 1rem 0; background: var(--input-bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <label class="mode-option" style="flex: 1; text-align: center; padding: 10px; cursor: pointer; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <input type="radio" name="analyzerMode" value="chords" checked class="sr-only" />
                            <span style="font-size: 1.1rem;">🎼</span>
                            <span style="font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">Chords</span>
                        </label>
                        <label class="mode-option" style="flex: 1; text-align: center; padding: 10px; cursor: pointer; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <input type="radio" name="analyzerMode" value="melody" class="sr-only" />
                            <span style="font-size: 1.1rem;">🎤</span>
                            <span style="font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">Melody</span>
                        </label>
                    </div>

                    <label class="analyzer-drop-zone" id="analyzerDropZone" for="analyzerFileInput">
                        <div class="drop-zone-content">
                            <span class="drop-icon">🎵</span>
                            <p>Drag & drop an audio file here</p>
                            <p class="drop-subtext">Supports MP3, WAV, M4A, AAC</p>
                            <input type="file" id="analyzerFileInput" accept="audio/*,.m4a,.aac" class="sr-only" />
                        </div>
                    </label>

                    <div id="liveListenContainer" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <button id="liveListenBtn" class="primary-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--green); color: white; border: none;">
                            <span>🎤</span> Live Listen
                        </button>
                    </div>

                    <div id="liveListenView" class="live-listen-view" style="display: none; text-align: center; padding: 2rem 1rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 2px solid var(--green);">
                        <div class="pulse-icon">🎤</div>
                        <div id="liveKeyContainer" style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem;">
                            <span id="liveKeyLabel" style="font-size: 1.1rem; color: var(--accent-color); font-weight: bold;">Key: --</span>
                            <label style="font-size: 0.8rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
                                <input type="checkbox" id="liveForceKeyCheck" /> Lock Key
                            </label>
                        </div>

                        <h2 id="liveChordDisplay" style="font-size: 4rem; margin: 0.5rem 0 1rem 0; color: var(--green); text-shadow: 0 0 20px rgba(133, 153, 0, 0.4); min-height: 1.2em;">---</h2>

                        <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                            <button id="liveAddBtn" class="primary-btn" style="background: var(--green); color: white; border: none; padding: 0.8rem 2rem; font-size: 1.1rem;">
                                Add Chord (Space)
                            </button>
                            <label style="font-size: 0.9rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px;">
                                <input type="checkbox" id="liveAutoAddCheck" />
                                <span>Auto-Add (Hold)</span>
                            </label>
                        </div>

                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; text-align: left;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <label style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Your Progression</label>
                                <div style="display: flex; gap: 0.5rem;">
                                     <button id="liveUndoBtn" style="font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;">⎌ Undo</button>
                                     <button id="liveClearBtn" style="font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;">🗑 Clear</button>
                                </div>
                            </div>
                            <div id="liveStagedDisplay" style="font-family: monospace; font-size: 1.2rem; color: white; min-height: 1.5em; word-break: break-all; line-height: 1.6;">
                                <span style="color: var(--text-muted); font-style: italic;">Start playing to build a sequence...</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                            <button id="captureLiveHistoryBtn" class="primary-btn" style="flex: 2; background: var(--accent-color); color: white; border: none; opacity: 0.5; pointer-events: none;">Import Sequence</button>
                            <button id="stopLiveListenBtn" class="primary-btn" style="flex: 1; background: var(--error-color); color: white; border: none;">Stop</button>
                        </div>
                    </div>

                    <div id="analyzerTrimView" class="analyzer-trim-view" style="display: none;">
                        <div class="waveform-container">
                            <canvas id="analyzerWaveformCanvas"></canvas>
                            <div id="analyzerSelectionOverlay" class="waveform-selection"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                            <div class="setting-item">
                                <label class="setting-label" for="analyzerStartInput">Start (sec)</label>
                                <input type="number" id="analyzerStartInput" value="0" min="0" step="1" style="width: 100%;" />
                            </div>
                            <div class="setting-item">
                                <label class="setting-label" for="analyzerEndInput">End (sec)</label>
                                <input type="number" id="analyzerEndInput" value="0" min="1" step="1" style="width: 100%;" />
                            </div>
                        </div>
                        <p id="analyzerDurationLabel" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;"></p>

                        <div style="margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer;">
                                <input type="checkbox" id="analyzerForceKeyCheck" />
                                <span>Use Arranger Key (<span id="analyzerCurrentKeyLabel">C</span>)</span>
                            </label>
                        </div>

                        <button id="startAnalysisBtn" class="primary-btn" style="width: 100%;">Analyze Selection</button>
                    </div>

                    <div id="analyzerProcessing" class="analyzer-processing" style="display: none;">
                        <div class="spinner"></div>
                        <p>Ensemble is listening...</p>
                        <div class="progress-bar-container">
                            <div id="analyzerProgressBar" class="progress-bar"></div>
                        </div>
                    </div>

                    <div id="analyzerResults" class="analyzer-results" style="display: none;">
                        <h3>Analysis Complete</h3>
                        <p id="analyzerSummary" style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;"></p>
                        
                        <div id="bpmCandidateContainer" style="margin-bottom: 1.5rem;">
                            <label class="setting-label" style="display: block; margin-bottom: 0.5rem;">Select Tempo:</label>
                            <div id="bpmChips" class="template-chips" style="justify-content: flex-start;"></div>
                            
                            <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-size: 0.85rem;">Sync project BPM (<span id="detectedBpmLabel">---</span>)</span>
                                <input type="checkbox" id="analyzerSyncBpmCheck" checked />
                            </div>
                        </div>

                        <div id="suggestedSectionsContainer" class="suggested-sections-container"></div>

                        <div class="analyzer-actions" style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-bottom: 1rem; cursor: pointer;">
                                <input type="checkbox" id="analyzerReplaceCheck" checked />
                                <span>Replace existing arrangement</span>
                            </label>
                            <button id="applyAnalysisBtn" class="primary-btn" style="width: 100%;">Import Arrangement</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
