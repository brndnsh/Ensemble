/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ui } from '../../public/ui.js';
import { setupUIHandlers } from '../../public/ui-controller.js';
import * as State from '../../public/state.js';

// Mock State
vi.mock('../../public/state.js', () => ({
    playback: { isPlaying: false, bandIntensity: 0.5, viz: {}, audio: { currentTime: 0 } },
    groove: { currentMeasure: 0, measures: 4, instruments: [], swing: 0, humanize: 0 },
    arranger: { key: 'C', timeSignature: '4/4', sections: [] },
    chords: { activeTab: 'classic', style: 'classic', volume: 1, reverb: 0 },
    bass: { activeTab: 'classic', style: 'classic', volume: 1, reverb: 0, enabled: true },
    soloist: { activeTab: 'classic', style: 'classic', volume: 1, reverb: 0, enabled: true },
    harmony: { activeTab: 'classic', style: 'classic', volume: 1, reverb: 0, complexity: 0 },
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    midi: { enabled: false, outputs: [], chordsChannel: 1, bassChannel: 2, soloistChannel: 3, harmonyChannel: 4, drumsChannel: 10 }
}));

// Mock Presets
vi.mock('../../public/presets.js', () => ({
    CHORD_STYLES: [],
    SOLOIST_STYLES: [],
    BASS_STYLES: [],
    HARMONY_STYLES: [],
    DRUM_PRESETS: {},
    CHORD_PRESETS: [],
    SONG_TEMPLATES: []
}));

