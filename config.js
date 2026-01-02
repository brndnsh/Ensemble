export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ENHARMONIC_MAP = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
export const ROMAN_VALS = { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
export const INTERVAL_TO_ROMAN = { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' };

export const DRUM_PRESETS = {
    'Standard': { swing: 0, sub: '8th', 'Kick': [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Backbeat Only': { swing: 0, sub: '8th', 'Kick': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Basic Rock': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'House': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0], 'Open': [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
    'Hip Hop': { swing: 20, sub: '16th', 'Kick': [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,0,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Funk': { swing: 15, sub: '16th', 'Kick': [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,1,0,0], 'Snare': [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0], 'HiHat': [1,1,1,0, 1,1,1,0, 1,1,1,0, 1,1,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Trap': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'HiHat': [1,1,1,1, 1,1,1,0, 1,1,1,1, 1,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Blues Shuffle': { swing: 100, sub: '8th', 'Kick': [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [1,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0] },
    'Reggae': { swing: 30, sub: '16th', 'Kick': [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], 'Snare': [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], 'HiHat': [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'DnB': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Disco': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 'Snare': [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], 'HiHat': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Open': [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
    'Jazz': { swing: 65, sub: '8th', 'Kick': [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 'Snare': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0], 'HiHat': [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 'Open': [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0] },
    'Bossa Nova': { swing: 0, sub: '16th', 'Kick': [1,0,0,1, 1,0,0,0, 1,0,0,1, 1,0,0,0], 'Snare': [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0], 'HiHat': [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 'Open': [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
    'Latin/Clave': { swing: 0, sub: '16th', 'Kick': [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], 'Snare': [1,0,0,1, 0,0,1,0, 0,0,0,1, 0,1,0,0], 'HiHat': [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'Open': [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0] }
};

export const CHORD_STYLES = [
    { id: 'pad', name: 'Pad' },
    { id: 'pulse', name: 'Pulse' },
    { id: 'strum8', name: 'Strum' },
    { id: 'pop', name: 'Pop' },
    { id: 'skank', name: 'Reggae' },
    { id: 'funk', name: 'Funk' },
    { id: 'arpeggio', name: 'Arpeggio' },
    { id: 'tresillo', name: 'Tresillo' },
    { id: 'clave', name: 'Clave' },
    { id: 'jazz', name: 'Jazz' },
    { id: 'bossa', name: 'Bossa' }
];

export const BASS_STYLES = [
    { id: 'whole', name: 'Whole' },
    { id: 'half', name: 'Half' },
    { id: 'arp', name: 'Arp (1-3-5-3)' },
    { id: 'quarter', name: 'Walking' }
];

export const SOLOIST_STYLES = [
    { id: 'bird', name: 'Bebop' },
    { id: 'blues', name: 'Blues' },
    { id: 'scalar', name: 'Scalar' },
    { id: 'minimal', name: 'Minimal' },
    { id: 'shred', name: 'Shreddy' }
];

export const CHORD_PRESETS = [
    { name: "Pop", prog: "I | V | vi | IV" },
    { name: "12-Bar Blues", prog: "I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7" },
    { name: "Jazz Blues", prog: "I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7" },
    { name: "Jazz II-V-I", prog: "ii7 | V7 | Imaj7 | Imaj7" },
    { name: "Neo-Soul", prog: "IVmaj7 | iii7 | ii7 | Imaj7" },
    { name: "Andalusian", prog: "vi | V | IV | III" },
    { name: "Epic", prog: "vi | IV | V | iii" },
    { name: "Rock & Roll", prog: "I | IV | I | V" },
    { name: "50s Rock", prog: "I | vi | IV | V" },
    { name: "Canon", prog: "I | V | vi | iii | IV | I | IV | V" },
    { name: "Royal Road", prog: "IVmaj7 | V7 | iii7 | vi7" },
    { name: "Moody", prog: "vi | IV | I | V" }
];
