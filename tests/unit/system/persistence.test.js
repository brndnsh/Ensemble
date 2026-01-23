/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi, dispatch } from '../../../public/state.js';
import { saveCurrentState } from '../../../public/persistence.js';

// Mock storage
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        harmony: { enabled: false, buffer: new Map() },
        storage: {
            save: vi.fn(),
            get: vi.fn()
        }
    };
});

describe('Persistence Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should save the complete state accurately', () => {
        // Setup a complex state
        arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
        arranger.key = 'Gb';
        playback.bpm = 115;
        groove.genreFeel = 'Bossa Nova';
        groove.instruments[0].steps[0] = 1; // Kick on 1
        
        saveCurrentState();
        
        expect(storage.save).toHaveBeenCalledWith('currentState', expect.any(Object));
        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        
        expect(savedData.key).toBe('Gb');
        expect(savedData.bpm).toBe(115);
        expect(savedData.groove.genreFeel).toBe('Bossa Nova');
        expect(savedData.sections[0].label).toBe('Verse');
        
        // Check drum pattern serialization
        const kickPattern = savedData.groove.pattern.find(i => i.name === 'Kick');
        expect(kickPattern.steps[0]).toBe(1);
    });

    it('should include all required module properties (chords, bass, soloist, groove)', () => {
        saveCurrentState();
        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        
        expect(savedData.chords).toBeDefined();
        expect(savedData.bass).toBeDefined();
        expect(savedData.soloist).toBeDefined();
        expect(savedData.groove).toBeDefined();
        
        // Specific checks for persistence keys
        expect(savedData.chords).toHaveProperty('pianoRoots');
        expect(savedData.groove).toHaveProperty('followPlayback');
        expect(savedData.groove).toHaveProperty('humanize');
    });
});
