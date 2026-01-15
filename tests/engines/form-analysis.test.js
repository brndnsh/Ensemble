import { describe, it, expect, vi } from 'vitest';

// Mock the state module
vi.mock('../../public/state.js', () => ({
    arranger: {
        stepMap: []
    }
}));

import { getSectionEnergy, analyzeForm } from '../../public/form-analysis.js';
import { arranger } from '../../public/state.js';

describe('Form Analysis', () => {
    describe('getSectionEnergy', () => {
        it('should return 0.9 for "Chorus"', () => {
            expect(getSectionEnergy('Chorus')).toBe(0.9);
        });

        it('should return 0.5 for "Verse"', () => {
            expect(getSectionEnergy('Verse')).toBe(0.5);
        });

        it('should return 0.4 for "Intro"', () => {
            expect(getSectionEnergy('Intro')).toBe(0.4);
        });

        it('should return 0.5 for unknown labels', () => {
            expect(getSectionEnergy('Banana')).toBe(0.5);
        });
    });

    describe('analyzeForm', () => {
        it('should return null if stepMap is empty', () => {
            arranger.stepMap = [];
            expect(analyzeForm()).toBeNull();
        });

        it('should identify a basic Intro-Chorus structure', () => {
            // Mock a 2-section song: Intro (4 bars) and Chorus (4 bars)
            const section1Id = 's1';
            const section2Id = 's2';
            
            const introSteps = Array.from({ length: 16 }, (_, i) => ({
                chord: { sectionId: section1Id, sectionLabel: 'Intro', value: 'I', rootMidi: 60 },
                start: i,
                end: i + 1
            }));
            
            const chorusSteps = Array.from({ length: 16 }, (_, i) => ({
                chord: { sectionId: section2Id, sectionLabel: 'Chorus', value: 'IV', rootMidi: 65 },
                start: 16 + i,
                end: 16 + i + 1
            }));
            
            arranger.stepMap = [...introSteps, ...chorusSteps];
            
            const form = analyzeForm();
            expect(form).not.toBeNull();
            expect(form.sections).toHaveLength(2);
            expect(form.sections[0].role).toBe('Exposition'); // Intro is Exposition
            expect(form.sections[1].role).toBe('Climax');     // Chorus is Climax (hard override)
        });

        it('should calculate harmonic flux correctly', () => {
            // Mock a section with high flux (chord change every beat)
            const sectionId = 's1';
            const highFluxSteps = [];
            for (let i = 0; i < 16; i++) {
                highFluxSteps.push({
                    chord: { 
                        sectionId, 
                        sectionLabel: 'Verse', 
                        value: i % 2 === 0 ? 'I' : 'IV', 
                        rootMidi: i % 2 === 0 ? 60 : 65 
                    },
                    start: i,
                    end: i + 1
                });
            }
            
            arranger.stepMap = highFluxSteps;
            const form = analyzeForm();
            // 16 changes in 1 bar (16 steps) = flux of 16? 
            // The code: bars = sectionSteps.length / 16 = 1. changes = 16. flux = 16/1 = 16.
            expect(form.sections[0].flux).toBeGreaterThan(1);
        });

        it('should identify repeated sections and assign "Development" or "Recapitulation"', () => {
            const s1Id = 's1';
            const s2Id = 's1'; // Same ID to simulate repetition of same content
            
            const verse1 = Array.from({ length: 16 }, (_, i) => ({
                chord: { sectionId: 'v1', sectionLabel: 'Verse', value: 'I', rootMidi: 60 },
                start: i, end: i + 1
            }));
            
            const verse2 = Array.from({ length: 16 }, (_, i) => ({
                chord: { sectionId: 'v2', sectionLabel: 'Verse', value: 'I', rootMidi: 60 },
                start: 16 + i, end: 16 + i + 1
            }));
            
            arranger.stepMap = [...verse1, ...verse2];
            
            const form = analyzeForm();
            expect(form.sections[0].iteration).toBe(1);
            expect(form.sections[1].iteration).toBe(2);
            expect(form.sections[1].role).toBe('Recapitulation'); // Last section that is a repeat
        });
    });
});
