import { describe, it, expect, vi } from 'vitest';
import { generateResolutionNotes } from '../../public/resolution.js';

// Mock config.js
vi.mock('../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
}));

// Mock utils.js
vi.mock('../../public/utils.js', () => ({
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq || 440 / 440))
}));

describe('Resolution Logic', () => {
    it('generates resolution notes for enabled instruments', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };
        const bpm = 120;
        const step = 64;

        const notes = generateResolutionNotes(step, arranger, enabled, bpm);

        expect(notes.length).toBeGreaterThan(0);
        
        // Check for Bass Notes (V -> I)
        const bassNotes = notes.filter(n => n.module === 'bass');
        expect(bassNotes.length).toBe(2); // V and I

        // Check timing offsets
        const times = notes.map(n => n.timingOffset);
        // console.log(JSON.stringify(notes, null, 2));

        // Ensure all have timingOffset
        times.forEach(t => expect(t).toBeDefined());

        times.sort((a, b) => a - b);
        expect(times[0]).toBe(0); // First beat
        expect(times[times.length - 1]).toBeGreaterThan(0); // Later beats
    });

    it('handles minor key resolution correctly', () => {
        const arranger = { key: 'C', isMinor: true };
        const enabled = { chords: true };
        const notes = generateResolutionNotes(0, arranger, enabled, 100);
        
        expect(notes.length).toBeGreaterThan(0);
    });
});
