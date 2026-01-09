import { playNote, playChordScratch } from './engine.js';
import { ctx, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';

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
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        if (measureStep % 2 === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb, { vol: (measureStep % ts.stepsPerBeat === 0 ? 0.2 : 0.15), att: 0.01 }));
        }
    },
    pop: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 10, 12, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '6/8') pattern = [0, 3, 6, 9]; // Dotted quarter feels
        else if (ts === '7/4') pattern = [0, 3, 6, 9, 12, 16, 20, 24]; // 4+3 feel
        else if (ts === '12/8') pattern = [0, 3, 6, 9, 12, 15, 18, 21];
        else if (ts === '5/4') pattern = [0, 3, 6, 10, 14, 18];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.15), att: 0.01 }));
        }
    },
    rock: (chord, time, spb, measureStep) => {
        if (measureStep % 2 === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.16), att: 0.01 }));
        }
    },
    skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        // Skank is on the "and": step 4, 12 in 4/4. Step 4, 12, 20 in 6/4? 
        // Better: step ts.stepsPerBeat / 2 + k * ts.stepsPerBeat
        if (measureStep % ts.stepsPerBeat === (ts.stepsPerBeat / 2)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.5, { vol: 0.22, att: 0.005 }));
        }
    },
    double_skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const off = ts.stepsPerBeat / 2;
        if ([off, off + 2].includes(measureStep % ts.stepsPerBeat)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.35, { vol: 0.18, att: 0.005 }));
        }
    },
    funk: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 4, 7, 8, 11, 12, 15]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 4, 7, 8, 11];
        else if (ts === '6/8') pattern = [0, 2, 4, 6, 8, 10];
        else if (ts === '7/4') pattern = [0, 3, 4, 7, 8, 11, 12, 16, 19, 20, 23, 24]; // Funky 7
        
        if (pattern.includes(measureStep)) {
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
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 8, 11, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 9, 12, 15, 18, 21, 24]; // Extended Tresillo
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.5, { vol: 0.2, att: 0.01 }));
        }
    },
    clave: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 10, 13]; // 3-2 Son Clave
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 10, 13, 16, 20]; // Extended Clave
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.0, { vol: 0.2, att: 0.01 }));
        }
    },
    afrobeat: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 7, 10, 12, 13, 15];
        if (ts === '3/4') pattern = [0, 3, 6, 7, 10];
        else if (ts === '7/4') pattern = [0, 3, 6, 7, 10, 12, 13, 15, 16, 19, 22, 25];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.3, { vol: 0.18, att: 0.01 }));
        }
    },
    jazz: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 6, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 4, 10];
        else if (ts === '6/8') pattern = [0, 6];
        else if (ts === '7/4') pattern = [0, 6, 14, 20, 26]; // Syncopated
        else if (ts === '12/8') pattern = [0, 6, 12, 18];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.8, { vol: 0.18, att: 0.01 }));
        } else if (measureStep % 4 === 0 && Math.random() < 0.2) {
            playChordScratch(time, 0.04);
        }
    },
    green: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        if (measureStep % ts.stepsPerBeat === 0) {
            chord.freqs.forEach(f => playNote(f, time, spb * 0.4, { vol: (measureStep % (ts.stepsPerBeat * 2) === ts.stepsPerBeat ? 0.22 : 0.18), att: 0.01 }));
        }
    },
    bossa: (chord, time, spb, measureStep, step) => {
        const ts = arranger.timeSignature;
        const tsObj = (TIME_SIGNATURES[ts] || TIME_SIGNATURES['4/4']);
        const stepsPerMeasure = tsObj.beats * tsObj.stepsPerBeat;
        
        let pattern;
        if (ts === '3/4') {
            pattern = [0, 3, 6, 9];
        } else if (ts === '6/8') {
            pattern = [0, 4, 8];
        } else if (ts === '7/4') {
            pattern = [0, 3, 6, 8, 11, 14, 17, 20, 23];
        } else {
            // Alternating 2-bar pattern logic (default/4/4 etc)
            pattern = (Math.floor(step / stepsPerMeasure) % 2 === 1) ? [0, 3, 6, 8, 11, 14] : [0, 3, 6, 10, 13];
        }
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach(f => playNote(f, time, spb * 1.2, { vol: 0.2, att: 0.01 }));
        }
    }
};