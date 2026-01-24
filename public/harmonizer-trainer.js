import { getScaleForChord } from './theory-scales.js';

/**
 * Harmonizer Trainer
 * Extracts musical knowledge from the Ensemble Band modules.
 */
export class HarmonizerTrainer {
    /**
     * "Trains" the harmonizer by simulating the Soloist's choices
     * over every possible chord type.
     */
    static async train() {
        const chordQualities = [
            'major', 'minor', '7', 'maj7', 'm7', 'dim', 'halfdim', 
            'aug', 'sus4', 'sus2', 'm9', 'maj9', '9', '13', '7alt'
        ];
        
        const knowledgeBase = {};

        chordQualities.forEach(quality => {
            // Simulate a chord at Root 0 (C)
            const mockChord = {
                quality: quality,
                rootMidi: 60, // C4
                is7th: quality.includes('7') || ['9', '13', '7alt'].includes(quality),
                intervals: [0, 4, 7] // Simplification for scale lookup
            };

            // Get the scales the Soloist would use for this chord across different styles
            const styles = ['smart', 'blues', 'bird', 'neo', 'funk', 'minimal'];
            const noteWeights = new Float32Array(12).fill(0);

            styles.forEach(style => {
                const scale = getScaleForChord(mockChord, null, style);
                scale.forEach(note => {
                    const pc = note % 12;
                    noteWeights[pc] += 1.0;
                });
            });

            // Normalize weights
            const max = Math.max(...noteWeights);
            const normalized = Array.from(noteWeights).map(w => max > 0 ? w / max : 0);

            knowledgeBase[quality] = normalized;
        });

        return knowledgeBase;
    }
}
