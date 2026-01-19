
import fs from 'fs';
import path from 'path';

const SAMPLE_RATE = 44100;
const BPM = 80;
const BEAT_DUR = 60 / BPM;
const MEASURE_DUR = BEAT_DUR * 4;

// Simple Wav Encoder
function encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Synthesis Helpers
const saw = (t, freq) => 2 * ((t * freq) % 1) - 1;
const sine = (t, freq) => Math.sin(2 * Math.PI * t * freq);
const tri = (t, freq) => Math.abs(saw(t, freq) * 2) - 1;

// Notes to Freq
const NOTES = {
    // Bass range
    'C2': 65.41, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'Bb2': 116.54, 'B2': 123.47,
    'C3': 130.81, 'D3': 146.83, 'Eb3': 155.56, 'E3': 164.81, 'F3': 174.61,
    
    // Chords (Higher)
    'C4': 261.63, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'Bb4': 466.16, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'Eb5': 622.25, 'F5': 698.46
};

// 12 Bar Blues Structure (C7, F7, G7)
const PROGRESSION = [
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'A2'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 1
    { name: 'F7', bass: ['F2', 'A2', 'C3', 'D3'], chord: ['F4', 'A4', 'C5', 'Eb5'] }, // Bar 2
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'Bb2'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 3
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'C3'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 4
    
    { name: 'F7', bass: ['F2', 'A2', 'C3', 'Eb3'], chord: ['F4', 'A4', 'C5', 'Eb5'] }, // Bar 5
    { name: 'F7', bass: ['F2', 'A2', 'C3', 'D3'], chord: ['F4', 'A4', 'C5', 'Eb5'] }, // Bar 6
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'A2'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 7
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'Bb2'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 8
    
    { name: 'G7', bass: ['G2', 'B2', 'D3', 'F3'], chord: ['G4', 'B4', 'D5', 'F5'] }, // Bar 9
    { name: 'F7', bass: ['F2', 'A2', 'C3', 'Eb3'], chord: ['F4', 'A4', 'C5', 'Eb5'] }, // Bar 10
    { name: 'C7', bass: ['C2', 'E2', 'G2', 'A2'], chord: ['C4', 'E4', 'G4', 'Bb4'] }, // Bar 11
    { name: 'G7', bass: ['G2', 'B2', 'D3', 'E3'], chord: ['G4', 'B4', 'D5', 'F5'] }, // Bar 12 (Turnaround)
];

const totalSamples = PROGRESSION.length * MEASURE_DUR * SAMPLE_RATE;
const output = new Float32Array(totalSamples);

console.log(`Generating ${PROGRESSION.length} bars of synthetic blues at ${BPM} BPM...`);

let sampleIdx = 0;
PROGRESSION.forEach((bar) => {
    const startSample = sampleIdx;
    const samplesPerBar = MEASURE_DUR * SAMPLE_RATE;
    const samplesPerBeat = BEAT_DUR * SAMPLE_RATE;

    // Bass: Walking on every beat (Quarter notes)
    for (let b = 0; b < 4; b++) {
        const noteName = bar.bass[b];
        const freq = NOTES[noteName] || 100;
        const beatStart = startSample + b * samplesPerBeat;
        
        for (let i = 0; i < samplesPerBeat; i++) {
            const t = i / SAMPLE_RATE;
            // Pluck envelope
            const env = Math.exp(-t * 5); 
            output[beatStart + i] += (saw(t, freq) * 0.4 + sine(t, freq/2) * 0.6) * env * 0.8;
        }
    }

    // Chords: Charleston rhythm (Beat 1 dotted, "And" of 2) -> actually simpler: Beats 2 and 4 (Backbeat)
    // Let's do simple comping: Pads on whole note to establish tonality clearly?
    // No, user said "Shuffle feel", let's do Beats 2 and 4 (Snare-like position) + maybe '&' of 2.
    // Let's stick to Quarter note pulses on 1, 2, 3, 4 but softer
    for (let b = 0; b < 4; b++) {
         const chordStart = startSample + b * samplesPerBeat;
         const freqList = bar.chord.map(n => NOTES[n] || 440);
         
         for (let i = 0; i < samplesPerBeat; i++) {
             const t = i / SAMPLE_RATE;
             const env = Math.exp(-t * 8); // Short decay
             
             let val = 0;
             freqList.forEach(f => {
                 val += tri(t, f) * 0.1;
             });
             
             output[chordStart + i] += val * env;
         }
    }
    
    sampleIdx += samplesPerBar;
});

const wavBuffer = encodeWAV(output);
const outPath = path.resolve('tests/resources/synthetic_blues_walking.wav');
fs.writeFileSync(outPath, Buffer.from(wavBuffer));
console.log(`Saved to ${outPath}`);
