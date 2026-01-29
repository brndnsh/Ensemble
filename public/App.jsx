import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { useEnsembleState } from './ui-bridge.js';
import { Transport } from './components/Transport.jsx';
import { Arranger } from './components/Arranger.jsx';
import { SequencerGrid } from './components/SequencerGrid.jsx';
import { ChordVisualizer } from './components/ChordVisualizer.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
import { StyleSelector } from './components/StyleSelector.jsx';
import { PresetLibrary } from './components/PresetLibrary.jsx';
import { KeySignatureControls } from './components/KeySignatureControls.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES } from './presets.js';
import { dispatch, groove } from './state.js';
import { ACTIONS } from './types.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { ModalManager } from './ui-modal-controller.js';
import { togglePower, updateMeasures, cloneMeasure } from './instrument-controller.js';
import { triggerInstall } from './pwa.js';

export function App() {
    const { 
        vizEnabled,
        grooveMobileTab
    } = useEnsembleState(s => ({
        vizEnabled: s.vizState.enabled,
        grooveMobileTab: s.groove.mobileTab
    }));

    return (
        <Fragment>
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
            </div>

            <Modals />
            <NotificationLayer />
        </Fragment>
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
    const openEditor = () => {
        const overlay = document.getElementById('editorOverlay');
        if (overlay) ModalManager.open(overlay);
    };

    return (
        <div class="panel dashboard-panel active-mobile" id="panel-arranger" data-id="arranger">
            <div class="panel-header chord-panel-header">
                <div class="panel-title-group">
                    <h2>Arranger</h2>
                </div>
                <div class="panel-header-controls">
                    <KeySignatureControls />
                </div>
            </div>

            <div className="display-area" id="chordVisualizer">
                <ChordVisualizer />
            </div>
            
            <div id="activeSectionLabel" class="active-section-label"></div>

            <div style="margin-bottom: 1.5rem;">
                <button id="editArrangementBtn" class="primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;" onClick={openEditor}>
                    <span>✏️</span> Edit Arrangement
                </button>
            </div>

            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem; min-height: 100px;">
                <label class="library-label">Library</label>
                <PresetLibrary type="chord" />
                <div class="presets-container" id="userPresetsContainer" style="border-top: 1px solid #334155; padding-top: 0.5rem; display: none;"></div>
            </div>
        </div>
    );
}

function VisualizerPanel({ enabled }) {
    const handleToggle = () => {
        togglePower('viz');
    };

    return (
        <div class={`panel dashboard-panel ${!enabled ? 'collapsed' : ''}`} id="panel-visualizer" data-id="visualizer">
            <div class="panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <button id="vizPowerBtn" class={`power-btn ${enabled ? 'active' : ''}`} aria-label="Toggle Visualizer" onClick={handleToggle}>⏻</button>
                    <h2>Visualizer</h2>
                </div>
            </div>
            
            <div class="viz-graph-area">
                <div id="unifiedVizContainer"></div>
            </div>
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

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const switchTab = (tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab });
        syncWorker();
        saveCurrentState();
    };

    const headerClass = `${module === 'chords' ? 'chord' : (module === 'harmony' ? 'harmony' : module)}-panel-header`;

    return (
        <div class={`panel dashboard-panel instrument-panel ${activeTab === 'smart' ? 'smart-active' : ''}`} id={id} data-id={module}>
            <div class={`panel-header ${headerClass}`}>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>{title}</h2>
                </div>
                <div class="instrument-tabs">
                    <button 
                        class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`} 
                        onClick={() => switchTab('classic')}
                    >Classic</button>
                    <button 
                        class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`} 
                        onClick={() => switchTab('smart')}
                    >Smart</button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button 
                        class={`panel-menu-btn ${isMenuOpen ? 'active' : ''}`} 
                        aria-label="Settings"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >⋮</button>
                    <button 
                        class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`} 
                        id={`${module === 'chords' ? 'chord' : module}PowerBtnDesktop`} 
                        aria-label={`Toggle ${title}`}
                        onClick={() => togglePower(module)}
                    >⏻</button>
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

            <div class={`panel-settings-menu ${isMenuOpen ? 'open' : ''}`}>
                <InstrumentSettings module={module} />
            </div>
        </div>
    );
}

function GroovePanel() {
    const { activeTab, enabled, measures } = useEnsembleState(s => ({
        activeTab: s.groove.activeTab,
        enabled: s.groove.enabled,
        measures: s.groove.measures
    }));

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const switchTab = (tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab });
        syncWorker();
        saveCurrentState();
    };

    return (
        <div class="panel dashboard-panel instrument-panel" id="panel-grooves" data-id="grooves">
            <div class="panel-header groove-panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>Grooves</h2>
                </div>
                <div class="instrument-tabs">
                    <button 
                        class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`} 
                        onClick={() => switchTab('classic')}
                    >Classic</button>
                    <button 
                        class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`} 
                        onClick={() => switchTab('smart')}
                    >Smart</button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button 
                        class={`panel-menu-btn ${isMenuOpen ? 'active' : ''}`} 
                        aria-label="Settings"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >⋮</button>
                    <button 
                        class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`} 
                        id="groovePowerBtnDesktop" 
                        aria-label="Toggle Grooves"
                        onClick={() => togglePower('groove')}
                    >⏻</button>
                </div>
            </div>

            <div id="groove-tab-classic" class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
                    <PresetLibrary type="drum" />
                    <div class="presets-container" id="userDrumPresetsContainer" style="border-top: 1px solid #334155; padding-top: 0.5rem; display: none;"></div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color);">Step Sequencer</h4>
                        <select 
                            id="drumBarsSelect" 
                            aria-label="Number of Drum Measures"
                            value={measures}
                            onChange={(e) => updateMeasures(e.target.value)}
                        >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="4">4</option>
                            <option value="8">8</option>
                        </select>
                    </div>
                    <div id="measurePagination" style="display: flex; gap: 0.4rem; margin-bottom: 1rem; align-items: center;"></div>
                    <button id="cloneMeasureBtn" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; margin-bottom: 1rem;" onClick={cloneMeasure}>⧉ Copy to All</button>
                    <div className="sequencer-grid" id="sequencerGrid">
                        <SequencerGrid />
                    </div>
                </div>
            </div>

            <div id="groove-tab-smart" class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}>
                <GenreSelector />
                <IntensitySlider />
                <ComplexitySlider />
            </div>

            <div class={`panel-settings-menu grooves-settings-menu ${isMenuOpen ? 'open' : ''}`}>
                <InstrumentSettings module="groove" />
            </div>
        </div>
    );
}

