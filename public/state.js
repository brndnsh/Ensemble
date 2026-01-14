/**
 * @typedef {Object} GlobalContext
 * @property {AudioContext|null} audio - The Web Audio API context.
 * @property {GainNode|null} masterGain - The master volume gain node.
 * @property {WaveShaperNode|null} saturator - The master soft-clipper/saturator.
 * @property {DynamicsCompressorNode|null} limiter - The master safety limiter.
 * @property {ConvolverNode|null} reverbNode - The global reverb node.
 * @property {GainNode|null} chordsGain - The gain node for chords.
 * @property {GainNode|null} chordsReverb - Reverb send for chords.
 * @property {BiquadFilterNode|null} chordsEQ - EQ for chords (HP/Notch).
 * @property {GainNode|null} drumsReverb - Reverb send for drums.
 * @property {GainNode|null} bassReverb - Reverb send for bass.
 * @property {GainNode|null} soloistReverb - Reverb send for soloist.
 * @property {boolean} isPlaying - Whether the sequencer is currently playing.
 * @property {number} bpm - Beats per minute (40-240).
 * @property {number} nextNoteTime - The scheduler time for the next note (swung).
 * @property {number} unswungNextNoteTime - The scheduler time for the next note (straight/quantized).
 * @property {number} scheduleAheadTime - Lookahead time for scheduling (in seconds).
 * @property {number} step - The global step counter.
 * @property {Array<Object>} drawQueue - Queue of visual events to be rendered.
 * @property {boolean} isCountingIn - Whether the metronome count-in is active.
 * @property {number} countInBeat - Current beat of the count-in (0-3).
 * @property {boolean} isDrawing - Whether the visualizer loop is active.
 * @property {string} theme - The current UI theme ('auto', 'light', 'dark').
 * @property {WakeLockSentinel|null} wakeLock - The screen wake lock object.
 * @property {number} bandIntensity - Global band intensity/energy level (0.0 - 1.0).
 * @property {number} complexity - Global complexity level (0.0 - 1.0).
 * @property {boolean} autoIntensity - Whether the intensity automatically drifts over time.
 * @property {boolean} metronome - Whether the metronome is active.
 * @property {boolean} applyPresetSettings - Whether to apply BPM/Style from presets.
 * @property {boolean} sustainActive - Whether the global sustain pedal is "pressed".
 * @property {Object} intent - Current rhythmic intent (syncopation, anticipation, etc).
 */
export const ctx = {
    audio: null,
    masterGain: null,
    saturator: null,
    limiter: null,
    reverbNode: null,
    chordsGain: null,
    chordsReverb: null,
    chordsEQ: null,
    drumsReverb: null,
    bassReverb: null,
    soloistReverb: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    unswungNextNoteTime: 0.0,
    scheduleAheadTime: 0.2,
    step: 0, 
    drawQueue: [],
    isCountingIn: false,
    countInBeat: 0,
    isDrawing: false,
    theme: 'auto',
    wakeLock: null,
    bandIntensity: 0.5, // The 'Conductor' signal for global energy
    complexity: 0.3,
    autoIntensity: true,
    metronome: false,
    applyPresetSettings: false,
    sustainActive: false,
    intent: {
        syncopation: 0.2,
        anticipation: 0.1,
        layBack: 0.0,
        density: 0.5
    }
};

/**
 * @typedef {Object} Section
 * @property {string} id - Unique identifier for the section.
 * @property {string} label - Display name (e.g., "Verse", "Chorus").
 * @property {string} value - The chord progression string (e.g., "I | IV").
 * @property {string} [color] - Optional color hex code for UI accent.
 */