describe('Modal Accessibility Focus', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="settingsOverlay" class="overlay">
                <input id="testInput" type="checkbox">
            </div>
            <div id="editorOverlay" class="overlay"></div>
            <div id="exportOverlay" class="overlay"></div>
            <div id="templatesOverlay" class="overlay"></div>
            <div id="analyzerOverlay" class="overlay"></div>
            
            <button id="playBtn">Play</button>
            <input id="bpmInput">
            <button id="tapBtn">Tap</button>
            <button id="addSectionBtn">Add</button>
            <button id="templatesBtn">Templates</button>
            <button id="closeTemplatesBtn">Close</button>
            <button id="undoBtn">Undo</button>
            <button id="arrangerActionTrigger">Actions</button>
            <div id="arrangerActionMenu"></div>
            <div id="analyzeAudioBtn"></div>
            <button id="randomizeBtn">Rnd</button>
            <button id="mutateBtn">Mut</button>
            <button id="clearProgBtn">Clear</button>
            <button id="saveBtn">Save</button>
            <button id="saveDrumBtn">SaveDrum</button>
            <button id="shareBtn">Share</button>
            <button id="transUpBtn">Up</button>
            <button id="transDownBtn">Down</button>
            <button id="relKeyBtn">Rel</button>
            <button id="installAppBtn">Install</button>
            <button id="settingsBtn">Settings</button>
            <button id="closeSettingsBtn">CloseSettings</button>
            <button id="resetSettingsBtn">Reset</button>
            <button id="refreshAppBtn">Refresh</button>
            <button id="exportMidiBtn">Export</button>
            <button id="settingsExportMidiBtn">Export2</button>
            <button id="closeExportBtn">CloseExport</button>
            <button id="confirmExportBtn">Confirm</button>
            <input id="exportChordsCheck" type="checkbox">
            <input id="exportBassCheck" type="checkbox">
            <input id="exportSoloistCheck" type="checkbox">
            <input id="exportHarmoniesCheck" type="checkbox">
            <input id="exportDrumsCheck" type="checkbox">
            <input id="exportDurationInput">
            <button id="clearDrumsBtn"></button>
            <button id="maximizeChordBtn"></button>
            <input name="exportMode" value="loop" type="radio">
            <input name="exportMode" value="time" type="radio">
            <button id="exportDurationDec"></button>
            <button id="exportDurationInc"></button>
            <button id="editArrangementBtn"></button>
            <button id="closeEditorBtn"></button>
            <select id="keySelect"></select>
            <select id="timeSigSelect"></select>
            <div id="groupingLabel"></div>
            <select id="notationSelect"></select>
            <input id="pianoRootsCheck" type="checkbox">
            <select id="themeSelect"></select>
            <select id="densitySelect"></select>
            <input id="chordVolume">
            <input id="bassVolume">
            <input id="soloistVolume">
            <input id="harmonyVolume">
            <input id="drumVolume">
            <input id="masterVolume">
            <input id="chordReverb">
            <input id="bassReverb">
            <input id="soloistReverb">
            <input id="harmonyReverb">
            <input id="drumReverb">
            <input id="swingSlider">
            <select id="swingBaseSelect"></select>
            <input id="humanizeSlider">
            <select id="drumBarsSelect"></select>
            <button id="cloneMeasureBtn"></button>
            <input id="hapticCheck" type="checkbox">
            <input id="harmonyComplexity">
            <input id="sessionTimerCheck" type="checkbox">
            <input id="sessionTimerInput">
            <button id="sessionTimerDec"></button>
            <button id="sessionTimerInc"></button>
            <input id="applyPresetSettingsCheck" type="checkbox">
            <input id="soloistDoubleStops" type="checkbox">
            <input id="larsModeCheck" type="checkbox">
            <input id="larsIntensitySlider">
            
            <div id="intensitySlider"></div>
            <div id="complexitySlider"></div>
            <input id="autoIntensityCheck" type="checkbox">

            <!-- Analyzer Inputs -->
            <input type="radio" name="analyzerMode" value="chords" checked>
            <input type="radio" name="analyzerMode" value="melody">
            
            <button id="closeAnalyzerBtn"></button>
            <div id="analyzerDropZone"></div>
            <input id="analyzerFileInput">
            <button id="liveListenBtn"></button>
            <button id="stopLiveListenBtn"></button>
            <input id="analyzerStartInput">
            <input id="analyzerEndInput">
            <button id="startAnalysisBtn"></button>
            <button id="applyAnalysisBtn"></button>
            
            <input id="midiEnableCheck" type="checkbox">
            <input id="midiMuteLocalCheck" type="checkbox">
            <select id="midiOutputSelect"></select>
            <input id="midiLatencySlider">
            <input id="midiVelocitySlider">
            <input id="midiChordsChannel">
            <input id="midiBassChannel">
            <input id="midiSoloistChannel">
            <input id="midiHarmonyChannel">
            <input id="midiDrumsChannel">
            <input id="midiChordsOctave">
            <input id="midiBassOctave">
            <input id="midiSoloistOctave">
            <input id="midiHarmonyOctave">
            <input id="midiDrumsOctave">
        `;
        
        setupUIHandlers({});
    });

    it('should set aria-hidden="true" on modals by default', () => {
        const settings = document.getElementById('settingsOverlay');
        expect(settings.getAttribute('aria-hidden')).toBe('true');
    });

    it('should toggle aria-hidden when modal becomes active', async () => {
        const settings = document.getElementById('settingsOverlay');
        const btn = document.getElementById('settingsBtn');
        
        // Open
        btn.click();
        await new Promise(resolve => setTimeout(resolve, 0)); // Wait for MutationObserver
        expect(settings.classList.contains('active')).toBe(true);
        expect(settings.getAttribute('aria-hidden')).toBe('false');

        // Close
        const closeBtn = document.getElementById('closeSettingsBtn');
        closeBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0)); // Wait for MutationObserver
        expect(settings.classList.contains('active')).toBe(false);
        expect(settings.getAttribute('aria-hidden')).toBe('true');
    });

    it('should correctly handle Editor modal toggling', async () => {
        const editor = document.getElementById('editorOverlay');
        expect(editor.getAttribute('aria-hidden')).toBe('true');
        
        const btn = document.getElementById('editArrangementBtn');
        btn.click();
        
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(editor.classList.contains('active')).toBe(true);
        expect(editor.getAttribute('aria-hidden')).toBe('false');
    });
});
