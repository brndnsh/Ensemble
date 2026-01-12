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
    'Standard': { 
        category: 'Basic', swing: 0, sub: '8th', 
        'Kick': "2000000010000000", 
        'Snare': "0000200000002000", 
        'HiHat': "2010201020102010", 
        'Open': "0000000000000000",
        '3/4': { // Waltz-ish K-S-S
            'Kick': "200000000000",
            'Snare': "000020002000",
            'HiHat': "201020102010"
        },
        '5/4': { // 3+2 feel (Take Five ish)
            'Kick': "20000000001000000000",
            'Snare': "00000000000020000000", // Snare on 4
            'HiHat': "20102010201020102010"
        },
        '7/8': { // 2+2+3 feel
            'Kick': "20000000200000",
            'Snare': "00002000000000",
            'HiHat': "20102010201010"
        },
        '7/4': { // Money-ish feel (4+3)
            // 28 steps. 
            // Kick on 1, 3(ish), 5(ish)
            'Kick':  "2000000020000000200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2010201020102010201020102010"
        },
        '12/8': { // Slow Blues / Doo-wop feel
            // 24 steps. Kick on 1(0), 3(12). Snare on 2(6), 4(18).
            'Kick':  "200000000000200000000000",
            'Snare': "000000200000000000200000",
            'HiHat': "201010201010201010201010"
        }
    },
    'Backbeat Only': { 
        category: 'Basic', swing: 0, sub: '8th', 
        'Kick': "0000000000000000", 
        'Snare': "0000200000002000", 
        'HiHat': "0000000000000000", 
        'Open': "0000000000000000",
        '3/4': { 'Snare': "000020002000" },
        '5/4': { 'Snare': "00000000000020000000" },
        '6/8': { 'Snare': "000000200000" },
        '7/8': { 'Snare': "00000000002000" },
        '7/4': { 'Snare': "0000200000002000000020000000" },
        '12/8': { 'Snare': "000000200000000000200000" }
    },
    'Basic Rock': { 
        category: 'Pop/Rock', swing: 0, sub: '8th', 
        'Kick': "2000000020100000", 
        'Snare': "0000200000002000", 
        'HiHat': "2121212121212121", 
        'Open': "0000000000000000",
        '3/4': { // Rock Waltz K-- S-- K--
            'Kick': "200000002000",
            'Snare': "000020000000",
            'HiHat': "212121212121"
        },
        '5/4': {
            'Kick': "20000000200000000000",
            'Snare': "00000000000020000000",
            'HiHat': "21212121212121212121"
        },
        '6/8': { // Rock 6/8
            'Kick':  "200000200000",
            'Snare': "000000200000",
            'HiHat': "212121212121"
        },
        '7/8': {
            'Kick':  "20000000200000",
            'Snare': "00002000000000",
            'HiHat': "21212121212121"
        },
        '7/4': {
            'Kick':  "2000000020000000200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2121212121212121212121212121"
        },
        '12/8': { // Slow Rock 12/8
            'Kick':  "200000000000200000000000",
            'Snare': "000000200000000000200000",
            'HiHat': "212121212121212121212121"
        }
    },
    'House': { 
        category: 'Electronic', swing: 0, sub: '16th', 
        'Kick': "2000200020002000", 
        'Snare': "0000200000002000", 
        'HiHat': "0020002000200020", 
        'Open': "0010001000100010",
        '3/4': { // 3-on-the-floor
            'Kick': "200020002000",
            'Snare': "000020000000",
            'HiHat': "002000200020",
            'Open': "001000100010"
        },
        '5/4': { // 5-on-the-floor
            'Kick': "20002000200020002000",
            'Snare': "00002000000020000000",
            'HiHat': "00200020002000200020",
            'Open': "00100010001000100010"
        },
        '6/8': { // House in 6/8?? "6-step"
            'Kick': "200020002000", // K on 1, 3, 5
            'Snare': "000000002000", // S on 5
            'HiHat': "002000200020",
            'Open': "001000100010"
        },
        '7/8': { // 7-on-the-floor (intense)
            'Kick': "20002000200020",
            'Snare': "00000000200000",
            'HiHat': "00200020002000"
        },
        '7/4': { // 7-on-the-floor
            'Kick': "2000200020002000200020002000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "0020002000200020002000200020",
            'Open': "0010001000100010001000100010"
        },
        '12/8': { // 4-on-the-floor shuffle
            'Kick': "200000200000200000200000",
            'Snare': "000000200000000000200000",
            'HiHat': "000200000200000200000200"
        }
    },
    'House (2-Bar)': { 
        category: 'Electronic', 
        swing: 0, 
        sub: '16th', 
        measures: 2,
        'Kick':  "20002000200020002000200020002000", 
        'Snare': "00002000000020000000200000002010", 
        'HiHat': "20202020202020202020202020202020", 
        'Open':  "00000000000000000000000000000000",
        '3/4': {
            'Kick': "200020002000200020002000",
            'Snare': "000020000000000020000010",
            'HiHat': "202020202020202020202020"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000200020002000200020002000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2020202020202020202020202020",
            'Open':  "0000000000000000000000000000"
        }
    },
    'Hip Hop': { 
        category: 'Soul/R&B', swing: 25, sub: '16th', 
        'Kick': "2000000002100000", 
        'Snare': "0000200000002000", 
        'HiHat': "2111211121112111", 
        'Open': "0000000000000000",
        '3/4': {
            'Kick': "200000100000",
            'Snare': "000000002000",
            'HiHat': "211121112111"
        },
        '5/4': { // Dilla-esque
            'Kick': "20000000000002100000",
            'Snare': "00000000000020000000",
            'HiHat': "21112111211121112111"
        },
        '7/4': {
            'Kick': "2000000000000000021000000000",
            'Snare': "0000000020000000000000002000",
            'HiHat': "2111211121112111211121112111",
            'Open':  "0000000000000000000000000000"
        }
    },
    'Funk': { 
        category: 'Soul/Funk', 
        swing: 15, 
        sub: '16th', 
        measures: 2,
        'Kick':  "20010020010000102001002001001020", 
        'Snare': "00002000000020000000200001012000", 
        'HiHat': "21212121212121212121212121212121", 
        'Open':  "00000000000000000000000000000000",
        '3/4': {
            'Kick': "200100200010200100201020",
            'Snare': "000020002000000020002000",
            'HiHat': "212121212121212121212121"
        },
        '6/8': {
            'Kick': "200100200000200100201000",
            'Snare': "000000200000000000200000",
            'HiHat': "212121212121212121212121"
        },
        '7/4': {
            measures: 1,
            'Kick': "2001002001000010200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2121212121212121212121212121",
            'Open':  "0000000000000000000000000000"
        }
    },
    'Neo-Soul': {
        category: 'Soul/R&B',
        swing: 45,
        sub: '16th',
        measures: 2,
        'Kick':  "20000001002000002000010000200010",
        'Snare': "00002000000020000000200000002000",
        'HiHat': "11111111111111111111111111111111",
        'Open':  "00000000000000200000000000000020",
        '3/4': {
            'Kick': "200000010020200001000010",
            'Snare': "000020000000000020000000",
            'HiHat': "111111111111111111111111"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000000100200000200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "1111111111111111111111111111",
            'Open':  "0000000000000020000000000000"
        }
    },
    'Trap': { 
        category: 'Soul/R&B', swing: 0, sub: '16th', 
        'Kick': "2000000000200100", 
        'Snare': "0000000020000000", 
        'HiHat': "2112112121121121", 
        'Open': "0000000000000000",
        '3/4': { 'Snare': "000000002000" },
        '6/8': { 'Snare': "000000200000" },
        '7/4': { 
            measures: 1,
            'Kick': "2000000000200100200000000000",
            'Snare': "0000000020000000000020000000",
            'HiHat': "2112112121121121211211212112"
        }
    },
    'Blues Shuffle': { 
        category: 'Blues', swing: 100, sub: '8th', 
        'Kick': "2000000020000010", 
        'Snare': "0000200000002000", 
        'HiHat': "2010201020102010", 
        'Open': "1000000000001000",
        '12/8': { // Native home of the shuffle
            measures: 1,
            'Kick':  "200000000000200000001000",
            'Snare': "000000200000000000200000",
            'HiHat': "201010201010201010201010"
        },
        '6/8': {
            measures: 1,
            'Kick': "200000200000",
            'Snare': "000000200000",
            'HiHat': "201010201010"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000000020000000200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2010201020102010201020102010"
        }
    },
    'Reggae': { 
        category: 'World/Latin', swing: 20, sub: '16th', 
        'Kick': "0000000020000000", 
        'Snare': "0000000020000000", 
        'HiHat': "2010201020102010", 
        'Open': "0000002000000020",
        '3/4': {
            measures: 1,
            'Kick': "000000002000", // One drop on 3
            'Snare': "000000002000",
            'HiHat': "201020102010"
        },
        '7/4': {
            measures: 1,
            'Kick': "0000000020000000000000002000",
            'Snare': "0000000020000000000000002000",
            'HiHat': "2010201020102010201020102010"
        }
    },
    'Acoustic': { 
        category: 'Pop/Rock', swing: 15, sub: '8th', 
        'Kick': "2000000010000000", 
        'Snare': "0000200000002000", 
        'HiHat': "1010101010101010", 
        'Open': "0000000000000000",
        '3/4': {
            'Kick': "200000000000",
            'Snare': "000020002000",
            'HiHat': "101010101010"
        },
        '5/4': {
            'Kick': "20000000000000000000",
            'Snare': "00000000000020000000",
            'HiHat': "10101010101010101010"
        },
        '6/8': {
            'Kick': "200000000000",
            'Snare': "000000200000",
            'HiHat': "101010101010"
        },
        '7/4': {
            'Kick': "2000000000000000200000000000",
            'Snare': "000000200000000000200000",
            'HiHat': "1010101010101010101010101010"
        },
        '12/8': {
            'Kick': "200000000000200000000000",
            'Snare': "000000200000000000200000",
            'HiHat': "101010101010101010101010"
        }
    },
    'DnB': { 
        category: 'Electronic', swing: 0, sub: '16th', 
        'Kick': "2000000000200100", 
        'Snare': "0000200000002000", 
        'HiHat': "2121212121212121", 
        'Open': "0000000000000000",
        '3/4': { 'Snare': "000020000000" },
        '7/4': { 
            measures: 1,
            'Kick': "2000000000200100200000000000",
            'Snare': "0000200000002000000020000000",
            'HiHat': "2121212121212121212121212121"
        }
    },
    'Disco': { 
        category: 'Soul/Funk', swing: 0, sub: '16th', 
        'Kick': "2000200020002000", 
        'Snare': "0000200000002000", 
        'HiHat': "1010101010101010", 
        'Open': "0020002000200020",
        '3/4': {
            measures: 1,
            'Kick': "200020002000",
            'Snare': "000020000000",
            'HiHat': "101010101010",
            'Open': "002000200020"
        },
        '5/4': {
            measures: 1,
            'Kick': "20002000200020002000",
            'Snare': "00002000000020000000",
            'Open': "00200020002000200020"
        },
        '6/8': { // Disco in 6/8 (Compound)
            measures: 1,
            'Kick': "200020002000",
            'Snare': "000000200000",
            'Open': "002000200020"
        },
        '7/8': {
            measures: 1,
            'Kick': "20002000200020",
            'Snare': "00002000000000",
            'Open': "00200020002000"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000200020002000200020002000",
            'Snare': "0000200000002000000020000000",
            'Open': "0020002000200020002000200020"
        },
        '12/8': {
            measures: 1,
            'Kick': "200000200000200000200000",
            'Snare': "000000200000000000200000",
            'Open': "000200000200000200000200"
        }
    },
    'Jazz': { 
        category: 'Jazz', swing: 60, sub: '8th', measures: 2,
        'Kick':  "10001000100010001000100010001000", 
        'Snare': "00000000000000000000000001001000", 
        'HiHat': "00002000000020000000200000002000", 
        'Open':  "20001020200010202000102020101020",
        '3/4': { // Jazz Waltz
            measures: 1,
            'Kick': "100000000000",
            'Snare': "000000000000",
            'HiHat': "000020002000",
            'Open': "200010201020"
        },
        '5/4': { // Take Five
            measures: 1,
            'Kick': "20000000000000000000",
            'Snare': "00000000000000000000",
            'HiHat': "00002000200020002000",
            'Open': "20001020102010201020"
        },
        '6/8': { // Jazz Waltz / 6/8 Afro-Cuban feel
            measures: 1,
            'Kick': "100000000000",
            'Snare': "000000000000",
            'HiHat': "000020000020",
            'Open': "200010200010"
        },
        '7/8': {
            measures: 1,
            'Kick': "10000000000000",
            'Snare': "00000000000000",
            'Open': "20001020102010"
        },
        '7/4': {
            measures: 1,
            'Kick': "1000000000000000000000000000",
            'Snare': "0000000000000000000000000000",
            'HiHat': "0000200020002000200020002000",
            'Open': "2000102010201020102010201020"
        },
        '12/8': { // Afro-Blue feel
            measures: 1,
            'Kick': "100000000000000000000000",
            'Open': "200010201020102000102010"
        }
    },
    'Bossa Nova': { 
        category: 'World/Latin', swing: 0, sub: '16th', measures: 2,
        'Kick':  "20000020200000202000002020000020", 
        'Snare': "20000020000020000000200000200000", 
        'HiHat': "11111111111111111111111111111111", 
        'Open':  "00000000000000000000000000000000",
        '3/4': { // Bossa Waltz (adapted)
            'Kick': "200000202000200000202000",
            'Snare': "200200200020200200200020"
        },
        '5/4': {
            measures: 1,
            'Kick': "20000020200000202000",
            'Snare': "20020020002002002002"
        },
        '6/8': { // Samba 6/8
            measures: 1,
            'Kick': "200000200000",
            'Snare': "200200200200"
        },
        '7/8': {
            measures: 1,
            'Kick': "20000020200000",
            'Snare': "20020020002000"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000002020000020200000202000",
            'Snare': "2002002000200200200200200020"
        },
        '12/8': {
            measures: 1,
            'Kick': "200000200000200000200000",
            'Snare': "200200200200200200200200"
        }
    },
    'Afrobeat': {
        category: 'World/Latin', swing: 10, sub: '16th', measures: 2,
        'Kick':  "20000000200000102000000020100100",
        'Snare': "00002000002020000000200000202000",
        'HiHat': "22022022022022022202202202202212",
        'Open':  "00000000000000000020000000000000",
        '3/4': {
            'Kick': "200000002000200000002000",
            'Snare': "000020000020000020000020",
            'HiHat': "220220220220220220220220"
        },
        '5/4': {
            measures: 1,
            'Kick': "20000000200000002000",
            'Snare': "00002000002020000020",
            'HiHat': "22022022022022022022"
        },
        '6/8': {
            measures: 1,
            'Kick': "200000200000",
            'Snare': "000020002020",
            'HiHat': "220220220220"
        },
        '7/8': {
            measures: 1,
            'Kick': "20000020000000",
            'Snare': "00002000202000"
        },
        '7/4': {
            measures: 1,
            'Kick': "2000000020000010200000002010",
            'Snare': "0000200000202000000020000020",
            'HiHat': "2202202202202202220220220220"
        },
        '12/8': {
            measures: 1,
            'Kick': "200000200000200000200000",
            'Snare': "000020002020000020002020"
        }
    },
    'Latin/Clave': { 
        category: 'World/Latin', swing: 0, sub: '16th', 
        'Kick': "2000000020000000", 
        'Snare': "2002002000020200", 
        'HiHat': "2010201020102010", 
        'Open': "0000200000000000",
        '3/4': {
            'Snare': "200200200002"
        },
        '5/4': {
            'Snare': "20020020000202002000"
        },
        '6/8': { // Bembe / Afro-Cuban 6/8
            'Kick': "200000000000",
            'Snare': "000000000000",
            'HiHat': "202010202010", // Standard Bell pattern
            'Open': "000000000000"
        },
        '7/8': {
            'Snare': "20020020000200"
        },
        '7/4': {
            'Snare': "200200200002020020020020"
        },
        '12/8': {
            'Kick': "200000000000200000000000",
            'Snare': "000000000000000000000000",
            'HiHat': "202010202010202010202010" // Bembe
        }
    }
};