/**
 * @typedef {Object} ArrangerState
 * @property {Array<Section>} sections - List of song sections.
 * @property {Array<Object>} progression - Flattened list of parsed chord objects.
 * @property {string} key - The musical key (e.g., "C", "F#").
 * @property {string} timeSignature - The time signature (e.g., "4/4", "3/4").
 * @property {boolean} isMinor - Whether the key is minor.
 * @property {string} notation - Notation style ('roman', 'nns', 'name').
 * @property {boolean} valid - Whether the current progression is valid.
 * @property {number} totalSteps - Total number of 16th note steps in the song.
 * @property {Array<{start: number, end: number, chord: Object}>} stepMap - Map of steps to chord objects.
 * @property {Array<HTMLElement>} cachedCards - Cache of chord DOM elements.
 * @property {Array<number>} cardOffsets - Cache of chord card scroll positions.
 * @property {Array<string>} history - Undo history stack (JSON strings).
 * @property {string} lastInteractedSectionId - ID of the last edited section.
 * @property {string} lastChordPreset - Name of the last loaded chord preset.
 */
export const arranger = {
    sections: [{ id: 's1', label: 'Intro', value: 'I | V | vi | IV', color: '#3b82f6' }],
    progression: [],
    key: 'C',
    timeSignature: '4/4',
    grouping: null, // Custom grouping array (e.g. [3, 2])
    isMinor: false,
    notation: 'roman',
    valid: false,
    totalSteps: 0,
    stepMap: [],
    // UI Cache for Visualizer
    cachedCards: [],
    cardOffsets: [],
    // History for Undo
    history: [],
    lastInteractedSectionId: 's1',
    lastChordPreset: 'Pop (Standard)'
};

/**
 * @property {boolean} enabled - Whether the accompanist is active.
 * @property {string} style - The comping style ('smart', 'pad', etc).
 * @property {number} volume - Output gain multiplier.
 * @property {number} reverb - Reverb send amount.
 * @property {number} octave - Base MIDI octave for voicing.
 * @property {string} density - Voicing density ('thin', 'standard', 'rich').
 * @property {boolean} practiceMode - Whether to use rootless voicings even if bass is off.
 * @property {number|null} lastActiveChordIndex - Index of the currently playing chord.
 */
export const cb = {
    enabled: true,
    style: 'smart',
    volume: 0.5,
    reverb: 0.3,
    octave: 65,
    density: 'standard', 
    practiceMode: true,
    lastActiveChordIndex: null,
    buffer: new Map(),
    activeTab: 'smart'
};

/**
 * @typedef {Object} Instrument
 * @property {string} name - Instrument name (e.g., 'Kick').
 * @property {string} symbol - Display emoji/symbol.
 * @property {Array<number>} steps - Sequencer steps (0=off, 1=on, 2=accent).
 * @property {boolean} muted - Whether the instrument is muted.
 */

/**
 * @typedef {Object} GrooveState
 * @property {boolean} enabled - Whether the drum engine is active.
 * @property {Array<Instrument>} instruments - List of drum instruments.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number} measures - Number of measures in the loop (1-8).
 * @property {number} currentMeasure - Currently visible measure for editing.
 * @property {boolean} followPlayback - Whether to scroll grid during playback.
 * @property {number} humanize - Humanization percentage (0-100).
 * @property {number} swing - Swing percentage (0-100).
 * @property {string} swingSub - Swing subdivision ('8th' or '16th').
 * @property {string} lastDrumPreset - Name of the last loaded drum preset.
 * @property {Object} audioBuffers - Cache for decoded drum samples.
 * @property {Array<Array<HTMLElement>>} cachedSteps - DOM cache for sequencer grid.
 * @property {string} genreFeel - Active genre for procedural nuances ('Rock', 'Jazz', 'Funk').
 * @property {boolean} fillActive - Whether a drum fill is currently being played.
 * @property {Object} fillSteps - Transient storage for the generated fill pattern.
 */
