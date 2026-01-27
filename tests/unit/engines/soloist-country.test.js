/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../../public/state.js', () => ({
    soloist: { 
        enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
        qaState: 'Question', isResting: false, contourSteps: 0,
        melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
        lastFreq: 440, lastInterval: 0, hookRetentionProb: 0.5, doubleStops: true,
        sessionSteps: 1000, deviceBuffer: [], pitchHistory: [], pitchHistoryLimit: 128
    },
    chords: { enabled: true },
    bass: { enabled: true },
    harmony: { enabled: true, rhythmicMask: 0, complexity: 0.5 },
    playback: { bandIntensity: 0.8, complexity: 0.5, bpm: 120, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
    arranger: { 
        key: 'C', 
        isMinor: false, 
        progression: new Array(16).fill({}),
        totalSteps: 64,
        stepMap: [{start: 0, end: 64, chord: {sectionId: 'A'}}],
        timeSignature: '4/4'
    },
    groove: { genreFeel: 'Country' }
}));

import { getSoloistNote } from '../../../public/soloist.js';
import { getScaleForChord } from '../../../public/theory-scales.js';
import { soloist, groove } from '../../../public/state.js';

describe('Country Soloist Overhaul', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };
    const chordAm = { rootMidi: 57, intervals: [0, 3, 7], quality: 'minor', beats: 4 };

    beforeEach(() => {
        soloist.isResting = false;
        soloist.currentPhraseSteps = 1;
        soloist.notesInPhrase = 0;
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.pitchHistory = [];
        groove.genreFeel = 'Country';
    });

    describe('Harmonic Accuracy', () => {
        it('should use pure Major Pentatonic for Major chords in Country style', () => {
            const scale = getScaleForChord(chordC, null, 'country');
            // Expected: [0, 2, 4, 7, 9] (Major Pentatonic)
            expect(scale).toEqual([0, 2, 4, 7, 9]);
        });

        it('should use Major Pentatonic + b3 if tension is high', () => {
            soloist.tension = 0.8;
            const scale = getScaleForChord(chordC, null, 'country');
            expect(scale).toEqual([0, 2, 3, 4, 7, 9]);
        });

        it('should use Minor Pentatonic for Minor chords in Country style', () => {
            const scale = getScaleForChord(chordAm, null, 'country');
            // Expected: [0, 3, 5, 7, 10] (Minor Pentatonic)
            expect(scale).toEqual([0, 3, 5, 7, 10]);
        });
    });

    describe('Country Devices', () => {
        it('should trigger countryBend device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                // We need to trigger the device selection. deviceProb is 0.4.
                // We call getSoloistNote and check if the result is a double stop with a bend
                const res = getSoloistNote(chordC, null, 16, 440, 72, 'country', 0);
                
                // countryBend returns an array with bendStartInterval -1 on the first note
                if (Array.isArray(res) && res.some(n => n.bendStartInterval === -1)) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger chickenPick device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                const res = getSoloistNote(chordC, null, 16, 440, 72, 'country', 0);
                
                // chickenPick returns a double stop with duration 1 and velocity >= 1.2
                if (Array.isArray(res) && res.every(n => n.durationSteps === 1) && res[0].velocity >= 1.2) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger banjoRoll device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                getSoloistNote(chordC, null, 16, 440, 72, 'country', 0);
                if (soloist.deviceBuffer.length === 3) { // 4 note roll, 1 returned, 3 in buffer
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger graceSlide device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                const res = getSoloistNote(chordC, null, 16, 440, 72, 'country', 0);
                if (res && !Array.isArray(res) && soloist.deviceBuffer.length === 1 && res.velocity >= 0.5) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });
    });

    describe('Style Configuration', () => {
        it('should favor sixths in double stops for country style', () => {
            let sixths = 0;
            let totalDS = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0);
                if (Array.isArray(res)) {
                    totalDS++;
                    const top = res[0].midi;
                    const bottom = res[1].midi;
                    const diff = Math.abs(top - bottom);
                    if (diff === 8 || diff === 9) sixths++;
                }
            }
            expect(sixths / totalDS).toBeGreaterThan(0.5);
        });

        it('should have high double stop probability', () => {
            let doubleStops = 0;
            let total = 0;
            for (let i = 0; i < 2000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0);
                if (res) {
                    total++;
                    if (Array.isArray(res)) doubleStops++;
                }
            }
            // country doubleStopProb is 0.5.
            expect(doubleStops / total).toBeGreaterThan(0.25);
        });

        it('should favor pentatonic color tones (2, 9) in country style', () => {
            let colorTones = 0;
            let total = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];
                
                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0);
                if (res) {
                    const note = Array.isArray(res) ? res[res.length - 1] : res;
                    const interval = (note.midi - chordC.rootMidi + 120) % 12;
                    if (interval === 2 || interval === 9) colorTones++;
                    total++;
                }
            }
            // 2 and 9 are 2/5 of pentatonic. With bonus, should be well represented.
            expect(colorTones / total).toBeGreaterThan(0.3);
        });
    });
});
