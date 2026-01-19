import { generateResolutionNotes } from '../../public/resolution.js';
import { expect, describe, it } from 'vitest';

describe('Resolution Logic', () => {

    const enabled = { bb: true, cb: true, sb: true, gb: true };

    it('should use the global key if stepMap is empty', () => {
        const arranger = {
            key: 'C',
            isMinor: false,
            stepMap: []
        };

        const notes = generateResolutionNotes(100, arranger, enabled);
        
        // Find the bass note (bb) which is (keyPC % 12) + 24
        // C is index 0. Bass should be 24.
        const bassNote = notes.find(n => n.module === 'bb');
        expect(bassNote).to.exist;
        expect(bassNote.midi).to.equal(24);
    });

    it('should use the key of the last chord in stepMap', () => {
        const arranger = {
            key: 'C', // Global key
            isMinor: false,
            stepMap: [
                {
                    chord: {
                        key: 'D', // Modulation to D
                        rootMidi: 62
                    },
                    start: 0,
                    end: 16
                }
            ]
        };

        const notes = generateResolutionNotes(100, arranger, enabled);
        
        // D is index 2 in KEY_ORDER (C, Db, D...)
        // Bass note should be 2 + 24 = 26
        const bassNote = notes.find(n => n.module === 'bb');
        expect(bassNote).to.exist;
        expect(bassNote.midi).to.equal(26);
    });

    it('should fall back to global key if last chord has no key', () => {
        const arranger = {
            key: 'E',
            isMinor: false,
            stepMap: [
                {
                    chord: {}, // Missing key
                    start: 0,
                    end: 16
                }
            ]
        };

        const notes = generateResolutionNotes(100, arranger, enabled);
        
        // E is index 4. Bass should be 4 + 24 = 28.
        const bassNote = notes.find(n => n.module === 'bb');
        expect(bassNote).to.exist;
        expect(bassNote.midi).to.equal(28);
    });
});
