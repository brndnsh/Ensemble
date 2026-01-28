export const arrangerPanelHtml = `
<div class="panel dashboard-panel active-mobile" id="panel-arranger" data-id="arranger">
    <div class="panel-header chord-panel-header">
        <div class="panel-title-group">
            <h2>Arranger</h2>
        </div>
        <div class="panel-header-controls">
            <div class="key-controls">
                <button id="maximizeChordBtn" title="Maximize" class="header-btn" aria-label="Maximize Chords">⛶</button>
                <div class="time-sig-group">
                    <select id="timeSigSelect" aria-label="Time Signature">
                        <option value="4/4">4/4</option>
                        <option value="3/4">3/4</option>
                        <option value="2/4">2/4</option>
                        <option value="5/4">5/4</option>
                        <option value="6/8">6/8</option>
                        <option value="7/8">7/8</option>
                        <option value="7/4">7/4</option>
                        <option value="12/8">12/8</option>
                    </select>
                    <div id="groupingToggle" style="display: none; align-items: center; justify-content: center;">
                        <button id="groupingLabel" type="button" class="badge-btn" title="Click to toggle grouping" aria-label="Toggle rhythmic grouping">3+2</button>
                    </div>
                </div>
                <select id="keySelect" aria-label="Select Key">
                    <option value="C">C</option>
                    <option value="Db">D♭</option>
                    <option value="D">D</option>
                    <option value="Eb">E♭</option>
                    <option value="E">E</option>
                    <option value="F">F</option>
                    <option value="Gb">G♭</option>
                    <option value="G">G</option>
                    <option value="Ab">A♭</option>
                    <option value="A">A</option>
                    <option value="Bb">B♭</option>
                    <option value="B">B</option>
                </select>
                <button id="relKeyBtn" title="Relative Key (Major/Minor)" class="header-btn rel-key-btn" aria-label="Relative Key Toggle">rel</button>
                <button id="transDownBtn" title="Transpose Down" class="header-btn" aria-label="Transpose Down">♭</button>
                <button id="transUpBtn" title="Transpose Up" class="header-btn" aria-label="Transpose Up">♯</button>
            </div>
        </div>
    </div>

    <div class="display-area" id="chordVisualizer" aria-live="polite"></div>
    <div id="activeSectionLabel" class="active-section-label"></div>

    <div style="margin-bottom: 1.5rem;">
        <button id="editArrangementBtn" class="primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;">
            <span>✏️</span> Edit Arrangement
        </button>
    </div>

    <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem; min-height: 100px;">
        <label class="library-label">Library</label>
        <div class="presets-container" id="chordPresets" style="margin-top: 0.5rem;"></div>
        <div class="presets-container" id="userPresetsContainer" style="border-top: 1px solid #334155; padding-top: 0.5rem; display: none;"></div>
    </div>
</div>
`;
