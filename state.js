export const ctx = {
    audio: null,
    masterGain: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    timerID: null,
    lookahead: 25.0,
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
    octave: 65,
    valid: false
};

export const gb = {
    enabled: true,
    instruments: [
        { name: 'Kick',  symbol: '🥁', steps: new Array(16).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(16).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(16).fill(0), muted: false },
        { name: 'Open',  symbol: '📀', steps: new Array(16).fill(0), muted: false }
    ],
    volume: 0.6,
    measures: 1,
    swing: 0,
    swingSub: '8th',
    audioBuffers: {} 
};

export const bb = {
    enabled: true,
    volume: 0.5,
    lastFreq: null,
    octave: 41,
    style: 'arp',
    history: [],
    chordHistory: []
};

export const sb = {
    enabled: false,
    volume: 0.4,
    lastFreq: null,
    octave: 77, // F5
    style: 'scalar',
    history: [],
    chordHistory: [],
    direction: 1,      // 1 for up, -1 for down
    patternMode: 'scale', // 'scale', 'arp', 'stay'
    patternSteps: 0     // How many steps remain in current pattern
};

export const getUserPresets = () => JSON.parse(localStorage.getItem('ensemble_userPresets') || '[]');
export const getUserDrumPresets = () => JSON.parse(localStorage.getItem('ensemble_userDrumPresets') || '[]');

export const saveUserPresets = (presets) => localStorage.setItem('ensemble_userPresets', JSON.stringify(presets));
export const saveUserDrumPresets = (presets) => localStorage.setItem('ensemble_userDrumPresets', JSON.stringify(presets));
