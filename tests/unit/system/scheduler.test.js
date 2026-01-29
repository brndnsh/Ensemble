/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Global Mocks
vi.stubGlobal('window', { 
    addEventListener: vi.fn(), 
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
});
vi.stubGlobal('CustomEvent', class { constructor(type, detail) { this.type = type; this.detail = detail?.detail; } });

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        arranger: { stepMap: [], sections: [], totalSteps: 0, timeSignature: '4/4', measureMap: new Map() },
        playback: { 
            audio: { currentTime: 0 },
            unswungNextNoteTime: 0,
            currentKey: '',
            conductorVelocity: 1.0,
            bandIntensity: 0.5,
            drawQueue: [],
            visualFlash: false,
            metronome: false,
            countIn: false
        },
        groove: { genreFeel: 'Rock', instruments: [], humanize: 0, measures: 1 },
        midi: { enabled: false },
        soloist: { style: 'scalar' },
        vizState: { enabled: false },
        bass: { enabled: false },
        chords: { enabled: false },
        harmony: { enabled: false }
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false }
    }
}));

import { scheduleGlobalEvent } from '../../../public/scheduler-core.js';
import { arranger, playback } from '../../../public/state.js';

describe('Scheduler Core System', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        playback.currentKey = '';
        // Setup a simple song structure with a key change
        // Bar 1 (Step 0): Key A
        // Bar 2 (Step 16): Key B
        arranger.totalSteps = 32;
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', key: 'A', freqs: [], rootMidi: 60, intervals: [0, 4, 7], beats: 4 } },
            { start: 16, end: 32, chord: { sectionId: 's2', key: 'B', freqs: [], rootMidi: 62, intervals: [0, 4, 7], beats: 4 } }
        ];
        arranger.sections = [
            { id: 's1', key: 'A' },
            { id: 's2', key: 'B' }
        ];
    });

    it('should emit a key-updated event when playhead crosses section threshold', () => {
        // Trigger Step 0 (Key A)
        scheduleGlobalEvent(0, 0);
        
        expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'key-change', 
            detail: { key: 'A' } 
        }));
        
        window.dispatchEvent.mockClear();
        
        // Trigger Step 15 (Still Key A)
        scheduleGlobalEvent(15, 0);
        expect(window.dispatchEvent).not.toHaveBeenCalled();
        
        // Trigger Step 16 (Key B)
        scheduleGlobalEvent(16, 0);
        expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'key-change', 
            detail: { key: 'B' } 
        }));
    });
});
