
import { describe, it, beforeEach, expect } from 'vitest';
import { getChordAtStep } from '../../public/logic-worker.js';
import { arranger } from '../../public/state.js';

describe('Worker Oscillation Performance', () => {
    const numSections = 1000;
    const stepsPerSection = 16;
    const totalSteps = numSections * stepsPerSection;

    beforeEach(() => {
        // Setup arranger state
        arranger.stepMap = [];
        arranger.sectionMap = [];
        arranger.totalSteps = totalSteps;

        let currentStep = 0;
        for (let i = 0; i < numSections; i++) {
            const sectionStart = currentStep;
            const sectionEnd = currentStep + stepsPerSection;

            arranger.sectionMap.push({
                start: sectionStart,
                end: sectionEnd,
                id: `s${i}`,
                label: `Section ${i}`
            });

            // 4 chords per section (4 steps each)
            for (let j = 0; j < 4; j++) {
                const chordStart = currentStep;
                const chordEnd = currentStep + 4;
                arranger.stepMap.push({
                    start: chordStart,
                    end: chordEnd,
                    chord: { name: 'C', start: chordStart, sectionId: `s${i}` }
                });
                currentStep += 4;
            }
        }
    });

    it('measures oscillating access pattern (baseline)', () => {
        const start = performance.now();

        // Mimic fillBuffers loop: iterate through steps, accessing current and +4
        // The inefficiency arises when +4 pushes the cached index forward,
        // causing the next loop's 'current' to be behind the cache, triggering a linear search.
        for (let s = 0; s < totalSteps - 4; s++) {
            const current = getChordAtStep(s);
            const lookahead = getChordAtStep(s + 4);

            // Basic sanity check to ensure we aren't optimizing away the calls
            if (!current || !lookahead) {
                throw new Error("Missing chord data");
            }
        }

        const end = performance.now();
        const duration = end - start;
        console.log(`Oscillating scan of ${totalSteps} steps (Baseline): ${duration.toFixed(2)}ms`);
    });

    it('measures oscillating access pattern (optimized with cursors)', () => {
        const start = performance.now();

        const mainCursor = { index: 0, sectionIndex: 0 };
        const lookaheadCursor = { index: 0, sectionIndex: 0 };

        for (let s = 0; s < totalSteps - 4; s++) {
            const current = getChordAtStep(s, mainCursor);
            const lookahead = getChordAtStep(s + 4, lookaheadCursor);

            if (!current || !lookahead) {
                throw new Error("Missing chord data");
            }
        }

        const end = performance.now();
        const duration = end - start;
        console.log(`Oscillating scan of ${totalSteps} steps (Optimized): ${duration.toFixed(2)}ms`);
    });
});