function IntensitySlider() {
    const { bandIntensity, autoIntensity } = useEnsembleState(s => ({
        bandIntensity: s.playback.bandIntensity,
        autoIntensity: s.playback.autoIntensity
    }));

    return (
        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;">
                <label style="font-size: 0.9rem; color: #94a3b8;">Intensity (Global)</label>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <label style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.3rem; cursor: pointer;">
                        <input 
                            type="checkbox" 
                            checked={autoIntensity} 
                            onChange={(e) => {
                                dispatch(ACTIONS.SET_AUTO_INTENSITY, e.target.checked);
                                saveCurrentState();
                            }}
                        /> Auto
                    </label>
                    <span style="color: var(--accent-color); font-weight: bold; font-size: 0.9rem;">{Math.round(bandIntensity * 100)}%</span>
                </div>
            </div>
            <input 
                id="intensitySlider"
                type="range" 
                min="0" 
                max="100" 
                value={Math.round(bandIntensity * 100)} 
                onInput={(e) => {
                    dispatch(ACTIONS.SET_BAND_INTENSITY, parseInt(e.target.value) / 100);
                }}
                disabled={autoIntensity}
                style={{ width: '100%', height: '6px', opacity: autoIntensity ? 0.5 : 1 }} 
            />
        </div>
    );
}

