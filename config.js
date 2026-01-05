export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ENHARMONIC_MAP = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
export const ROMAN_VALS = { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
export const INTERVAL_TO_ROMAN = { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' };

export const MIXER_GAIN_MULTIPLIERS = {
    chords: 1.25,
    bass: 1.1,
    soloist: 0.8,
    drums: 1.15,
    master: 1.0
};

export const DRUM_PRESETS = {
    'Standard': { swing: 0, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Backbeat Only': { swing: 0, sub: '8th', 'Kick': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Basic Rock': { swing: 0, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,1,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'House': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [0,0,2,0, 0,0,2,0, 0,0,2,0, 0,0,2,0], 'Open': [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
    'Hip Hop': { swing: 25, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,2,1,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,1,1, 2,1,1,1, 2,1,1,1, 2,1,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Funk': { swing: 15, sub: '16th', 'Kick': [2,0,0,1, 0,0,2,0, 0,1,0,0, 0,0,1,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Trap': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,0,2,0, 0,1,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'HiHat': [2,1,1,2, 1,1,2,1, 2,1,1,2, 1,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Blues Shuffle': { swing: 100, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,1,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [1,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0] },
    'Reggae': { swing: 20, sub: '16th', 'Kick': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 0,0,2,0, 0,0,0,0, 0,0,2,0] },
    'DnB': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,0,2,0, 0,1,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Disco': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,2,0, 0,0,2,0, 0,0,2,0, 0,0,2,0] },
    'Jazz': { swing: 60, sub: '8th', 'Kick': [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'HiHat': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'Open': [2,0,0,0, 1,0,2,0, 2,0,0,0, 1,0,2,0] },
    'Bossa Nova': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,2,0, 2,0,0,0, 0,0,2,0], 'Snare': [2,0,0,2, 0,0,2,0, 0,0,2,0, 0,2,0,0], 'HiHat': [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Latin/Clave': { swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'Snare': [2,0,0,2, 0,0,2,0, 0,0,0,2, 0,2,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 2,0,0,0, 0,0,0,0, 0,0,0,0] }
};

export const CHORD_STYLES = [
    { id: 'pad', name: 'Pad', category: 'Pop/Rock' },
    { id: 'strum8', name: 'Strum', category: 'Pop/Rock' },
    { id: 'pop', name: 'Pop', category: 'Pop/Rock' },
    { id: 'rock', name: 'Pop-Rock', category: 'Pop/Rock' },
    { id: 'skank', name: 'Reggae', category: 'World/Latin' },
    { id: 'double_skank', name: 'Double Skank', category: 'World/Latin' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'arpeggio', name: 'Arpeggio', category: 'Pop/Rock' },
    { id: 'tresillo', name: 'Tresillo', category: 'World/Latin' },
    { id: 'clave', name: 'Clave', category: 'World/Latin' },
    { id: 'afrobeat', name: 'Afrobeat', category: 'World/Latin' },
    { id: 'jazz', name: 'Jazz Comp', category: 'Jazz' },
    { id: 'green', name: 'Freddie Green', category: 'Jazz' },
    { id: 'bossa', name: 'Bossa', category: 'World/Latin' }
];

export const BASS_STYLES = [
    { id: 'whole', name: 'Whole' },
    { id: 'half', name: 'Half' },
    { id: 'arp', name: 'Arp (1-3-5-3)' },
    { id: 'quarter', name: 'Walking' }
];

export const SOLOIST_STYLES = [
    { id: 'scalar', name: 'Scalar', category: 'Basic' },
    { id: 'shred', name: 'Shreddy', category: 'Rock/Metal' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'minimal', name: 'Minimal', category: 'Basic' }
];

export const CHORD_PRESETS = [
    { name: "Pop (Standard)", prog: "I | V | vi | IV", category: "Pop/Rock" },
    { name: "Pop (Ballad)", prog: "vi | IV | I | V", category: "Pop/Rock" },
    { name: "50s Rock", prog: "I | vi | IV | V", category: "Pop/Rock" },
    { name: "Royal Road", prog: "IVmaj7 | V7 | iii7 | vi7", category: "Pop/Rock" },
    { name: "Canon", prog: "I | V | vi | iii | IV | I | IV | V", category: "Classical/Trad" },
    { name: "Andalusian", prog: "vi | V | IV | III", category: "Classical/Trad" },
    { name: "12-Bar Blues", prog: "I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7", category: "Blues" },
    { name: "Minor Blues", prog: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7", category: "Blues" },
    { name: "8-Bar Blues", prog: "I | V7 | IV | IV | I | V7 | I | V7", category: "Blues" },
    { name: "Jazz Blues", prog: "I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7", category: "Blues" },
    { name: "Jazz II-V-I", prog: "ii7 | V7 | Imaj7 | Imaj7", category: "Jazz" },
    { name: "Minor II-V-I", prog: "iiø7 | V7 | i7 | i7", category: "Jazz" },
    { name: "Rhythm Changes", prog: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I", category: "Jazz" },
    { name: "Autumn Leaves (32 Bar)", prog: "ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7 | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7 | vi7 | vi7 | viiø7 | III7 | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7 | vi7 | vi7 | viiø7 | III7 | vi7 | vi7", category: "Jazz" },
    { name: "Rhythm Changes (32 Bar)", prog: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I | I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I | III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7 | I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I", category: "Jazz" },
    { name: "Jazz Turnaround", prog: "Imaj7 VI7 | ii7 V7 | Imaj7 VI7 | ii7 V7", category: "Jazz" },
    { name: "Jazz Cycle", prog: "iii7 | VI7#9 | ii9 | V9 | Imaj9", category: "Jazz" },
    { name: "Neo-Soul", prog: "IVmaj7 | iii7 | ii7 | Imaj7", category: "Soul/R&B" },
    { name: "Neo-Soul (Slash)", prog: "IVmaj7/5 | iii7 | ii7/5 | Imaj7", category: "Soul/R&B" },
    { name: "Acid Jazz Vamp", prog: "i9 | IV9 | i9 | V7#9", category: "Soul/Funk" },
    { name: "Funk (i-IV)", prog: "i7 | IV7 | i7 | IV7", category: "Soul/R&B" },
    { name: "Circle of 4ths", prog: "I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7", category: "Theory" },
    { name: "Plagal Flow", prog: "I | IV | I | IV", category: "Theory" }
];