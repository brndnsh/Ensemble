// Note: Keep APP_VERSION in sync with CACHE_NAME in sw.js
export const APP_VERSION = '1.87';
export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ENHARMONIC_MAP = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
export const ROMAN_VALS = { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
export const INTERVAL_TO_ROMAN = { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' };

export const TIME_SIGNATURES = {
    '2/4': { beats: 2, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4], grouping: [2] },
    '3/4': { beats: 3, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8], grouping: [3] },
    '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] },
    '5/4': { beats: 5, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12, 16], grouping: [3, 2] }, 
    '6/8': { beats: 6, stepsPerBeat: 2, subdivision: '8th', pulse: [0, 6], grouping: [3, 3] }, 
    '7/8': { beats: 7, stepsPerBeat: 2, subdivision: '8th', pulse: [0, 4, 8], grouping: [2, 2, 3] }, 
    '7/4': { beats: 7, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12, 16, 20, 24], grouping: [4, 3] }, 
    '12/8': { beats: 12, stepsPerBeat: 2, subdivision: '8th', pulse: [0, 6, 12, 18], grouping: [3, 3, 3, 3] } 
};

export const MIXER_GAIN_MULTIPLIERS = {
    master: 1.0,
    chords: 0.25,
    bass: 0.45,
    soloist: 0.35,
    drums: 0.5
};