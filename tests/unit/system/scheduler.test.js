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

vi.mock('../../../public/state.js', () => ({
    arranger: { stepMap: [], sections: [] },
    playback: { audio: { currentTime: 0 } },
    groove: { genreFeel: 'Rock' }
}));

import { scheduleGlobalEvent } from '../../../public/scheduler-core.js';
import { arranger } from '../../../public/state.js';

describe('Scheduler Core System', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup a simple song structure with a key change
        // Bar 1 (Step 0): Key A
        // Bar 2 (Step 16): Key B
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', key: 'A' } },
            { start: 16, end: 32, chord: { sectionId: 's2', key: 'B' } }
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
