/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arranger, ctx, cb, bb, sb, gb, vizState, storage } from '../public/state.js';
import { saveCurrentState } from '../public/persistence.js';

// Mock storage
vi.mock('../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
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
        ctx.bpm = 115;
        gb.genreFeel = 'Bossa Nova';
        gb.instruments[0].steps[0] = 1; // Kick on 1
        
        saveCurrentState();
        
        expect(storage.save).toHaveBeenCalledWith('currentState', expect.any(Object));
        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        
        expect(savedData.key).toBe('Gb');
        expect(savedData.bpm).toBe(115);
        expect(savedData.gb.genreFeel).toBe('Bossa Nova');
        expect(savedData.sections[0].label).toBe('Verse');
        
        // Check drum pattern serialization
        const kickPattern = savedData.gb.pattern.find(i => i.name === 'Kick');
        expect(kickPattern.steps[0]).toBe(1);
    });

    it('should include all required module properties (cb, bb, sb, gb)', () => {
        saveCurrentState();
        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        
        expect(savedData.cb).toBeDefined();
        expect(savedData.bb).toBeDefined();
        expect(savedData.sb).toBeDefined();
        expect(savedData.gb).toBeDefined();
        
        // Specific checks for persistence keys
        expect(savedData.cb).toHaveProperty('practiceMode');
        expect(savedData.gb).toHaveProperty('followPlayback');
        expect(savedData.gb).toHaveProperty('humanize');
    });
});
