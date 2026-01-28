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
    midi: { enabled: false, outputs: [] }
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

describe('Song Generator Modal', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <!-- Generate Song Modal -->
            <div id="generateSongOverlay" class="settings-overlay">
                <button id="closeGenerateSongBtn">Cancel</button>
                <button id="confirmGenerateSongBtn">Generate</button>
                <select id="genKeySelect"></select>
                <select id="genTimeSigSelect"></select>
                <select id="genStructureSelect"></select>
            </div>

            <div id="settingsOverlay" class="settings-overlay"></div>
            <div id="editorOverlay" class="settings-overlay"></div>
            <div id="exportOverlay" class="settings-overlay"></div>
            <div id="templatesOverlay" class="settings-overlay"></div>
            <div id="analyzerOverlay" class="modal-overlay"></div>
            
            <button id="arrangerActionTrigger">Actions</button>
            <div id="arrangerActionMenu"></div>
            <button id="randomizeBtn">Random</button>
            
            <!-- Other required elements to prevent crashes -->
            <button id="playBtn"></button>
            <input id="bpmInput">
            <button id="tapBtn"></button>
            <button id="addSectionBtn"></button>
            <button id="templatesBtn"></button>
            <button id="closeTemplatesBtn"></button>
            <button id="undoBtn"></button>
            <div id="analyzeAudioBtn"></div>
            <button id="mutateBtn"></button>
            <button id="clearProgBtn"></button>
            <button id="saveBtn"></button>
            <button id="saveDrumBtn"></button>
            <button id="shareBtn"></button>
            <button id="transUpBtn"></button>
            <button id="transDownBtn"></button>
            <button id="relKeyBtn"></button>
            <button id="installAppBtn"></button>
            <button id="settingsBtn"></button>
            <button id="closeSettingsBtn"></button>
            <button id="resetSettingsBtn"></button>
            <button id="refreshAppBtn"></button>
            <button id="exportMidiBtn"></button>
            <button id="settingsExportMidiBtn"></button>
            <button id="closeExportBtn"></button>
            <button id="confirmExportBtn"></button>
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
        
        setupUIHandlers({});
    });

    it('should be initially hidden', () => {
        const modal = document.getElementById('generateSongOverlay');
        expect(modal.classList.contains('active')).toBe(false);
        expect(modal.getAttribute('aria-hidden')).toBe('true');
    });

    it('should open when Random button is clicked', async () => {
        const modal = document.getElementById('generateSongOverlay');
        const btn = document.getElementById('randomizeBtn');
        
        btn.click();
        
        // Wait for setTimeout(..., 10)
        await new Promise(resolve => setTimeout(resolve, 50));
        
        expect(modal.classList.contains('active')).toBe(true);
        expect(modal.style.display).toBe('flex');
    });

    it('should close when Cancel button is clicked', async () => {
        const modal = document.getElementById('generateSongOverlay');
        const openBtn = document.getElementById('randomizeBtn');
        const closeBtn = document.getElementById('closeGenerateSongBtn');
        
        openBtn.click();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(modal.classList.contains('active')).toBe(true);
        
        closeBtn.click();
        expect(modal.classList.contains('active')).toBe(false);
    });
    
    it('should close when clicking outside the modal content', async () => {
        const modal = document.getElementById('generateSongOverlay');
        const openBtn = document.getElementById('randomizeBtn');
        
        openBtn.click();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(modal.classList.contains('active')).toBe(true);
        
        // Click the overlay background
        modal.click();
        expect(modal.classList.contains('active')).toBe(false);
    });
});