export const CHORD_STYLES = [
    { id: 'smart', name: 'Smart (Rhythmic)', category: 'Modern' },
    { id: 'pad', name: 'Pad (Sustain)', category: 'Modern' },
    { id: 'strum8', name: 'Strum (8th)', category: 'Pop/Rock' },
    { id: 'jazz', name: 'Jazz Comp', category: 'Jazz' },
    { id: 'funk', name: 'Funk Scratch', category: 'Soul/Funk' }
];

export const BASS_STYLES = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'whole', name: 'Whole', category: 'Basic' },
    { id: 'half', name: 'Half', category: 'Basic' },
    { id: 'arp', name: 'Arp (1-3-5-3)', category: 'Basic' },
    { id: 'rock', name: 'Rock (8th)', category: 'Pop/Rock' },
    { id: 'quarter', name: 'Walking', category: 'Jazz' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'rocco', name: 'Rocco (16ths)', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco (Octaves)', category: 'Soul/Funk' },
    { id: 'dub', name: 'Dub (Reggae)', category: 'World/Latin' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'bossa', name: 'Bossa Nova', category: 'World/Latin' }
];

export const SOLOIST_STYLES = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'scalar', name: 'Scalar', category: 'Basic' },
    { id: 'shred', name: 'Shreddy', category: 'Rock/Metal' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'minimal', name: 'Minimal', category: 'Basic' },
    { id: 'bird', name: 'Bird', category: 'Jazz' },
    { id: 'disco', name: 'Disco', category: 'Soul/Funk' }
];

