/** @jsx h */
import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useEnsembleState } from './ui-bridge.js';
import { Transport } from './components/Transport.jsx';
import { Arranger } from './components/Arranger.jsx';
import { SequencerGrid } from './components/SequencerGrid.jsx';
import { ChordVisualizer } from './components/ChordVisualizer.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
import { StyleSelector } from './components/StyleSelector.jsx';
import { Settings } from './components/Settings.jsx';
import { CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES } from './presets.js';
import { APP_VERSION } from './config.js';

export function App() {
    const { 
        isMinor, 
        timeSignature, 
        arrangerKey,
        vizEnabled,
        grooveMobileTab
    } = useEnsembleState(s => ({
        isMinor: s.arranger.isMinor,
        timeSignature: s.arranger.timeSignature,
        arrangerKey: s.arranger.key,
        vizEnabled: s.vizState.enabled,
        grooveMobileTab: s.groove.mobileTab
    }));

    return (
        <div class="app-container">
            <Header />
            <main class="app-main-layout loaded" id="dashboardGrid">
                <div class="layout-column main-column" id="col-main">
                    <ArrangerPanel />
                    <VisualizerPanel enabled={vizEnabled} />
                </div>
                <div class="layout-column sidebar-column" id="col-sidebar">
                    <Sidebar />
                </div>
            </main>
            <MobileNav activeTab={grooveMobileTab} />
            
            {/* Modals - These remain in DOM for legacy CSS/JS access for now */}
            <div id="settingsOverlay" class="settings-overlay">
                <Settings />
            </div>
            
            {/* The rest of the modals are still legacy HTML fragments for now, 
                we can migrate them one by one if they have complex logic */}
        </div>
    );
}

function Header() {
    return (
        <header>
            <h1>Ensemble</h1>
            <Transport />
        </header>
    );
}

function ArrangerPanel() {
    return (
        <div class="panel dashboard-panel active-mobile" id="panel-arranger" data-id="arranger">
            <div class="panel-header chord-panel-header">
                <div class="panel-title-group">
                    <h2>Arranger</h2>
                </div>
                <div class="panel-header-controls">
                    <div class="key-controls">
                        <button id="maximizeChordBtn" title="Maximize" class="header-btn" aria-label="Maximize Chords">⛶</button>
                        {/* Legacy selects remain for now until Phase 5 completeness */}
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

            <ChordVisualizer />
            
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
    );
}

function VisualizerPanel({ enabled }) {
    return (
        <div class={`panel dashboard-panel ${!enabled ? 'collapsed' : ''}`} id="panel-visualizer" data-id="visualizer">
            <div class="panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <button id="vizPowerBtn" class={`power-btn ${enabled ? 'active' : ''}`} aria-label="Toggle Visualizer">⏻</button>
                    <h2>Visualizer</h2>
                </div>
            </div>
            
            <div class="viz-graph-area">
                <div id="unifiedVizContainer"></div>
            </div>

            {/* Legend Omitted for brevity, but should be included in final */}
        </div>
    );
}

function Sidebar() {
    return (
        <Fragment>
            <InstrumentPanel id="panel-chords" module="chords" title="Chords" styles={CHORD_STYLES} />
            <GroovePanel />
            <InstrumentPanel id="panel-bass" module="bass" title="Bass" styles={BASS_STYLES} />
            <InstrumentPanel id="panel-soloist" module="soloist" title="Soloist" styles={SOLOIST_STYLES} />
            <InstrumentPanel id="panel-harmonies" module="harmony" title="Harmony" styles={HARMONY_STYLES} />
        </Fragment>
    );
}

function InstrumentPanel({ id, module, title, styles }) {
    const { activeTab, enabled } = useEnsembleState(s => ({
        activeTab: s[module].activeTab,
        enabled: s[module].enabled
    }));

    return (
        <div class={`panel dashboard-panel instrument-panel ${activeTab === 'smart' ? 'smart-active' : ''}`} id={id} data-id={module}>
            <div class="panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>{title}</h2>
                </div>
                <div class="instrument-tabs">
                    <button class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`} data-module={module} data-tab="classic">Classic</button>
                    <button class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`} data-module={module} data-tab="smart">Smart</button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="panel-menu-btn" aria-label="Settings">⋮</button>
                    <button class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`} id={`${module === 'chords' ? 'chord' : module}PowerBtnDesktop`} aria-label={`Toggle ${title}`}>⏻</button>
                </div>
            </div>

            <div id={`${module === 'chords' ? 'chord' : module}-tab-classic`} class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}>
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
                <div id={`${module === 'harmony' ? 'harmony' : module}StylePresets`} class="presets-container">
                    <StyleSelector module={module} styles={styles} />
                </div>
            </div>

            <div id={`${module === 'chords' ? 'chord' : module}-tab-smart`} class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}>
                <div class="smart-status" style={`padding: 0.5rem; background: rgba(var(--${module}-color-rgb), 0.05); border-radius: 8px; border: 1px dashed rgba(var(--${module}-color-rgb), 0.2); text-align: center;`}>
                    <p style="font-size: 0.8rem; margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
                </div>
            </div>

            <div class="panel-settings-menu">
                <InstrumentSettings module={module} />
            </div>
        </div>
    );
}

function GroovePanel() {
    const { activeTab, enabled } = useEnsembleState(s => ({
        activeTab: s.groove.activeTab,
        enabled: s.groove.enabled
    }));

    return (
        <div class="panel dashboard-panel instrument-panel" id="panel-grooves" data-id="grooves">
            <div class="panel-header groove-panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>Grooves</h2>
                </div>
                <div class="instrument-tabs">
                    <button class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`} data-module="groove" data-tab="classic">Classic</button>
                    <button class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`} data-module="groove" data-tab="smart">Smart</button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="panel-menu-btn" aria-label="Settings">⋮</button>
                    <button class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`} id="groovePowerBtnDesktop" aria-label="Toggle Grooves">⏻</button>
                </div>
            </div>

            <div id="groove-tab-classic" class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
                    <div class="presets-container" id="drumPresets"></div>
                    <div class="presets-container" id="userDrumPresetsContainer" style="border-top: 1px solid #334155; padding-top: 0.5rem; display: none;"></div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color);">Step Sequencer</h4>
                        <select id="drumBarsSelect" aria-label="Number of Drum Measures">
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="4">4</option>
                            <option value="8">8</option>
                        </select>
                    </div>
                    <div id="measurePagination" style="display: flex; gap: 0.4rem; margin-bottom: 1rem; align-items: center;"></div>
                    <button id="cloneMeasureBtn" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; margin-bottom: 1rem;">⧉ Copy to All</button>
                    <SequencerGrid />
                </div>
            </div>

            <div id="groove-tab-smart" class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}>
                {/* Genre Selector Omitted for brevity, but should be included */}
            </div>

            <div class="panel-settings-menu grooves-settings-menu">
                <InstrumentSettings module="groove" />
            </div>
        </div>
    );
}

function MobileNav({ activeTab }) {
    return (
        <div class="mobile-tabs-nav">
            <div class="tab-item">
                <button class={`tab-btn ${activeTab === 'chords' ? 'active' : ''}`} data-tab="chords">Chords</button>
                <button id="chordPowerBtn" class="power-btn" aria-label="Toggle Chords">⏻</button>
            </div>
            <div class="tab-item">
                <button class={`tab-btn ${activeTab === 'grooves' ? 'active' : ''}`} data-tab="grooves">Grooves</button>
                <button id="groovePowerBtn" class="power-btn" aria-label="Toggle Grooves">⏻</button>
            </div>
            {/* ... other tabs */}
        </div>
    );
}