function ComplexitySlider() {
    const complexity = useEnsembleState(s => s.playback.complexity);

    let label = 'Low';
    if (complexity > 0.33) label = 'Medium';
    if (complexity > 0.66) label = 'High';

    return (
        <div class="smart-control-group" style="margin-bottom: 1rem;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">
                <span>Complexity</span>
                <span style="color: var(--accent-color); font-weight: bold;">{label}</span>
            </label>
            <input 
                id="complexitySlider"
                type="range" 
                min="0" 
                max="100" 
                value={Math.round(complexity * 100)} 
                onInput={(e) => {
                    dispatch(ACTIONS.SET_COMPLEXITY, parseInt(e.target.value) / 100);
                }}
                style="width: 100%; height: 6px;" 
            />
        </div>
    );
}

function GenreSelector() {
    const { lastSmartGenre, pendingGenreFeel } = useEnsembleState(s => ({
        lastSmartGenre: s.groove.lastSmartGenre,
        pendingGenreFeel: s.groove.pendingGenreFeel
    }));

    const genres = [
        'Rock', 'Jazz', 'Funk', 'Disco', 'Hip Hop', 'Blues', 
        'Neo-Soul', 'Reggae', 'Acoustic', 'Bossa', 'Country', 'Metal'
    ];

    const handleGenreClick = (genre) => {
        import('./presets.js').then(({ SMART_GENRES }) => {
            const config = SMART_GENRES[genre];
            if (config) {
                import('./state.js').then(({ groove }) => {
                    Object.assign(groove, { lastSmartGenre: genre });
                    dispatch(ACTIONS.SET_GENRE_FEEL, {
                        genreName: genre,
                        feel: config.feel,
                        swing: config.swing,
                        sub: config.sub,
                        drum: config.drum,
                        chord: config.chord,
                        bass: config.bass,
                        soloist: config.soloist
                    });
                    syncWorker();
                    saveCurrentState();
                });
            }
        });
    };

    return (
        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Genre</label>
            <div class="genre-selector">
                {genres.map(genre => {
                    const isActive = genre === lastSmartGenre && !pendingGenreFeel;
                    const isPending = pendingGenreFeel && (pendingGenreFeel.genreName === genre);
                    
                    return (
                        <button 
                            key={genre}
                            className={`genre-btn ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
                            data-genre={genre}
                            onClick={() => handleGenreClick(genre)}
                            aria-pressed={isActive ? 'true' : 'false'}
                        >
                            {genre}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function MobileNav({ activeTab }) {
    const switchMobileTab = (tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab: 'mobile', target: tab });
        import('./state.js').then(({ groove }) => {
            groove.mobileTab = tab;
            dispatch('MOBILE_TAB_SWITCH');
            syncWorker();
            saveCurrentState();
        });
    };

    return (
        <div class="mobile-tabs-nav">
            {[
                { id: 'chords', label: 'Chords', module: 'chords' },
                { id: 'grooves', label: 'Grooves', module: 'groove' },
                { id: 'bass', label: 'Bass', module: 'bass' },
                { id: 'soloist', label: 'Soloist', module: 'soloist' },
                { id: 'harmonies', label: 'Harmony', module: 'harmony' }
            ].map(tab => {
                const isActive = (activeTab === tab.id) || (activeTab === 'mobile' && tab.id === 'grooves');
                const moduleState = useEnsembleState(s => s[tab.module]);
                const enabled = moduleState?.enabled;

                return (
                    <div key={tab.id} class="tab-item">
                        <button 
                            class={`tab-btn ${isActive ? 'active' : ''}`} 
                            onClick={() => switchMobileTab(tab.id)}
                        >{tab.label}</button>
                        <button 
                            id={`${tab.module === 'chords' ? 'chord' : tab.module}PowerBtn`} 
                            class={`power-btn ${enabled ? 'active' : ''}`} 
                            aria-label={`Toggle ${tab.label}`}
                            onClick={() => togglePower(tab.module)}
                        >⏻</button>
                    </div>
                );
            })}
        </div>
    );
}