export const gb = {
    enabled: true,
    instruments: [
        { name: 'Kick',  symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(128).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(128).fill(0), muted: false },
        { name: 'Open',  symbol: '📀', steps: new Array(128).fill(0), muted: false }
    ],
    volume: 0.5,
    reverb: 0.2,
    measures: 1,
    currentMeasure: 0,
    followPlayback: true,
    humanize: 20,
    swing: 0,
    swingSub: '8th',
    lastDrumPreset: 'Basic Rock',
    audioBuffers: {},
    cachedSteps: [],
    genreFeel: 'Rock',
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    fillActive: false,
    fillSteps: {},
    activeTab: 'smart',
    mobileTab: 'chords'
};

/**
 * @typedef {Object} BassState
 * @property {boolean} enabled - Whether the bass engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number|null} lastFreq - Frequency of the last played note.
 * @property {number|null} lastPlayedFreq - Frequency of the note currently ringing.
 * @property {Map<number, Object>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Playing style ID (e.g., 'walking', 'funk').
 * @property {number} pocketOffset - Micro-timing offset in seconds (e.g. 0.02 for 20ms lag).
 * @property {number} busySteps - Counter for "busy" playing periods.
 */
export const bb = {
    enabled: false,
    volume: 0.45,
    reverb: 0.05,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    octave: 38,
    style: 'smart',
    pocketOffset: 0.0,
    busySteps: 0,
    activeTab: 'smart'
};

/**
 * @typedef {Object} SoloistState
 * @property {boolean} enabled - Whether the soloist engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number|null} lastFreq - Last generated frequency.
 * @property {number|null} lastPlayedFreq - Last played frequency.
 * @property {Map<number, Object>} buffer - Map of scheduled notes from the worker.
 * @property {number} lastNoteEnd - Time when the last note ends.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Soloing style ID (e.g., 'blues', 'shred').
 * @property {number} direction - Melodic direction (1 or -1).
 * @property {string} melodicTrend - Current melodic direction intent ('Up', 'Down', 'Static').
 * @property {number} contourSteps - Remaining steps for the current melodic trend.
 * @property {number} currentPhraseSteps - Steps elapsed in current phrase.
 * @property {number} notesInPhrase - Number of notes played in the current phrase.
 * @property {string} qaState - Conversational state ('Question' or 'Answer').
 * @property {boolean} isResting - Whether the soloist is taking a breath.
 * @property {Array<number>} currentCell - Current rhythmic cell.
 * @property {number} busySteps - Counter for "busy" playing periods.
 * @property {Array<Object>} motifBuffer - Short-term memory for current phrase.
 * @property {Array<Object>} hookBuffer - Long-term memory for catchy loops.
 * @property {boolean} isReplayingMotif - Whether currently replaying a motif.
 * @property {number} motifReplayIndex - Current index in motif/hook replay.
 * @property {number} hookRetentionProb - Probability of retaining a motif as a "hook".
 * @property {number} tension - Current harmonic tension level (0.0 - 1.0).
 */
export const sb = {
    enabled: false,
    volume: 0.5,
    reverb: 0.6,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
    lastNoteStartTime: 0,
    octave: 72, // C5
    style: 'smart',
    direction: 1,
    melodicTrend: 'Static',
    contourSteps: 0,
    currentPhraseSteps: 0,
    notesInPhrase: 0,
    qaState: 'Question',
    isResting: false,
    currentCell: [1, 0, 1, 0],
    busySteps: 0,
    motifBuffer: [],
    hookBuffer: [],
    isReplayingMotif: false,
    motifReplayIndex: 0,
    hookRetentionProb: 0.4,
    tension: 0,
    deviceBuffer: [], // Buffer for multi-step melodic devices like enclosures
    activeTab: 'smart'
};

/**
 * @typedef {Object} VisualizerState
 * @property {boolean} enabled - Whether the advanced visualizer is active.
 */
export const vizState = {
    enabled: false
};

// Persistence Helpers
export const storage = {
    get: (key) => {
        if (typeof localStorage === 'undefined') return [];
        return JSON.parse(localStorage.getItem(`ensemble_${key}`) || '[]');
    },
    save: (key, val) => {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(`ensemble_${key}`, JSON.stringify(val));
    }
};

// --- Event Bus / State Manager ---

