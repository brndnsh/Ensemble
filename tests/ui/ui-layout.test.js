/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ui, initUI, renderSections, renderGrid, renderChordVisualizer } from '../../public/ui.js';
import { arranger, gb, cb } from '../../public/state.js';

// Mock dependencies that we don't need for layout testing
vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn()
}));
vi.mock('../../public/instrument-controller.js', () => ({
    clearDrumPresetHighlight: vi.fn()
}));

describe('UI Layout Integrity', () => {
    beforeEach(() => {
        // Setup a minimal DOM for initUI to bind to
        document.body.innerHTML = `
            <div id="sectionList"></div>
            <div id="sequencerGrid"></div>
            <div id="playBtn"></div>
            <div id="bpmInput"></div>
            <div id="timeSigSelect"></div>
            <select id="keySelect"></select>
            <div id="chordVisualizer"></div>
            <div id="measurePagination"></div>
            <div id="drumBarsSelect"></div>
        `;
        
        // ... (mockIds setup)
        const mockIds = [
            'tapBtn', 'relKeyBtn', 'transUpBtn', 'transDownBtn',
            'maximizeChordBtn', 'chordPowerBtn', 'groovePowerBtn', 'bassPowerBtn', 'soloistPowerBtn',
            'chordPowerBtnDesktop', 'groovePowerBtnDesktop', 'bassPowerBtnDesktop', 'soloistPowerBtnDesktop',
            'vizPowerBtn', 'addSectionBtn', 'templatesBtn', 'templatesOverlay', 'templateChips', 'closeTemplatesBtn',
            'activeSectionLabel', 'arrangerActionTrigger', 'arrangerActionMenu', 'randomizeBtn', 'mutateBtn', 'undoBtn',
            'clearProgBtn', 'saveBtn', 'shareBtn', 'chordPresets', 'userPresetsContainer',
            'chordStylePresets', 'bassStylePresets', 'soloistStylePresets', 'groupingToggle', 'groupingLabel',
            'chordReverb', 'bassReverb', 'soloistReverb', 'drumPresets', 'userDrumPresetsContainer',
            'cloneMeasureBtn', 'autoFollowCheck', 'humanizeSlider', 'saveDrumBtn', 'drumReverb', 'smartDrumPresets',
            'settingsOverlay', 'settingsBtn', 'themeSelect', 'notationSelect', 'densitySelect', 'practiceModeCheck',
            'swingSlider', 'exportMidiBtn', 'settingsExportMidiBtn', 'exportOverlay', 'closeExportBtn', 'confirmExportBtn',
            'exportChordsCheck', 'exportBassCheck', 'exportSoloistCheck', 'exportDrumsCheck', 'exportDurationInput',
            'exportDurationContainer', 'exportFilenameInput', 'installAppBtn', 'flashOverlay', 'resetSettingsBtn',
            'refreshAppBtn', 'editorOverlay', 'editArrangementBtn', 'closeEditorBtn', 'intensitySlider', 'complexitySlider',
            'intensityValue', 'autoIntensityCheck', 'complexityValue', 'panel-visualizer', 'chordVolume', 'bassVolume',
            'soloistVolume', 'drumVolume', 'clearDrumsBtn', 'masterVolume', 'countInCheck', 'metronomeCheck',
            'visualFlashCheck', 'hapticCheck', 'applyPresetSettingsCheck', 'swingBaseSelect', 'closeSettingsBtn',
            'sessionTimerSelect'
        ];
        
        mockIds.forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement('div');
                el.id = id;
                document.body.appendChild(el);
            }
        });

        initUI();
    });

    describe('renderChordVisualizer', () => {
        it('should render correct number of chords and measures', () => {
            arranger.timeSignature = '4/4';
            arranger.progression = [
                { sectionId: 's1', sectionLabel: 'Intro', beats: 4, display: { roman: { root: 'I', suffix: '' } } },
                { sectionId: 's1', sectionLabel: 'Intro', beats: 4, display: { roman: { root: 'V', suffix: '' } } }
            ];
            
            renderChordVisualizer();
            
            const cards = document.querySelectorAll('.chord-card');
            expect(cards.length).toBe(2);
            
            const measures = document.querySelectorAll('.measure-box');
            expect(measures.length).toBe(2);
            
            const sections = document.querySelectorAll('.section-block');
            expect(sections.length).toBe(1);
        });

        it('should handle multi-chord measures correctly', () => {
            arranger.timeSignature = '4/4';
            arranger.progression = [
                { sectionId: 's1', sectionLabel: 'A', beats: 2, display: { roman: { root: 'I', suffix: '' } } },
                { sectionId: 's1', sectionLabel: 'A', beats: 2, display: { roman: { root: 'IV', suffix: '' } } }
            ];
            
            renderChordVisualizer();
            
            const measures = document.querySelectorAll('.measure-box');
            expect(measures.length).toBe(1);
            
            const cards = measures[0].querySelectorAll('.chord-card');
            expect(cards.length).toBe(2);
        });
    });

    describe('renderSections', () => {
        it('should render the correct number of section cards', () => {
            const sections = [
                { id: '1', label: 'A', value: 'I' },
                { id: '2', label: 'B', value: 'IV' }
            ];
            renderSections(sections, vi.fn(), vi.fn(), vi.fn());
            
            const cards = document.querySelectorAll('.section-card');
            expect(cards.length).toBe(2);
        });

        it('should clear existing sections before re-rendering', () => {
            const sections = [{ id: '1', label: 'A', value: 'I' }];
            renderSections(sections, vi.fn(), vi.fn(), vi.fn());
            renderSections(sections, vi.fn(), vi.fn(), vi.fn());
            
            const cards = document.querySelectorAll('.section-card');
            expect(cards.length).toBe(1);
        });

        it('should include correct sub-elements in each section card', () => {
            const sections = [{ id: '1', label: 'Verse', value: 'I' }];
            renderSections(sections, vi.fn(), vi.fn(), vi.fn());
            
            const card = document.querySelector('.section-card');
            expect(card.querySelector('.section-label-input')).not.toBeNull();
            expect(card.querySelector('.section-prog-input')).not.toBeNull();
            expect(card.querySelector('.section-delete-btn')).not.toBeNull();
        });
    });

    describe('renderGrid', () => {
        it('should render the correct number of instruments and steps', () => {
            // Setup gb state
            gb.instruments = [
                { name: 'Kick', steps: new Array(128).fill(0) },
                { name: 'Snare', steps: new Array(128).fill(0) }
            ];
            gb.measures = 1;
            arranger.timeSignature = '4/4';

            renderGrid();

            const rows = document.querySelectorAll('.track:not(.label-row)');
            expect(rows.length).toBe(2);

            // In 4/4, 1 measure has 16 steps
            const steps = rows[0].querySelectorAll('.step');
            expect(steps.length).toBe(16);
        });

        it('should update step count when measures change', () => {
            gb.instruments = [{ name: 'Kick', steps: new Array(128).fill(0) }];
            gb.measures = 2;
            arranger.timeSignature = '4/4';

            renderGrid();

            const steps = document.querySelectorAll('.step');
            expect(steps.length).toBe(32);
        });

        it('should not leak rows when re-rendering', () => {
            gb.instruments = [
                { name: 'Kick', steps: new Array(128).fill(0) },
                { name: 'Snare', steps: new Array(128).fill(0) }
            ];
            gb.measures = 1;
            arranger.timeSignature = '4/4';

            renderGrid();
            renderGrid();
            renderGrid();

            const rows = document.querySelectorAll('.track:not(.label-row)');
            expect(rows.length).toBe(2);
        });

        it('should render the correct number of subdivision labels', () => {
            gb.instruments = [{ name: 'Kick', steps: new Array(128).fill(0) }];
            gb.measures = 1;
            arranger.timeSignature = '4/4';

            renderGrid();

            const labelRow = document.querySelector('.label-row');
            expect(labelRow).not.toBeNull();
            const labels = labelRow.querySelectorAll('.steps > div');
            expect(labels.length).toBe(16);
        });
    });

    describe('Key Picker', () => {
        it('should not have redundant "Key: " prefix in options', async () => {
            // Import the function directly
            const { updateKeySelectLabels } = await import('../../public/ui.js');
            
            const keySelect = document.getElementById('keySelect');
            const opt = document.createElement('option');
            opt.value = 'C';
            opt.textContent = 'Key: C';
            keySelect.appendChild(opt);
            
            updateKeySelectLabels();
            expect(keySelect.options[0].textContent).not.toContain('Key:');
            expect(keySelect.options[0].textContent).toBe('C');
        });
    });
});
