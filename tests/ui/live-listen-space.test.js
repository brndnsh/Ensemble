/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupUIHandlers } from '../../public/ui-controller.js';

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

describe('Live Listen Spacebar Conflict', () => {
    let togglePlayMock;

    beforeEach(() => {
        vi.clearAllMocks();
        togglePlayMock = vi.fn();

        document.body.innerHTML = `
            <div id="analyzerOverlay" class="overlay" aria-hidden="true"></div>
            <div id="editorOverlay" class="overlay" aria-hidden="true"></div>
            <div id="settingsOverlay" class="overlay" aria-hidden="true"></div>
            <div id="templatesOverlay" class="overlay" aria-hidden="true"></div>
            <div id="exportOverlay" class="overlay" aria-hidden="true"></div>

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

            <input type="radio" name="analyzerMode" value="chords" checked>
            <input type="radio" name="analyzerMode" value="melody">
            
            <button id="closeAnalyzerBtn"></button>
            <div id="analyzerDropZone"></div>
            <input id="analyzerFileInput">
            <button id="liveListenBtn"></button>
            <div id="liveChordDisplay"></div>
            <button id="captureLiveHistoryBtn"></button>
            <button id="stopLiveListenBtn"></button>
            <button id="startAnalysisBtn"></button>
            <button id="applyAnalysisBtn"></button>
            <input id="analyzerStartInput">
            <input id="analyzerEndInput">
            <div id="analyzerProgressBar"></div>
            
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
        
        setupUIHandlers({ togglePlay: togglePlayMock });
    });

    it('should toggle playback when space is pressed and analyzer is NOT active', () => {
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
        expect(togglePlayMock).toHaveBeenCalledTimes(1);
    });

    it('should NOT toggle playback when space is pressed and analyzer IS active', () => {
        const analyzer = document.getElementById('analyzerOverlay');
        analyzer.classList.add('active');
        
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
        expect(togglePlayMock).not.toHaveBeenCalled();
    });

    it('should still toggle playback when typing in an input even if space is pressed (wait, typing should ALREADY be blocked)', () => {
        // This is just verifying existing behavior
        const input = document.getElementById('bpmInput');
        input.focus();
        
        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
        input.dispatchEvent(event);
        expect(togglePlayMock).not.toHaveBeenCalled();
    });
});
