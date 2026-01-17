import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, hookRetentionProb: 0.5, doubleStops: false,
        sessionSteps: 1000, deviceBuffer: []
    },
    cb: { enabled: true },
    ctx: { bandIntensity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: []
    },
    gb: { genreFeel: 'Neo-Soul' }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { sb } from '../../../public/state.js';

describe('Neo-Soul Phrasing Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 11], quality: 'maj7', beats: 4 };

    beforeEach(() => {
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
        sb.busySteps = 0;
        sb.deviceBuffer = [];
    });

    it('should produce sustained notes (durationSteps >= 4) on downbeats', () => {
        let sustainedCount = 0;
        let totalDownbeatNotes = 0;
        
        for (let i = 0; i < 2000; i++) {
            sb.isResting = false;
            sb.currentPhraseSteps = 1;
            sb.notesInPhrase = 0;
            sb.busySteps = 0;
            sb.currentCell = [1, 1, 1, 1]; // Force cell with notes everywhere
            
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'neo', 0);
            if (result) {
                totalDownbeatNotes++;
                if (result.durationSteps >= 4) sustainedCount++;
            }
        }
        
        const sustainRate = sustainedCount / totalDownbeatNotes;
        expect(sustainRate).toBeGreaterThan(0.85); // Should almost always sustain on Beat 1 in Neo-Soul
    });

    it('should occasionally include soulful scoops (bendStartInterval > 0) on long notes', () => {
        let bendCount = 0;
        let longNoteCount = 0;
        
        for (let i = 0; i < 2000; i++) {
            sb.isResting = false;
            sb.currentPhraseSteps = 1;
            sb.notesInPhrase = 0;
            sb.busySteps = 0;
            sb.currentCell = [1, 1, 1, 1]; // Force cell with notes everywhere
            
            const result = getSoloistNote(chordC, null, 16, 440, 72, 'neo', 0);
            if (result && result.durationSteps >= 4) {
                longNoteCount++;
                if (result.bendStartInterval > 0) bendCount++;
            }
        }
        
        const bendRate = bendCount / longNoteCount;
        expect(bendRate).toBeGreaterThan(0.2); // 30% prob in code
        expect(bendRate).toBeLessThan(0.4);
    });
});
