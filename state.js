export const ctx = {
    audio: null,
    masterGain: null,
    reverbNode: null,
    chordsReverb: null,
    drumsReverb: null,
    bassReverb: null,
    soloistReverb: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    unswungNextNoteTime: 0.0,
    scheduleAheadTime: 0.1,
    step: 0, 
    drawQueue: [],
    isCountingIn: false,
    countInBeat: 0,
    isDrawing: false,
    wakeLock: null
};

export const cb = {
    enabled: true,
    progression: [],
    key: 'C',
    style: 'pad',
    notation: 'roman',
    volume: 0.5,
    reverb: 0.3,
    octave: 65,
    density: 'standard', // 'thin', 'standard', 'rich'
    valid: false,
    cachedCards: [],
    lastActiveChordIndex: null,
    totalSteps: 0,
    stepMap: [],
    cardOffsets: [],
    cardHeights: []
};

export const gb = {
    enabled: true,
    instruments: [
        { name: 'Kick',  symbol: '🥁', steps: new Array(16).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(16).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(16).fill(0), muted: false },
        { name: 'Open',  symbol: '📀', steps: new Array(16).fill(0), muted: false }
    ],
    volume: 0.5,
    reverb: 0.2,
    measures: 1,
    swing: 0,
    swingSub: '8th',
    audioBuffers: {},
    cachedSteps: [] 
};

export const bb = {
    enabled: false,
    volume: 0.45,
    reverb: 0.05,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    octave: 36,
    style: 'arp',
    history: [],
    chordHistory: []
};

export const sb = {
    enabled: false,
    volume: 0.5,
    reverb: 0.6,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
    octave: 77, // F5
    style: 'scalar',
    history: [],
    chordHistory: [],
    direction: 1,      // 1 for up, -1 for down
    patternMode: 'scale', // 'scale', 'arp', 'stay'
    patternSteps: 0,     // How many steps remain in current pattern
    sequenceType: null,   // Type of sequence currently playing
    sequenceIndex: 0,    // Current step in the sequence
    sequenceBaseMidi: null, // The starting midi note for the sequence
    phraseSteps: 0,
    isResting: false,
    currentCell: [1, 0, 1, 0],
    currentLick: null,
    lickIndex: 0,
    lickBaseMidi: null,
    busySteps: 0
};

export const vizState = {
    enabled: false
};

// Persistence Helpers
export const storage = {
    get: (key) => JSON.parse(localStorage.getItem(`ensemble_${key}`) || '[]'),
    save: (key, val) => localStorage.setItem(`ensemble_${key}`, JSON.stringify(val))
};
