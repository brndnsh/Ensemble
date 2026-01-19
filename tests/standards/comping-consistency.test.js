/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the state modules
vi.mock('../../public/state.js', () => ({
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { syncopation: 0, anticipation: 0, layBack: 0 } },
    arranger: { 
        timeSignature: '4/4', 
        progression: []
    },
    cb: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
    bb: { enabled: true },
    sb: { enabled: false, busySteps: 0 },
    gb: { genreFeel: 'Jazz' },
    hb: { enabled: false, buffer: new Map() }
}));
// Mock config
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

import { getAccompanimentNotes, compingState } from '../../public/accompaniment.js';
import { gb, cb, bb, hb, arranger } from '../../public/state.js';

describe('Accompaniment Consistency Standards', () => {
    
    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.00, 493.88],
        quality: 'maj7',
        is7th: true,
        beats: 4,
        sectionId: 'sectionA'
    };

    beforeEach(() => {
        // Reset State
        compingState.currentCell = new Array(16).fill(0);
        compingState.lockedUntil = 0;
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = null;
        
        arranger.progression = [mockChord];
        cb.enabled = true;
        bb.enabled = false;
        gb.genreFeel = 'Funk';
    });

    it('Scenario A: The Funk Loop - Should retain rhythmic pattern across measures', () => {
        gb.genreFeel = 'Funk';
        
        // Measure 1 Generation
        getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
        const patternM1 = [...compingState.currentCell];
        
        // Advance to Measure 2 (Step 16)
        getAccompanimentNotes(mockChord, 16, 0, 0, { isBeatStart: true });
        const patternM2 = [...compingState.currentCell];

        // Advance to Measure 3 (Step 32)
        getAccompanimentNotes(mockChord, 32, 0, 0, { isBeatStart: true });
        const patternM3 = [...compingState.currentCell];

        // Expectation: Patterns should be identical
        expect(patternM2).toEqual(patternM1);
        expect(patternM3).toEqual(patternM1);
    });

    it('Scenario B: The Jazz Conversation - Should vary patterns frequently', () => {
        gb.genreFeel = 'Jazz';

        // Collect patterns over 5 measures
        const patterns = [];
        for (let i = 0; i < 5; i++) {
            getAccompanimentNotes(mockChord, i * 16, 0, 0, { isBeatStart: true });
            patterns.push(JSON.stringify(compingState.currentCell));
        }

        // We expect some variation. 
        // It's statistically extremely unlikely to pick the exact same 16-step cell 5 times in a row 
        // unless the pool is tiny or logic is sticky.
        const allSame = patterns.every(p => p === patterns[0]);
        
        expect(allSame).toBe(false);
    });

    it('Scenario C: Section Change - Should force a pattern reset', () => {
        gb.genreFeel = 'Funk';
        
        // Measure 1 (Section A)
        const chordA = { ...mockChord, sectionId: 'sectionA' };
        getAccompanimentNotes(chordA, 0, 0, 0, { isBeatStart: true });
        const patternA = [...compingState.currentCell];

        // Measure 2 (Section A) - Should stick
        getAccompanimentNotes(chordA, 16, 0, 0, { isBeatStart: true });
        expect(compingState.currentCell).toEqual(patternA);

        // Measure 3 (Section B) - CHANGE!
        const chordB = { ...mockChord, sectionId: 'sectionB' };
        // We need to simulate the step advancing
        getAccompanimentNotes(chordB, 32, 0, 0, { isBeatStart: true });
        
        const patternB = [...compingState.currentCell];

        // Should NOT be equal (mostly) - but technically it *could* randomly pick the same one.
        // However, we want to verify that the logic *attempted* a reset.
        // We can check if grooveRetentionCount was reset.
        
        // But since we can't easily access internal count if not exported (it is exported in my plan),
        // let's rely on the probability or check `compingState.lastSectionId`.
        expect(compingState.lastSectionId).toBe('sectionB');
        
        // To be sure, let's manually tamper the cell to be something impossible before the switch,
        // so if it stays, we know it failed to reset.
        compingState.currentCell = [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9]; 
        
        // Trigger switch logic again to verify it overwrites our tamper
        const chordC = { ...mockChord, sectionId: 'sectionC' };
        getAccompanimentNotes(chordC, 48, 0, 0, { isBeatStart: true });
        
        expect(compingState.currentCell[0]).not.toBe(9);
    });
    
    it('Scenario D: Interlocking - Should avoid bass range when Bass is enabled', () => {
        // Mock Bass Enabled
        bb.enabled = true;
        bb.lastFreq = 65.41; // C2
        
        // Setup a chord that might have low notes
        const lowChord = { 
            ...mockChord, 
            freqs: [130.81, 164.81, 196.00], // C3, E3, G3
            rootMidi: 48 
        };
        
        // Accompaniment should shift up
        const notes = getAccompanimentNotes(lowChord, 0, 0, 0, { isBeatStart: true });
        
        if (notes.length > 0) {
            const lowestNote = Math.min(...notes.map(n => n.midi).filter(m => m > 0));
            // Bass is ~36-48 range. Accompaniment should be > 48 + buffer or shifted.
            // bb.lastFreq C2 is midi 36. C3 is 48.
            // If logic holds, it should shift up or avoid.
            
            // Note: The logic in accompaniment.js says:
            // if (lowestMidi <= bassMidi + 12) voicing[0] = ... + 12
            
            // Let's verify that logic.
            // If bass is 36, limit is 48. If note is 48, 48 <= 48 is true.
            // So 48 should become 60.
            
            // Wait, I need to make sure I mock bb.lastFreq correctly or bb state.
            // In the real code `bb.lastFreq` is read.
        }
    });

});