export const CHORD_PRESETS = [
    { 
        name: "Pop (Standard)", 
        sections: [{ label: 'Main', value: "I | V | vi | IV" }], 
        category: "Pop/Rock",
        settings: { bpm: 120, style: 'pop' }
    },
    { 
        name: "Pop (Ballad)", 
        sections: [{ label: 'Main', value: "vi | IV | I | V" }], 
        category: "Pop/Rock",
        settings: { bpm: 85, style: 'pad' }
    },
    { 
        name: "50s Rock", 
        sections: [{ label: 'Main', value: "I | vi | IV | V" }], 
        category: "Pop/Rock",
        settings: { bpm: 140, style: 'rock', timeSignature: '4/4' }
    },
    { 
        name: "Royal Road", 
        sections: [{ label: 'Main', value: "IVmaj7 | V7 | iii7 | vi7" }], 
        category: "Pop/Rock",
        settings: { bpm: 110, style: 'pop' }
    },
    { 
        name: "Canon", 
        sections: [{ label: 'Main', value: "I | V | vi | iii | IV | I | IV | V" }], 
        category: "Classical/Trad",
        settings: { bpm: 90, style: 'arpeggio' }
    },
    { 
        name: "Andalusian", 
        sections: [{ label: 'Main', value: "i | bVII | bVI | V" }], 
        category: "Classical/Trad", 
        isMinor: true,
        settings: { bpm: 130, style: 'skank' }
    },
    { 
        name: "12-Bar Blues", 
        sections: [{ label: 'Main', value: "I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7" }], 
        category: "Blues",
        settings: { bpm: 100, style: 'blues' }
    },
    { 
        name: "Minor Blues", 
        sections: [{ label: 'Main', value: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7" }], 
        category: "Blues", 
        isMinor: true,
        settings: { bpm: 90, style: 'blues' }
    },
    { 
        name: "8-Bar Blues", 
        sections: [{ label: 'Main', value: "I | V7 | IV | IV | I | V7 | I | V7" }], 
        category: "Blues",
        settings: { bpm: 110, style: 'blues' }
    },
    { 
        name: "Jazz Blues", 
        sections: [{ label: 'Main', value: "I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7" }], 
        category: "Blues",
        settings: { bpm: 140, style: 'jazz' }
    },
    { 
        name: "Giant Steps", 
        sections: [{ label: 'Main', value: "Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7" }], 
        category: "Jazz",
        settings: { bpm: 220, style: 'jazz' }
    },
    { 
        name: "Ornithology", 
        sections: [
            { label: 'A', value: "Gmaj7 | Gmaj7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Fm7 | Bb7" },
            { label: 'A', value: "Gmaj7 | Gmaj7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Fm7 | Bb7" },
            { label: 'B', value: "Ebmaj7 | Ebmaj7 | Am7b5 | D7b9 | Gm7 | Gm7 | Am7 | D7" },
            { label: 'A', value: "Gmaj7 | Gmaj7 | Gm7 | C7 | Fm7 | Bb7 | Ebmaj7 D7 | Gmaj7" }
        ], 
        category: "Jazz",
        settings: { bpm: 160, style: 'jazz' }
    },
    { 
        name: "Rhythm Changes", 
        sections: [
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "B", value: "III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" }
        ],
        category: "Jazz",
        settings: { bpm: 180, style: 'jazz' } 
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
        isMinor: false,
        settings: { bpm: 140, style: 'jazz' }
    },
    { 
        name: "Jazz Turnaround", 
        sections: [{ label: 'Main', value: "Imaj7 VI7 | ii7 V7 | Imaj7 VI7 | ii7 V7" }], 
        category: "Jazz",
        settings: { bpm: 150, style: 'jazz' }
    },
    { 
        name: "Jazz Cycle", 
        sections: [{ label: 'Main', value: "iii7 | VI7#9 | ii9 | V9 | Imaj9" }], 
        category: "Jazz",
        settings: { bpm: 120, style: 'jazz' }
    },
    { 
        name: "Neo-Soul", 
        sections: [{ label: 'Main', value: "IVmaj7 | iii7 | ii7 | Imaj7" }], 
        category: "Soul/R&B",
        settings: { bpm: 85, style: 'neo' }
    },
    { 
        name: "Neo-Soul (Slash)", 
        sections: [{ label: 'Main', value: "IVmaj7/5 | iii7 | ii7/5 | Imaj7" }], 
        category: "Soul/R&B",
        settings: { bpm: 80, style: 'neo' }
    },
    { 
        name: "Acid Jazz Vamp", 
        sections: [{ label: 'Main', value: "i9 | IV9 | i9 | V7#9" }], 
        category: "Soul/Funk", 
        isMinor: true,
        settings: { bpm: 105, style: 'funk' }
    },
    { 
        name: "Funk (i-IV)", 
        sections: [{ label: 'Main', value: "i7 | IV7 | i7 | IV7" }], 
        category: "Soul/R&B", 
        isMinor: true,
        settings: { bpm: 110, style: 'funk' }
    },
    { 
        name: "Circle of 4ths", 
        sections: [{ label: 'Main', value: "I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7" }], 
        category: "Theory" 
    },
    { 
        name: "Plagal Flow", 
        sections: [{ label: 'Main', value: "I | IV | I | IV" }], 
        category: "Theory" 
    }
];
// Post-process DRUM_PRESETS to expand string patterns into arrays
for (const p of Object.values(DRUM_PRESETS)) {
    const expand = (obj) => {
        for (const [key, val] of Object.entries(obj)) {
            if (typeof val === 'string' && /^[0-2]+$/.test(val)) {
                obj[key] = Array.from(val, Number);
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                expand(val);
            }
        }
    };
    expand(p);
}
