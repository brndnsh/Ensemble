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
            chord.freqs.forEach((f, i) => playNote(f, time, chord.beats * spb, { vol: 0.2, index: i }));
        }
    },
    strum8: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        
        // Classic "Down Down Up Down" (1, 2, 2-and, 3, 4)
        // In 4/4 (16 steps), beats are 0, 4, 8, 12.
        // Pattern: Beat 1 (0), Beat 2 (4), Beat 2-and (6), Beat 3 (8), Beat 4 (12)
        const beats = [0, 4, 6, 8, 12];
        
        if (beats.includes(measureStep)) {
            const isUpstroke = measureStep === 6;
            const isAccent = measureStep === 0 || measureStep === 8;
            
            chord.freqs.forEach((f, i) => {
                // Upstrokes are usually lighter and faster
                const vol = isUpstroke ? 0.12 : (isAccent ? 0.22 : 0.18);
                const dur = isUpstroke ? spb * 0.3 : spb * 0.6;
                
                // For a natural feel, upstrokes sometimes hit fewer strings
                if (isUpstroke && i < 1) return; 

                playNote(f, time, dur, { vol, index: i });
            });
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
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 1.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.15), index: i }));
        }
    },
    rock: (chord, time, spb, measureStep) => {
        if (measureStep % 2 === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.5, { vol: (measureStep % 4 === 0 ? 0.2 : 0.16), index: i }));
        }
    },
    skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        // Skank is on the "and": step 4, 12 in 4/4.
        if (measureStep % ts.stepsPerBeat === (ts.stepsPerBeat / 2)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.5, { vol: 0.22, index: i }));
        } else if (measureStep % ts.stepsPerBeat === 0) {
            // Muted "chug" on the downbeat
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.1, { vol: 0.1, index: i, muted: true }));
        }
    },
    double_skank: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const off = ts.stepsPerBeat / 2;
        if ([off, off + 2].includes(measureStep % ts.stepsPerBeat)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.35, { vol: 0.18, index: i }));
        } else if (measureStep % ts.stepsPerBeat === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.1, { vol: 0.1, index: i, muted: true }));
        }
    },
    funk: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 4, 7, 8, 11, 12, 15]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 4, 7, 8, 11];
        else if (ts === '6/8') pattern = [0, 2, 4, 6, 8, 10];
        else if (ts === '7/4') pattern = [0, 3, 4, 7, 8, 11, 12, 16, 19, 20, 23, 24]; 
        
        if (pattern.includes(measureStep)) {
            const isAccent = measureStep % 4 === 0;
            // Shortened duration (0.25 spb) for more "staccato" definition
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.25, { vol: (isAccent ? 0.22 : 0.18), index: i }));
        } else {
            // Use muted tonal hits instead of just noise for "scratches"
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.05, { vol: 0.08, index: i, muted: true }));
            if (Math.random() < 0.3) playChordScratch(time, 0.05);
        }
    },
    arpeggio: (chord, time, spb, stepInChord, measureStep) => {
        if (measureStep % 2 === 0) {
            const idx = Math.floor(stepInChord / 2) % chord.freqs.length;
            playNote(chord.freqs[idx], time, spb * 2.0, { vol: 0.2, index: 0 });
        }
    },
    tresillo: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 8, 11, 14]; // 4/4
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 9, 12, 15, 18, 21, 24]; // Extended Tresillo
        
        if (pattern.includes(measureStep)) {
            // Shortened duration (0.4 spb) for better separation
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.4, { vol: 0.2, index: i }));
        }
    },
    clave: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 10, 13]; // 3-2 Son Clave
        if (ts === '3/4') pattern = [0, 3, 6, 9];
        else if (ts === '7/4') pattern = [0, 3, 6, 10, 13, 16, 20]; // Extended Clave
        
        if (pattern.includes(measureStep)) {
            // Shortened duration (0.3 spb) for sharper clave hits
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.3, { vol: 0.2, index: i }));
        }
    },
    afrobeat: (chord, time, spb, measureStep) => {
        const ts = arranger.timeSignature;
        let pattern = [0, 3, 6, 7, 10, 12, 13, 15];
        if (ts === '3/4') pattern = [0, 3, 6, 7, 10];
        else if (ts === '7/4') pattern = [0, 3, 6, 7, 10, 12, 13, 15, 16, 19, 22, 25];
        
        if (pattern.includes(measureStep)) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.3, { vol: 0.18, index: i }));
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
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.8, { vol: 0.18, index: i }));
        } else if (measureStep % 4 === 0) {
            // Muted "ghost" notes for jazz feel
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.05, { vol: 0.06, index: i, muted: true }));
            if (Math.random() < 0.1) playChordScratch(time, 0.02);
        }
    },
    green: (chord, time, spb, measureStep) => {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        if (measureStep % ts.stepsPerBeat === 0) {
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 0.4, { vol: (measureStep % (ts.stepsPerBeat * 2) === ts.stepsPerBeat ? 0.22 : 0.18), index: i }));
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
            chord.freqs.forEach((f, i) => playNote(f, time, spb * 1.2, { vol: 0.2, index: i }));
        }
    }
};