const listeners = new Set();
const stateMap = { ctx, cb, bb, sb, gb, arranger, vizState };

/**
 * Dispatch a state change action.
 * @param {string} action - The action type (e.g., 'SET_INTENSITY', 'UPDATE_STYLE').
 * @param {*} [payload] - The data associated with the action.
 */
export function dispatch(action, payload) {
    switch (action) {
        // --- Global / Conductor ---
        case 'SET_BAND_INTENSITY':
            ctx.bandIntensity = Math.max(0, Math.min(1, payload));
            break;
        case 'SET_PARAM':
            if (stateMap[payload.module]) stateMap[payload.module][payload.param] = payload.value;
            break;
        case 'SET_COMPLEXITY':
            ctx.complexity = Math.max(0, Math.min(1, payload));
            break;
        case 'SET_AUTO_INTENSITY':
            ctx.autoIntensity = !!payload;
            break;
        case 'UPDATE_CONDUCTOR_DECISION': 
            // Composite update from Conductor
            if (payload.density) cb.density = payload.density;
            if (payload.velocity) ctx.conductorVelocity = payload.velocity;
            if (payload.hookProb) sb.hookRetentionProb = payload.hookProb;
            if (payload.intent) Object.assign(ctx.intent, payload.intent);
            break;

        // --- Instrument Settings ---
        case 'SET_STYLE':
            // payload: { module: 'cb'|'bb'|'sb', style: 'smart' }
            if (stateMap[payload.module]) stateMap[payload.module].style = payload.style;
            break;
        case 'SET_DENSITY':
            cb.density = payload;
            break;
        case 'SET_VOLUME':
            // payload: { module: 'cb', value: 0.5 }
            if (stateMap[payload.module]) stateMap[payload.module].volume = payload.value;
            break;
        case 'SET_REVERB':
            if (stateMap[payload.module]) stateMap[payload.module].reverb = payload.value;
            break;
        case 'SET_OCTAVE':
            if (stateMap[payload.module]) stateMap[payload.module].octave = payload.value;
            break;
        
        // --- Groove / Drums ---
        case 'SET_SWING':
            gb.swing = payload;
            break;
        case 'SET_SWING_SUB':
            gb.swingSub = payload;
            break;
        case 'SET_HUMANIZE':
            gb.humanize = payload;
            break;
        case 'SET_FOLLOW_PLAYBACK':
            gb.followPlayback = payload;
            break;
        case 'SET_GENRE_FEEL':
            // payload: { feel: 'Rock', swing: 0, sub: '8th', drum: '...', ... }
            if (ctx.isPlaying) {
                gb.pendingGenreFeel = payload;
            } else {
                gb.genreFeel = payload.feel;
                if (payload.swing !== undefined) gb.swing = payload.swing;
                if (payload.sub !== undefined) gb.swingSub = payload.sub;
                gb.pendingGenreFeel = null;
            }
            break;
        case 'TRIGGER_FILL':
            gb.fillSteps = payload.steps;
            gb.fillActive = true;
            gb.fillStartStep = payload.startStep;
            gb.fillLength = payload.length;
            gb.pendingCrash = !!payload.crash;
            break;
        case 'SET_ACTIVE_TAB':
            // payload: { module: 'cb', tab: 'smart' }
            stateMap[payload.module].activeTab = payload.tab;
            break;
        
        // --- Options ---
        case 'SET_METRONOME':
            ctx.metronome = payload;
            break;
        case 'SET_PRESET_SETTINGS_MODE':
            ctx.applyPresetSettings = payload;
            break;
        case 'SET_PRACTICE_MODE':
            cb.practiceMode = payload;
            break;
        case 'SET_NOTATION':
            arranger.notation = payload;
            break;
    }

    // Notify listeners
    listeners.forEach(listener => listener(action, payload, stateMap));
}

/**
 * Subscribe to state changes.
 * @param {Function} listener - Callback function receiving (action, payload, state).
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
