// Note: Keep APP_VERSION in sync with CACHE_NAME in sw.js
export const APP_VERSION = '1.28';
export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ENHARMONIC_MAP = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
export const ROMAN_VALS = { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
export const INTERVAL_TO_ROMAN = { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' };

export const MIXER_GAIN_MULTIPLIERS = {
    master: 1.0,
    chords: 0.8,
    bass: 1.2,
    soloist: 0.9,
    drums: 1.0
};

export const SONG_TEMPLATES = [
    {
        name: 'Standard Pop',
        sections: [
            { label: 'Intro', value: 'I | IV | V | I' },
            { label: 'Verse', value: 'I | vi | IV | V' },
            { label: 'Chorus', value: 'IV | V | I | vi' },
            { label: 'Verse', value: 'I | vi | IV | V' },
            { label: 'Chorus', value: 'IV | V | I | vi' },
            { label: 'Outro', value: 'I | IV | I | I' }
        ]
    },
    {
        name: 'Jazz AABA',
        sections: [
            { label: 'A', value: 'iim7 | V7 | Imaj7 | VI7' },
            { label: 'A', value: 'iim7 | V7 | Imaj7 | VI7' },
            { label: 'B', value: 'IVmaj7 | IVm7 | iiim7 | VI7' },
            { label: 'A', value: 'iim7 | V7 | Imaj7 | Imaj7' }
        ]
    },
    {
        name: 'Blues (12 Bar)',
        sections: [
            { label: 'Blues', value: 'I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7' }
        ]
    },
    {
        name: 'EDM / Loop',
        sections: [
            { label: 'Build', value: 'vi | V | IV | III7' },
            { label: 'Drop', value: 'vi | IV | I | V' }
        ],
        isMinor: false
    }
];

export const DRUM_PRESETS = {
    'Standard': { category: 'Basic', swing: 0, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Backbeat Only': { category: 'Basic', swing: 0, sub: '8th', 'Kick': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Basic Rock': { category: 'Pop/Rock', swing: 0, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,1,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'House': { category: 'Electronic', swing: 0, sub: '16th', 'Kick': [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [0,0,2,0, 0,0,2,0, 0,0,2,0, 0,0,2,0], 'Open': [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
    'House (2-Bar)': { 
        category: 'Electronic', 
        swing: 0, 
        sub: '16th', 
        measures: 2,
        'Kick':  [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0,  2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0], 
        'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0,  0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,1,0], 
        'HiHat': [2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0,  2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0], 
        'Open':  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] 
    },
    'Hip Hop': { category: 'Soul/R&B', swing: 25, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,2,1,0, 0,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,1,1, 2,1,1,1, 2,1,1,1, 2,1,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Funk': { 
        category: 'Soul/Funk', 
        swing: 15, 
        sub: '16th', 
        measures: 2,
        'Kick':  [2,0,0,1, 0,0,2,0, 0,1,0,0, 0,0,1,0,  2,0,0,1, 0,0,2,0, 0,1,0,0, 1,0,2,0], 
        'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0,  0,0,0,0, 2,0,0,0, 0,1,0,1, 2,0,0,0], 
        'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1,  2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 
        'Open':  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] 
    },
    'Neo-Soul': {
        category: 'Soul/R&B',
        swing: 45,
        sub: '16th',
        measures: 2,
        'Kick':  [2,0,0,0, 0,0,0,1, 0,0,2,0, 0,0,0,0,  2,0,0,0, 0,1,0,0, 0,0,2,0, 0,0,1,0],
        'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0,  0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0],
        'HiHat': [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
        'Open':  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,2,0,  0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,2,0]
    },
    'Trap': { category: 'Soul/R&B', swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,0,2,0, 0,1,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'HiHat': [2,1,1,2, 1,1,2,1, 2,1,1,2, 1,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Blues Shuffle': { category: 'Blues', swing: 100, sub: '8th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,1,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [1,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0] },
    'Reggae': { category: 'World/Latin', swing: 20, sub: '16th', 'Kick': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 0,0,2,0, 0,0,0,0, 0,0,2,0] },
    'DnB': { category: 'Electronic', swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 0,0,2,0, 0,1,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Disco': { category: 'Soul/Funk', swing: 0, sub: '16th', 'Kick': [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0], 'Snare': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,2,0, 0,0,2,0, 0,0,2,0, 0,0,2,0] },
    'Jazz': { 
        category: 'Jazz', 
        swing: 60, 
        sub: '8th', 
        measures: 2,
        'Kick':  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 
        'Snare': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,0, 0,1,0,0, 1,0,0,0], 
        'HiHat': [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0,  0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0], 
        'Open':  [2,0,0,0, 1,0,2,0, 2,0,0,0, 1,0,2,0,  2,0,0,0, 1,0,2,0, 2,0,1,0, 1,0,2,0] 
    },
    'Bossa Nova': { 
        category: 'World/Latin', 
        swing: 0, 
        sub: '16th', 
        measures: 2,
        'Kick':  [2,0,0,0, 0,0,2,0, 2,0,0,0, 0,0,2,0,  2,0,0,0, 0,0,2,0, 2,0,0,0, 0,0,2,0], 
        'Snare': [2,0,0,2, 0,0,2,0, 0,0,2,0, 0,2,0,0,  2,0,0,2, 0,0,2,0, 0,0,2,0, 0,2,0,2], 
        'HiHat': [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 
        'Open':  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] 
    },
    'Afrobeat': {
        category: 'World/Latin',
        swing: 10,
        sub: '16th',
        measures: 2,
        'Kick':  [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,1,0,  2,0,0,0, 0,0,0,0, 2,0,1,0, 0,1,0,0],
        'Snare': [0,0,0,0, 2,0,0,0, 0,0,2,0, 2,0,0,0,  0,0,0,0, 2,0,0,0, 0,0,2,0, 2,0,0,0],
        'HiHat': [2,2,0,2, 2,0,2,2, 0,2,2,0, 2,2,0,2,  2,2,0,2, 2,0,2,2, 0,2,2,0, 2,2,1,2],
        'Open':  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0,  0,0,2,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    },
    'Latin/Clave': { category: 'World/Latin', swing: 0, sub: '16th', 'Kick': [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0], 'Snare': [2,0,0,2, 0,0,2,0, 0,0,0,2, 0,2,0,0], 'HiHat': [2,0,1,0, 2,0,1,0, 2,0,1,0, 2,0,1,0], 'Open': [0,0,0,0, 2,0,0,0, 0,0,0,0, 0,0,0,0] }
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
    { id: 'whole', name: 'Whole', category: 'Basic' },
    { id: 'half', name: 'Half', category: 'Basic' },
    { id: 'arp', name: 'Arp (1-3-5-3)', category: 'Basic' },
    { id: 'rock', name: 'Rock (8th)', category: 'Pop/Rock' },
    { id: 'quarter', name: 'Walking', category: 'Jazz' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'rocco', name: 'Rocco (16ths)', category: 'Soul/Funk' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'bossa', name: 'Bossa Nova', category: 'World/Latin' }
];

export const SOLOIST_STYLES = [
    { id: 'scalar', name: 'Scalar', category: 'Basic' },
    { id: 'shred', name: 'Shreddy', category: 'Rock/Metal' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'minimal', name: 'Minimal', category: 'Basic' },
    { id: 'bird', name: 'Bird', category: 'Jazz' }
];

export const CHORD_PRESETS = [
    { name: "Pop (Standard)", prog: "I | V | vi | IV", category: "Pop/Rock" },
    { name: "Pop (Ballad)", prog: "vi | IV | I | V", category: "Pop/Rock" },
    { name: "50s Rock", prog: "I | vi | IV | V", category: "Pop/Rock" },
    { name: "Royal Road", prog: "IVmaj7 | V7 | iii7 | vi7", category: "Pop/Rock" },
    { name: "Canon", prog: "I | V | vi | iii | IV | I | IV | V", category: "Classical/Trad" },
    { name: "Andalusian", prog: "i | bVII | bVI | V", category: "Classical/Trad", isMinor: true },
    { name: "12-Bar Blues", prog: "I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7", category: "Blues" },
    { name: "Minor Blues", prog: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7", category: "Blues", isMinor: true },
    { name: "8-Bar Blues", prog: "I | V7 | IV | IV | I | V7 | I | V7", category: "Blues" },
    { name: "Jazz Blues", prog: "I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7", category: "Blues" },
    { name: "Jazz II-V-I", prog: "ii7 | V7 | Imaj7 | Imaj7", category: "Jazz" },
    { name: "Minor II-V-I", prog: "iiø7 | V7 | i7 | i7", category: "Jazz", isMinor: true },
    { 
        name: "Rhythm Changes", 
        sections: [
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "B", value: "III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" }
        ],
        category: "Jazz" 
    },
    { 
        name: "Autumn Leaves", 
        sections: [
            { label: "A", value: "ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7 | vi7 | vi7" },
            { label: "A", value: "ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7 | vi7 | vi7" },
            { label: "B", value: "viiø7 | III7 | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7" },
            { label: "C", value: "viiø7 | III7 | vi7 | vi7 | viiø7 | III7 | vi7 | vi7" }
        ],
        category: "Jazz",
        isMinor: false
    },
    { name: "Jazz Turnaround", prog: "Imaj7 VI7 | ii7 V7 | Imaj7 VI7 | ii7 V7", category: "Jazz" },
    { name: "Jazz Cycle", prog: "iii7 | VI7#9 | ii9 | V9 | Imaj9", category: "Jazz" },
    { name: "Neo-Soul", prog: "IVmaj7 | iii7 | ii7 | Imaj7", category: "Soul/R&B" },
    { name: "Neo-Soul (Slash)", prog: "IVmaj7/5 | iii7 | ii7/5 | Imaj7", category: "Soul/R&B" },
    { name: "Acid Jazz Vamp", prog: "i9 | IV9 | i9 | V7#9", category: "Soul/Funk", isMinor: true },
    { name: "Funk (i-IV)", prog: "i7 | IV7 | i7 | IV7", category: "Soul/R&B", isMinor: true },
    { name: "Circle of 4ths", prog: "I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7", category: "Theory" },
    { name: "Plagal Flow", prog: "I | IV | I | IV", category: "Theory" }
];