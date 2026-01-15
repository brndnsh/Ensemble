import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../public/state.js', () => ({
    sb: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000
    },
    cb: { enabled: true, octave: 60, density: 'standard', practiceMode: false },
    ctx: { bandIntensity: 0.5, bpm: 220, audio: { currentTime: 0 } },
    arranger: { 
        key: 'B', 
        isMinor: false,
        progression: [],
        totalSteps: 0,
        stepMap: [],
        timeSignature: '4/4',
        sections: []
    },
    gb: { genreFeel: 'Jazz' },
    bb: { enabled: true }
}));

vi.mock('../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 }
    };
});

vi.mock('../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote, getScaleForChord } from '../public/soloist.js';
import { getBassNote } from '../public/bass.js';
import { validateProgression } from '../public/chords.js';
import { arranger, sb } from '../public/state.js';

describe('Jazz Standard Test: Giant Steps', () => {
    
    beforeEach(() => {
        arranger.key = 'B';
        arranger.isMinor = false;
        // Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7
        arranger.sections = [
            { id: 'Main', label: 'Main', value: "Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7" }
        ];
        validateProgression();
        
        sb.isResting = false;
        sb.currentPhraseSteps = 0;
        sb.notesInPhrase = 0;
    });

    it('should select correct scales for rapid major-third key shifts', () => {
        const progression = arranger.progression;
        
        // 1. Bmaj7 (I)
        expect(getScaleForChord(progression[0], progression[1], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]);
        
        // 2. D7 (V of G)
        // Transition from B Major area to G Major area
        const scaleD7 = getScaleForChord(progression[1], progression[2], 'bird');
        expect(scaleD7).toEqual([0, 2, 4, 5, 7, 9, 10]); // Mixolydian

        // 3. Ebmaj7 (New key center)
        const ebmaj7 = progression[4]; 
        expect(ebmaj7.absName).toContain('Ebmaj7');
        expect(getScaleForChord(ebmaj7, progression[5], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]);
    });

    it('should maintain voice leading through "Coltrane Changes"', () => {
        const progression = arranger.progression;
        let lastAvg = null;

        progression.forEach((chord) => {
            const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
            const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

            if (lastAvg !== null) {
                const drift = Math.abs(currentAvg - lastAvg);
                // Even with large jumps, the engine should keep voicings close (under 7 semitones)
                expect(drift).toBeLessThan(7);
            }
            lastAvg = currentAvg;
        });
    });

    it('should generate a walking bass line that handles two chords per bar', () => {
        let prevMidi = 38; 
        
        // Test first 4 bars (which have mixed 1 and 2 chords per bar)
        // Bar 1: Bmaj7 D7 (8 steps each)
        // Bar 2: Gmaj7 Bb7
        // Bar 3: Ebmaj7 (16 steps)
        for (let bar = 0; bar < 4; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                const globalStep = (bar * 16) + (beat * 4);
                const chordEntry = arranger.stepMap.find(m => globalStep >= m.start && globalStep < m.end);
                const currentChord = chordEntry.chord;
                const nextChord = arranger.stepMap.find(m => (globalStep + 4) >= m.start && (globalStep + 4) < m.end)?.chord;

                const result = getBassNote(currentChord, nextChord, beat, 440 * Math.pow(2, (prevMidi - 69) / 12), 38, 'quarter', 0, globalStep, globalStep - chordEntry.start);
                
                expect(result).not.toBeNull();
                const midi = result.midi;

                // Beat 1 of ANY chord should be root
                if (globalStep === chordEntry.start) {
                    expect(midi % 12).toBe(currentChord.rootMidi % 12);
                }

                prevMidi = midi;
            }
        }
    });

    it('should select Phrygian Dominant when anticipating minor resolutions', () => {
        // Giant steps doesn't have many minor resolutions, but let's check Am7 D7 Gmaj7
        // progression[6] is Am7, progression[7] is D7, progression[8] is Gmaj7. 
        // No minor resolution here. 
        // Let's force a minor resolution to check logic integrity in this standard's context
        const am7 = arranger.progression.find(c => c.absName.startsWith('Am7'));
        const d7 = arranger.progression.find(c => c.absName.startsWith('D7'));
        const gm = { rootMidi: 55, quality: 'minor', intervals: [0, 3, 7] };
        
        const scale = getScaleForChord(d7, gm, 'bird');
        expect(scale).toEqual([0, 1, 4, 5, 7, 8, 10]); // Phrygian Dominant
    });
});
