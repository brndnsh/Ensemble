import { playNote, playChordScratch } from './engine.js';
import { ctx } from './state.js';

/**
 * Chord accompaniment patterns.
 * Each function handles the rhythmic playback for a specific style.
 */
export const chordPatterns = {
    pad: (chord, time, spb, stepInChord) => {
        if (stepInChord === 0) {
            chord.freqs.forEach(f => playNote(f, time, chord.beats * spb, { vol: 0.2, att: 0.5, soft: true, resonance: 4, lfoHz: ctx.bpm / 120 }));
        }
    },
    strum8: (chord, time, spb, measureStep) => {
        if (measureStep % 2 === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb, { vol: (measureStep % 4 === 0 ? 0.2 : 0.15), att: 0.01 }));
        }
    },
    pop: (chord, time, spb, measureStep) => {
        if ([0, 3, 6, 10, 12, 14].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.15), att: 0.01 }));
        }
    },
    rock: (chord, time, spb, measureStep) => {
        if (measureStep % 2 === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.16), att: 0.01 }));
        }
    },
    skank: (chord, time, spb, measureStep) => {
        if (measureStep % 8 === 4) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.5, { vol: 0.22, att: 0.005 }));
        }
    },
    double_skank: (chord, time, spb, measureStep) => {
        if ([4, 6].includes(measureStep % 8)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.35, { vol: 0.18, att: 0.005 }));
        }
    },
    funk: (chord, time, spb, measureStep) => {
        if ([0, 3, 4, 7, 8, 11, 12, 15].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.5, { vol: (measureStep % 4 === 0 ? 0.22 : 0.18), att: 0.005 }));
        } else {
            playChordScratch(time, 0.08);
        }
    },
    arpeggio: (chord, time, spb, stepInChord, measureStep) => {
        if (measureStep % 2 === 0) {
            const idx = Math.floor(stepInChord / 2) % chord.freqs.length;
            playNote(chord.freqs[idx], time, spb * 2.0, { vol: 0.2, att: 0.01 });
        }
    },
    tresillo: (chord, time, spb, measureStep) => {
        if ([0, 3, 6, 8, 11, 14].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.5, { vol: 0.2, att: 0.01 }));
        }
    },
    clave: (chord, time, spb, measureStep) => {
        if ([0, 3, 6, 10, 12].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.0, { vol: 0.2, att: 0.01 }));
        }
    },
    afrobeat: (chord, time, spb, measureStep) => {
        if ([0, 3, 6, 7, 10, 12, 13, 15].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.3, { vol: 0.18, att: 0.01 }));
        }
    },
    jazz: (chord, time, spb, measureStep) => {
        if ([0, 6, 14].includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.8, { vol: 0.18, att: 0.01 }));
        } else if (measureStep % 4 === 0 && Math.random() < 0.2) {
            playChordScratch(time, 0.04);
        }
    },
    green: (chord, time, spb, measureStep) => {
        if (measureStep % 4 === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.4, { vol: (measureStep % 8 === 4 ? 0.22 : 0.18), att: 0.01 }));
        }
    },
    bossa: (chord, time, spb, measureStep, step) => {
        const pattern = (Math.floor(step / 16) % 2 === 1) ? [0, 3, 6, 8, 11, 14] : [0, 3, 6, 10, 13];
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.2, { vol: 0.2, att: 0.01 }));
        }
    }
};