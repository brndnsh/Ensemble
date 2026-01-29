import { h, render } from 'preact';
import { StyleSelector } from './components/StyleSelector.jsx';
import { Transport } from './components/Transport.jsx';
import { Settings } from './components/Settings.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
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
        // We replace the legacy controls div with our new Component
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
                menu.innerHTML = ''; // Clear legacy HTML
                // We keep the container for CSS (positioning) and render inside
                render(<InstrumentSettings module={module} />, menu);
            }
        }
    });
}