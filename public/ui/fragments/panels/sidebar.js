export const sidebarHtml = `
<!-- CHORDS PANEL -->
<div class="panel dashboard-panel instrument-panel active-mobile" id="panel-chords" data-id="chords">
    <div class="panel-header chord-panel-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2>Chords</h2>
        </div>
        <!-- TAB NAV -->
        <div class="instrument-tabs">
            <button class="instrument-tab-btn" data-module="chords" data-tab="classic">Classic</button>
            <button class="instrument-tab-btn active" data-module="chords" data-tab="smart">Smart</button>
        </div>
         <div style="display: flex; gap: 0.5rem; align-items: center;">
             <button class="panel-menu-btn" aria-label="Settings">⋮</button>
             <button class="power-btn desktop-power-btn active" id="chordPowerBtnDesktop" aria-label="Toggle Chords">⏻</button>
         </div>
    </div>
    
    <!-- CLASSIC TAB -->
    <div id="chord-tab-classic" class="instrument-tab-content">
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
            <div class="presets-container" id="chordStylePresets"></div>
        </div>
    </div>

    <!-- SMART TAB -->
    <div id="chord-tab-smart" class="instrument-tab-content active">
        <div class="smart-status" style="padding: 0.5rem; background: rgba(59, 130, 246, 0.05); border-radius: 8px; border: 1px dashed rgba(59, 130, 246, 0.2); text-align: center;">
            <p style="font-size: 0.8rem; color: var(--blue); margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
        </div>
    </div>

    <div class="panel-settings-menu">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Voicing</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Density</label>
                    <select id="densitySelect" aria-label="Voicing Density">
                        <option value="thin">Thin (3 notes)</option>
                        <option value="standard" selected>Standard (4 notes)</option>
                        <option value="rich">Rich (5+ notes)</option>
                    </select>
                </div>
            </div>
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Volume</label>
                    <input type="range" id="chordVolume" min="0" max="1" step="0.05" value="0.5" style="width: 100%;" aria-label="Chord Volume">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Reverb</label>
                    <input type="range" id="chordReverb" min="0" max="1" step="0.05" value="0.3" style="width: 100%;" aria-label="Chord Reverb">
                </div>
            </div>
        </div>
    </div>
</div>

<!-- GROOVES PANEL -->
<div class="panel dashboard-panel instrument-panel" id="panel-grooves" data-id="grooves">
    <div class="panel-header groove-panel-header">
         <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2>Grooves</h2>
        </div>
        
        <!-- TAB NAV -->
        <div class="instrument-tabs">
            <button class="instrument-tab-btn" data-module="groove" data-tab="classic">Classic</button>
            <button class="instrument-tab-btn active" data-module="groove" data-tab="smart">Smart</button>
        </div>

         <div style="display: flex; gap: 0.5rem; align-items: center;">
             <button class="panel-menu-btn" aria-label="Settings">⋮</button>
             <button class="power-btn desktop-power-btn active" id="groovePowerBtnDesktop" aria-label="Toggle Grooves">⏻</button>
         </div>
    </div>

    <!-- CLASSIC TAB -->
    <div id="groove-tab-classic" class="instrument-tab-content">
        <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
            <div class="presets-container" id="drumPresets"></div>
            <div class="presets-container" id="userDrumPresetsContainer" style="border-top: 1px solid #334155; padding-top: 0.5rem; display: none;"></div>
        </div>

        <!-- Sequencer kept visible -->
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color);">Step Sequencer</h4>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.75rem; color: #94a3b8;">Measures:</label>
                    <select id="drumBarsSelect" aria-label="Number of Drum Measures">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="4">4</option>
                        <option value="8">8</option>
                    </select>
                </div>
            </div>

            <div id="measurePagination" style="display: flex; gap: 0.4rem; margin-bottom: 1rem; align-items: center;"></div>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button id="cloneMeasureBtn" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2);">⧉ Copy to All</button>
            </div>

            <div class="sequencer-grid" id="sequencerGrid" role="grid" aria-label="Drum Sequencer"></div>
        </div>
    </div>

    <!-- SMART TAB -->
    <div id="groove-tab-smart" class="instrument-tab-content active">
        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Genre</label>
            <div class="genre-selector">
                <button class="genre-btn" data-genre="Rock" role="button" aria-pressed="false">Rock</button>
                <button class="genre-btn" data-genre="Jazz" role="button" aria-pressed="false">Jazz</button>
                <button class="genre-btn" data-genre="Funk" role="button" aria-pressed="false">Funk</button>
                <button class="genre-btn" data-genre="Disco" role="button" aria-pressed="false">Disco</button>
                <button class="genre-btn" data-genre="Hip Hop" role="button" aria-pressed="false">Hip Hop</button>
                <button class="genre-btn" data-genre="Blues" role="button" aria-pressed="false">Blues</button>
                <button class="genre-btn" data-genre="Neo-Soul" role="button" aria-pressed="false">Neo-Soul</button>
                <button class="genre-btn" data-genre="Reggae" role="button" aria-pressed="false">Reggae</button>
                <button class="genre-btn" data-genre="Acoustic" role="button" aria-pressed="false">Acoustic</button>
                <button class="genre-btn" data-genre="Bossa" role="button" aria-pressed="false">Bossa</button>
                <button class="genre-btn" data-genre="Country" role="button" aria-pressed="false">Country</button>
                <button class="genre-btn" data-genre="Metal" role="button" aria-pressed="false">Metal</button>
            </div>
        </div>

        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;">
                <label style="font-size: 0.9rem; color: #94a3b8;" id="intensity-label">Intensity (Global)</label>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <label style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.3rem; cursor: pointer;" title="Automatically vary intensity over time">
                        <input type="checkbox" id="autoIntensityCheck" checked> Auto
                    </label>
                    <span id="intensityValue" style="color: var(--accent-color); font-weight: bold; font-size: 0.9rem;">50%</span>
                </div>
            </div>
            <input type="range" id="intensitySlider" min="0" max="100" value="50" style="width: 100%; height: 6px;" aria-labelledby="intensity-label">
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">
                <span>Chill</span>
                <span>Full Band</span>
            </div>
        </div>

        <div class="smart-control-group" style="margin-bottom: 1rem;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;" id="complexity-label">
                <span>Complexity</span>
                <span id="complexityValue" style="color: var(--accent-color); font-weight: bold;">Low</span>
            </label>
            <input type="range" id="complexitySlider" min="0" max="100" value="30" style="width: 100%; height: 6px;" aria-labelledby="complexity-label">
        </div>
    </div>

    <div class="panel-settings-menu grooves-settings-menu">
         <div style="display: grid; gap: 2rem; align-items: flex-start;" class="grooves-menu-grid">
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Feel & Actions</h4>
                <div style="margin-bottom: 1rem;">
                    <label class="control-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Swing</label>
                    <div style="display: flex; gap: 0.4rem; align-items: center;">
                        <input type="range" id="swingSlider" min="0" max="100" value="0" style="flex-grow: 1; height: 4px;" aria-label="Swing Amount">
                        <select id="swingBaseSelect" aria-label="Swing Base Note">
                            <option value="16th">1/16</option>
                            <option value="8th" selected>1/8</option>
                        </select>
                    </div>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label class="control-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Humanize</label>
                    <input type="range" id="humanizeSlider" min="0" max="100" value="20" style="width: 100%; height: 4px;" aria-label="Humanize Amount">
                </div>
                <div style="margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8; cursor: pointer;">
                        <span>Lars Mode</span>
                        <input type="checkbox" id="larsModeCheck">
                    </label>
                    <div id="larsIntensityContainer" style="opacity: 0.5; pointer-events: none;">
                        <label style="display: flex; justify-content: space-between; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">
                            <span>Lars Intensity</span>
                            <span id="larsIntensityValue">50%</span>
                        </label>
                        <input type="range" id="larsIntensitySlider" min="0" max="100" value="50" style="width: 100%; height: 4px;" aria-label="Lars Mode Intensity">
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; height: 32px;">
                    <button id="clearDrumsBtn" style="font-size: 0.75rem; flex: 1; height: 100%;">Clear</button>
                    <button id="saveDrumBtn" title="Save Pattern" style="font-size: 0.75rem; flex: 1; height: 100%;">💾 Save</button>
                </div>
            </div>
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                        <span>Volume</span>
                    </label>
                    <input type="range" id="drumVolume" min="0" max="1" step="0.05" value="0.5" style="width: 100%;" aria-label="Drum Volume">
                </div>
                <div>
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                        <span>Reverb</span>
                    </label>
                    <input type="range" id="drumReverb" min="0" max="1" step="0.05" value="0.2" style="width: 100%;" aria-label="Drum Reverb">
                </div>
            </div>
        </div>
    </div>
</div>

<!-- BASS PANEL -->
<div class="panel dashboard-panel instrument-panel" id="panel-bass" data-id="bass">
     <div class="panel-header bass-panel-header">
         <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2>Bass</h2>
        </div>
        <!-- TAB NAV -->
        <div class="instrument-tabs">
            <button class="instrument-tab-btn" data-module="bass" data-tab="classic">Classic</button>
            <button class="instrument-tab-btn active" data-module="bass" data-tab="smart">Smart</button>
        </div>
         <div style="display: flex; gap: 0.5rem; align-items: center;">
             <button class="panel-menu-btn" aria-label="Settings">⋮</button>
             <button class="power-btn desktop-power-btn" id="bassPowerBtnDesktop" aria-label="Toggle Bassist">⏻</button>
         </div>
    </div>

    <!-- CLASSIC TAB -->
    <div id="bass-tab-classic" class="instrument-tab-content">
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
            <div class="presets-container" id="bassStylePresets"></div>
        </div>
    </div>

    <!-- SMART TAB -->
    <div id="bass-tab-smart" class="instrument-tab-content active">
        <div class="smart-status" style="padding: 0.5rem; background: rgba(220, 50, 47, 0.05); border-radius: 8px; border: 1px dashed rgba(220, 50, 47, 0.2); text-align: center; display: flex; align-items: center; justify-content: center; gap: 1rem;">
            <p style="font-size: 0.8rem; color: var(--red); margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
            <label id="pianoRootsContainer" style="font-size: 0.75rem; color: var(--red); display: flex; align-items: center; gap: 0.25rem; cursor: pointer; border-left: 1px solid rgba(220,50,47,0.2); padding-left: 1rem;">
                <input type="checkbox" id="pianoRootsCheck">
                Piano Roots
            </label>
        </div>
    </div>

    <div class="panel-settings-menu">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Instrument</h4>
            </div>
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>

                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Volume</label>
                    <input type="range" id="bassVolume" min="0" max="1" step="0.05" value="0.45" style="width: 100%;" aria-label="Bass Volume">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Reverb</label>
                    <input type="range" id="bassReverb" min="0" max="1" step="0.05" value="0.05" style="width: 100%;" aria-label="Bass Reverb">
                </div>
            </div>
        </div>
    </div>
</div>

<!-- SOLOIST PANEL -->
<div class="panel dashboard-panel instrument-panel" id="panel-soloist" data-id="soloist">
    <div class="panel-header soloist-panel-header">
         <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2>Soloist</h2>
        </div>
        <!-- TAB NAV -->
        <div class="instrument-tabs">
            <button class="instrument-tab-btn" data-module="soloist" data-tab="classic">Classic</button>
            <button class="instrument-tab-btn active" data-module="soloist" data-tab="smart">Smart</button>
        </div>
         <div style="display: flex; gap: 0.5rem; align-items: center;">
             <button class="panel-menu-btn" aria-label="Settings">⋮</button>
             <button class="power-btn desktop-power-btn" id="soloistPowerBtnDesktop" aria-label="Toggle Soloist">⏻</button>
         </div>
    </div>

    <!-- CLASSIC TAB -->
    <div id="soloist-tab-classic" class="instrument-tab-content">
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
            <div class="presets-container" id="soloistStylePresets"></div>
        </div>
    </div>

    <!-- SMART TAB -->
    <div id="soloist-tab-smart" class="instrument-tab-content active">
        <div class="smart-status" style="padding: 0.5rem; background: rgba(133, 153, 0, 0.05); border-radius: 8px; border: 1px dashed rgba(133, 153, 0, 0.2); text-align: center; display: flex; align-items: center; justify-content: center; gap: 1rem;">
            <p style="font-size: 0.8rem; color: var(--green); margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
            <label style="font-size: 0.75rem; color: var(--green); display: flex; align-items: center; gap: 0.25rem; cursor: pointer; border-left: 1px solid rgba(133,153,0,0.2); padding-left: 1rem;">
                <input type="checkbox" id="soloistDoubleStops">
                Double Stops
            </label>
        </div>
    </div>

     <div class="panel-settings-menu">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Instrument</h4>
            </div>
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>

                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Volume</label>
                    <input type="range" id="soloistVolume" min="0" max="1" step="0.05" value="0.5" style="width: 100%;" aria-label="Soloist Volume">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Reverb</label>
                    <input type="range" id="soloistReverb" min="0" max="1" step="0.05" value="0.6" style="width: 100%;" aria-label="Soloist Reverb">
                </div>
            </div>
        </div>
    </div>
</div>

<!-- HARMONIES PANEL -->
<div class="panel dashboard-panel instrument-panel" id="panel-harmonies" data-id="harmonies">
    <div class="panel-header harmony-panel-header">
         <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2>Harmony</h2>
        </div>
        <!-- TAB NAV -->
        <div class="instrument-tabs">
            <button class="instrument-tab-btn" data-module="harmony" data-tab="classic">Classic</button>
            <button class="instrument-tab-btn active" data-module="harmony" data-tab="smart">Smart</button>
        </div>
         <div style="display: flex; gap: 0.5rem; align-items: center;">
             <button class="panel-menu-btn" aria-label="Settings">⋮</button>
             <button class="power-btn desktop-power-btn" id="harmonyPowerBtnDesktop" aria-label="Toggle Harmonies">⏻</button>
         </div>
    </div>

    <!-- CLASSIC TAB -->
    <div id="harmony-tab-classic" class="instrument-tab-content">
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
            <div class="presets-container" id="harmonyStylePresets"></div>
        </div>
    </div>

    <!-- SMART TAB -->
    <div id="harmony-tab-smart" class="instrument-tab-content active">
        <div class="smart-status" style="padding: 0.5rem; background: rgba(168, 85, 247, 0.05); border-radius: 8px; border: 1px dashed rgba(168, 85, 247, 0.2); text-align: center;">
            <p style="font-size: 0.8rem; color: var(--violet); margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
        </div>
    </div>

     <div class="panel-settings-menu">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Voicing</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                        <span>Complexity</span>
                        <span id="harmonyComplexityValue">50%</span>
                    </label>
                    <input type="range" id="harmonyComplexity" min="0" max="1" step="0.05" value="0.5" style="width: 100%;" aria-label="Harmony Complexity">
                </div>
            </div>
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Volume</label>
                    <input type="range" id="harmonyVolume" min="0" max="1" step="0.05" value="0.4" style="width: 100%;" aria-label="Harmony Volume">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Reverb</label>
                    <input type="range" id="harmonyReverb" min="0" max="1" step="0.05" value="0.4" style="width: 100%;" aria-label="Harmony Reverb">
                </div>
            </div>
        </div>
    </div>
</div>
`;
