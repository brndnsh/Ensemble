import { h, render } from 'preact';
import { StyleSelector } from './components/StyleSelector.jsx';
import { Transport } from './components/Transport.jsx';
import { Settings } from './components/Settings.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
import { Arranger } from './components/Arranger.jsx';
import { SequencerGrid } from './components/SequencerGrid.jsx';
import { ChordVisualizer } from './components/ChordVisualizer.jsx';
import { CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES } from './presets.js';

export function mountComponents() {
    console.log("[UI-Root] Mounting Preact Components...");
    
    // 1. Style Selectors
    const styleMounts = [
        { id: 'chordStylePresets', Component: StyleSelector, props: { module: 'chords', styles: CHORD_STYLES } },
        { id: 'bassStylePresets', Component: StyleSelector, props: { module: 'bass', styles: BASS_STYLES } },
        { id: 'soloistStylePresets', Component: StyleSelector, props: { module: 'soloist', styles: SOLOIST_STYLES } },
        { id: 'harmonyStylePresets', Component: StyleSelector, props: { module: 'harmony', styles: HARMONY_STYLES } },
    ];

    styleMounts.forEach(({ id, Component, props }) => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '';
            render(<Component {...props} />, container);
        }
    });

    // 2. Transport (Replaces .main-controls)
    const header = document.querySelector('header');
    const legacyControls = header ? header.querySelector('.main-controls') : null;
    if (header && legacyControls) {
        render(<Transport />, header, legacyControls);
    }

    // 3. Settings Modal (Replaces .settings-content)
    const settingsOverlay = document.getElementById('settingsOverlay');
    const legacySettingsContent = settingsOverlay ? settingsOverlay.querySelector('.settings-content') : null;
    if (settingsOverlay && legacySettingsContent) {
        render(<Settings />, settingsOverlay, legacySettingsContent);
    }

    // 4. Instrument Settings (Mixer & Config)
    const instrumentMounts = [
        { id: 'panel-chords', module: 'chords' },
        { id: 'panel-grooves', module: 'groove' },
        { id: 'panel-bass', module: 'bass' },
        { id: 'panel-soloist', module: 'soloist' },
        { id: 'panel-harmonies', module: 'harmony' }
    ];

    instrumentMounts.forEach(({ id, module }) => {
        const panel = document.getElementById(id);
        if (panel) {
            const menu = panel.querySelector('.panel-settings-menu');
            if (menu) {
                menu.innerHTML = ''; 
                render(<InstrumentSettings module={module} />, menu);
            }
        }
    });

    // 5. Arranger (Replaces #sectionList content)
    const sectionList = document.getElementById('sectionList');
    if (sectionList) {
        sectionList.innerHTML = '';
        render(<Arranger />, sectionList);
    }

    // 6. Sequencer Grid
    const sequencerGrid = document.getElementById('sequencerGrid');
    if (sequencerGrid) {
        sequencerGrid.innerHTML = '';
        render(<SequencerGrid />, sequencerGrid);
    }

    // 7. Chord Visualizer
    const chordVisualizer = document.getElementById('chordVisualizer');
    if (chordVisualizer) {
        chordVisualizer.innerHTML = '';
        render(<ChordVisualizer />, chordVisualizer);
    }
}