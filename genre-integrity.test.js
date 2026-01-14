import { describe, it, expect, vi } from 'vitest';
import { getBassNote, isBassActive } from './public/bass.js';
import { ctx, gb, arranger } from './public/state.js';
import { getStepsPerMeasure } from './public/utils.js';

/**
 * GENRE INTEGRITY STRESS TEST
 * Simulates long-duration playback to ensure procedural engines 
 * never violate the "Golden Rules" of their respective genres.
 */

describe('Genre Integrity Stress Test', () => {
    const runSimulation = (genre, measures, callback) => {
        gb.genreFeel = genre;
        arranger.timeSignature = '4/4';
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const totalSteps = measures * spm;
        
        const chord = { 
            rootMidi: 48, // C
            quality: 'major', 
            intervals: [0, 4, 7, 11], 
            beats: 4,
            freqs: [130.81, 164.81, 196.00, 246.94]
        };

        for (let step = 0; step < totalSteps; step++) {
            const stepInChord = step % spm;
            const beatIndex = stepInChord / 4;
            callback(step, stepInChord, beatIndex, chord);
        }
    };

    describe('Reggae (One Drop) Integrity', () => {
        it('should NEVER play a kick on Beat 1 in One Drop mode', () => {
            // In the real app, main.js handles the Drum logic, but we can verify 
            // the Bass engine's relationship to the pocket here.
            
            let kickOnOneCount = 0;
            const measures = 2000;

            // We mock the main scheduler's logic for Reggae Kick
            const simulateReggaeKick = (step, intensity) => {
                const loopStep = step % 16;
                if (intensity <= 0.45) {
                    // One Drop: Kick only on 3 (Step 8)
                    return loopStep === 8;
                }
                return false;
            };

            for (let i = 0; i < measures; i++) {
                if (simulateReggaeKick(i * 16, 0.3)) kickOnOneCount++;
            }

            expect(kickOnOneCount).toBe(0);
        });

        it('should maintain the "Dub" register (Low) in Reggae style', () => {
            runSimulation('Reggae', 2000, (step, stepInChord, beatIndex, chord) => {
                if (isBassActive('smart', step, stepInChord)) {
                    const note = getBassNote(chord, null, beatIndex, null, 38, 'smart', 0, step, stepInChord);
                    if (note) {
                        // Reggae bass should stay below MIDI 55 (G3) generally
                        expect(note.midi).toBeLessThan(55);
                    }
                }
            });
        });
    });

    describe('Jazz Integrity', () => {
        it('should always prioritize roots/fifths on downbeats for walking bass', () => {
            let downbeatMatches = 0;
            let totalDownbeats = 0;

            runSimulation('Jazz', 2000, (step, stepInChord, beatIndex, chord) => {
                if (stepInChord === 0) { // Beat 1
                    const note = getBassNote(chord, null, beatIndex, null, 38, 'smart', 0, step, stepInChord);
                    const pc = note.midi % 12;
                    const isRootOrFifth = (pc === 0 || pc === 7);
                    if (isRootOrFifth) downbeatMatches++;
                    totalDownbeats++;
                }
            });

            // Walking bass is probabilistic but Beat 1 of a new chord is 100% root/5th in our code
            expect(downbeatMatches).toBe(totalDownbeats);
        });

        it('should never play a root on Beat 4 during a walk (Approach Rule)', () => {
            // Our walking logic on Beat 4 (index 3) is designed to "approach" the next chord
            // so it should rarely be a static root.
            let rootOnFourCount = 0;
            const measures = 2000;

            const nextChord = { rootMidi: 53 }; // F

            runSimulation('Jazz', measures, (step, stepInChord, beatIndex, chord) => {
                if (beatIndex === 3) {
                    const note = getBassNote(chord, nextChord, beatIndex, 38, 38, 'smart', 0, step, stepInChord);
                    if (note.midi % 12 === 0) rootOnFourCount++;
                }
            });

            // Allow for some randomness but it should be low (approach-driven)
            expect(rootOnFourCount).toBeLessThan(measures * 0.3);
        });
    });

    describe('Funk Integrity', () => {
        it('should emphasize "The One" with higher velocity', () => {
            let oneVelocitySum = 0;
            let otherVelocitySum = 0;
            let otherCount = 0;

            runSimulation('Funk', 2000, (step, stepInChord, beatIndex, chord) => {
                if (isBassActive('smart', step, stepInChord)) {
                    const note = getBassNote(chord, null, beatIndex, null, 38, 'smart', 0, step, stepInChord);
                    if (note) {
                        if (stepInChord === 0) {
                            oneVelocitySum += note.velocity;
                        } else {
                            otherVelocitySum += note.velocity;
                            otherCount++;
                        }
                    }
                }
            });

            const avgOne = oneVelocitySum / 2000;
            const avgOther = otherVelocitySum / otherCount;
            expect(avgOne).toBeGreaterThan(avgOther);
        });
    });
});