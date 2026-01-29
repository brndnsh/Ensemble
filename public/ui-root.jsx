import { h, render } from 'preact';
import { StyleSelector } from './components/StyleSelector.jsx';
import { CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES } from './presets.js';

export function mountComponents() {
    console.log("[UI-Root] Mounting Preact Components...");
    
    const mounts = [
        { id: 'chordStylePresets', Component: StyleSelector, props: { module: 'chords', styles: CHORD_STYLES } },
        { id: 'bassStylePresets', Component: StyleSelector, props: { module: 'bass', styles: BASS_STYLES } },
        { id: 'soloistStylePresets', Component: StyleSelector, props: { module: 'soloist', styles: SOLOIST_STYLES } },
        { id: 'harmonyStylePresets', Component: StyleSelector, props: { module: 'harmony', styles: HARMONY_STYLES } },
    ];

    mounts.forEach(({ id, Component, props }) => {
        const container = document.getElementById(id);
        if (container) {
            // Clear legacy content just in case
            container.innerHTML = '';
            render(<Component {...props} />, container);
        } else {
            console.warn(`[UI-Root] Container #${id} not found.`);
        }
    });
}
