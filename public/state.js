/**
 * @typedef {Object} GlobalContext
 * @property {AudioContext|null} audio - The Web Audio API context.
 * @property {GainNode|null} masterGain - The master volume gain node.
 * @property {WaveShaperNode|null} saturator - The master soft-clipper/saturator.
 * @property {DynamicsCompressorNode|null} masterLimiter - The master safety limiter.
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
 * @property {number} sessionTimer - Session timer in minutes (0 = infinite).
 * @property {boolean} stopAtEnd - Whether to stop at the end of the current progression/loop.
 * @property {boolean} isEndingPending - Whether the resolution sequence is about to trigger.
 * @property {Object} intent - Current rhythmic intent (syncopation, anticipation, etc).
 * @property {Array<HTMLElement>|null} lastActiveDrumElements - Cache of currently animating drum UI elements.
 * @property {number} lastPlayingStep - The last step index processed by the UI loop.
 * @property {boolean} workerLogging - Whether to log messages from the audio worker.
 * @property {Object|null} viz - Reference to the Visualizer instance.
 * @property {number|null} suspendTimeout - ID of the timeout for audio context suspension.
 * @property {number} conductorVelocity - Dynamic velocity modifier (0.0-1.0) applied by Conductor.
 */
export const ctx = {
    audio: null,
    masterGain: null,
    saturator: null,
    reverbNode: null,
    chordsGain: null,
    chordsReverb: null,
    chordsEQ: null,
    drumsReverb: null,
    drumsGain: null,
    bassReverb: null,
    bassGain: null,
    bassEQ: null,
    soloistReverb: null,
    soloistGain: null,
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
    sessionTimer: 0,
    stopAtEnd: false,
    isEndingPending: false,
    intent: {
        syncopation: 0.2,
        anticipation: 0.1,
        layBack: 0.0,
        density: 0.5
    },
    // --- Performance & UI ---
    lastActiveDrumElements: null,
    lastPlayingStep: 0,
    workerLogging: false,
    viz: null,
    suspendTimeout: null,
    conductorVelocity: 1.0,
    masterLimiter: null
};

/**
 * @typedef {Object} Section
 * @property {string} id - Unique identifier for the section.
 * @property {string} label - Display name (e.g., "Verse", "Chorus").
 * @property {string} value - The chord progression string (e.g., "I | IV").
 * @property {string} [color] - Optional color hex code for UI accent.
 * @property {number} [repeat] - Number of times to repeat this section (default 1).
 * @property {string} [key] - Local key for this section (e.g., "G").
 * @property {string} [timeSignature] - Local time signature for this section (e.g., "3/4").
 * @property {boolean} [seamless] - Whether this section transitions seamlessly from the previous one (suppresses fills).
 */

/**
 * @typedef {Object} ArrangerState
 * @property {Array<Section>} sections - List of song sections.
 * @property {Array<Object>} progression - Flattened list of parsed chord objects.
 * @property {string} key - The global musical key (e.g., "C", "F#").
 * @property {string} timeSignature - The global time signature (e.g., "4/4", "3/4").
 * @property {boolean} isMinor - Whether the key is minor.
 * @property {string} notation - Notation style ('roman', 'nns', 'name').
 * @property {boolean} valid - Whether the current progression is valid.
 * @property {number} totalSteps - Total number of 16th note steps in the song.
 * @property {Array<{start: number, end: number, chord: Object}>} stepMap - Map of steps to chord objects.
 * @property {Array<{start: number, end: number, ts: string}>} measureMap - Map of measures to time signatures.
 * @property {Array<string>} history - Undo history stack (JSON strings).
 * @property {string} lastInteractedSectionId - ID of the last edited section.
 * @property {string} lastChordPreset - Name of the last loaded chord preset.
 * @property {boolean} isDirty - Whether the arrangement has been manually modified.
 * @property {Array<number>|null} grouping - Custom rhythmic grouping array (e.g. [3, 2]).
 */
export const arranger = {
    sections: [{ id: 's1', label: 'Intro', value: 'I | V | vi | IV', color: '#3b82f6', repeat: 1 }],
    progression: [],
    key: 'C',
    timeSignature: '4/4',
    grouping: null, // Custom grouping array (e.g. [3, 2])
    isMinor: false,
    notation: 'roman',
    valid: false,
    totalSteps: 0,
    stepMap: [],
    measureMap: [],
    // History for Undo
    history: [],
    lastInteractedSectionId: 's1',
    lastChordPreset: 'Pop (Standard)',
    isDirty: false
};

/**
 * @typedef {Object} ChordState
 * @property {boolean} enabled - Whether the accompanist is active.
 * @property {string} style - The comping style ('smart', 'pad', etc).
 * @property {number} volume - Output gain multiplier.
 * @property {number} reverb - Reverb send amount.
 * @property {number} octave - Base MIDI octave for voicing.
 * @property {string} density - Voicing density ('thin', 'standard', 'rich').
 * @property {boolean} practiceMode - Whether to use rootless voicings even if bass is off.
 * @property {number|null} lastActiveChordIndex - Index of the currently playing chord.
 * @property {Map<number, Object>} buffer - Scheduled notes buffer.
 * @property {string} activeTab - Currently active UI tab ('classic' or 'smart').
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
 * @property {string} genreFeel - Active genre for procedural nuances ('Rock', 'Jazz', 'Funk').
 * @property {boolean} larsMode - Whether "Lars Mode" (tempo drift) is active.
 * @property {number} larsIntensity - Intensity of tempo drift (0.0 - 1.0).
 * @property {boolean} fillActive - Whether a drum fill is currently being played.
 * @property {Object} fillSteps - Transient storage for the generated fill pattern.
 * @property {string} activeTab - Currently active UI tab.
 * @property {string} mobileTab - Currently active mobile tab.
 * @property {number|null} lastHatGain - Last velocity for the hi-hat (for dynamics).
 * @property {number} fillStartStep - Step index where the current fill began.
 * @property {number} fillLength - Length of the current fill in steps.
 * @property {boolean} pendingCrash - Whether a crash cymbal is queued for the next downbeat.
 */
export const gb = {
    enabled: true,
    instruments: [
        { name: 'Kick',  symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(128).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(128).fill(0), muted: false },
        { name: 'Open',  symbol: '📀', steps: new Array(128).fill(0), muted: false },
        { name: 'Clave', symbol: '🥢', steps: new Array(128).fill(0), muted: false },
        { name: 'Conga', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Bongo', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Perc',  symbol: '🪇', steps: new Array(128).fill(0), muted: false },
        { name: 'Shaker', symbol: '🧂', steps: new Array(128).fill(0), muted: false },
        { name: 'Guiro', symbol: '🥖', steps: new Array(128).fill(0), muted: false },
        { name: 'High Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Mid Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Low Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false }
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
    genreFeel: 'Rock',
    larsMode: false,
    larsIntensity: 0.5,
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    fillActive: false,
    fillSteps: {},
    activeTab: 'smart',
    mobileTab: 'chords',
    lastHatGain: null,
    fillStartStep: 0,
    fillLength: 0,
    pendingCrash: false
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
 * @property {string} activeTab - Currently active UI tab.
 * @property {number|null} lastBassGain - Last velocity/gain value for dynamic continuity.
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
    activeTab: 'smart',
    lastBassGain: null
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
 * @property {boolean} doubleStops - Whether to play double stops (two notes at once).
 * @property {Array<GainNode>} activeVoices - List of active gain nodes for voice stealing.
 * @property {number} sessionSteps - Total steps elapsed since playback started.
 * @property {Array<Object>} deviceBuffer - Buffer for multi-step melodic devices.
 * @property {string} activeTab - Currently active UI tab.
 */
export const sb = {
    enabled: false,
    volume: 0.5,
    reverb: 0.6,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
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
    doubleStops: false, // Choosing between more guitar-like solos or vocal/horn style
    activeVoices: [], // Track active gain nodes for voice stealing (duophonic limit)
    sessionSteps: 0, // Steps elapsed since playback start for warm-up logic
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

/**
 * @typedef {Object} MidiState
 * @property {boolean} enabled - Whether Web MIDI output is active.
 * @property {Array<{id: string, name: string}>} outputs - List of available MIDI output ports.
 * @property {string|null} selectedOutputId - The ID of the currently selected MIDI output.
 * @property {number} chordsChannel - MIDI channel for Chords (1-16).
 * @property {number} bassChannel - MIDI channel for Bass (1-16).
 * @property {number} soloistChannel - MIDI channel for Soloist (1-16).
 * @property {number} drumsChannel - MIDI channel for Drums (1-16).
 * @property {number} latency - Global MIDI latency offset in ms.
 * @property {boolean} muteLocal - Whether to mute internal audio when MIDI is active.
 * @property {number} chordsOctave - Octave offset for chords.
 * @property {number} bassOctave - Octave offset for bass.
 * @property {number} soloistOctave - Octave offset for soloist.
 * @property {number} drumsOctave - Octave offset for drums.
 * @property {number} velocitySensitivity - Velocity scaling factor.
 */
export const midi = {
    enabled: false,
    outputs: [],
    selectedOutputId: null,
    chordsChannel: 1,
    bassChannel: 2,
    soloistChannel: 3,
    drumsChannel: 10,
    latency: 0,
    muteLocal: true,
    chordsOctave: 0,
    bassOctave: 0,
    soloistOctave: 0,
    drumsOctave: 0,
    velocitySensitivity: 1.0
};

import { ACTIONS } from './types.js';

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
const stateMap = { ctx, cb, bb, sb, gb, arranger, vizState, midi };

/**
 * Dispatch a state change action.
 * @param {string} action - The action type (e.g., ACTIONS.SET_INTENSITY).
 * @param {*} [payload] - The data associated with the action.
 */
export function dispatch(action, payload) {
    switch (action) {
        // --- MIDI ---
        case ACTIONS.SET_MIDI_CONFIG:
            Object.assign(midi, payload);
            break;
        // --- Global / Conductor ---
        case ACTIONS.SET_BAND_INTENSITY:
            ctx.bandIntensity = Math.max(0, Math.min(1, payload));
            break;
        case ACTIONS.SET_PARAM:
            if (stateMap[payload.module]) stateMap[payload.module][payload.param] = payload.value;
            break;
        case ACTIONS.SET_COMPLEXITY:
            ctx.complexity = Math.max(0, Math.min(1, payload));
            break;
        case ACTIONS.SET_AUTO_INTENSITY:
            ctx.autoIntensity = !!payload;
            break;
        case ACTIONS.SET_DOUBLE_STOPS:
            sb.doubleStops = !!payload;
            break;
        case ACTIONS.RESET_SESSION:
            sb.sessionSteps = 0;
            break;
        case ACTIONS.SET_SESSION_STEPS:
            sb.sessionSteps = payload;
            break;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION: 
            // Composite update from Conductor
            if (payload.density) cb.density = payload.density;
            if (payload.velocity) ctx.conductorVelocity = payload.velocity;
            if (payload.hookProb) sb.hookRetentionProb = payload.hookProb;
            if (payload.intent) Object.assign(ctx.intent, payload.intent);
            break;

        // --- Instrument Settings ---
        case ACTIONS.SET_STYLE:
            // payload: { module: 'cb'|'bb'|'sb', style: 'smart' }
            if (stateMap[payload.module]) stateMap[payload.module].style = payload.style;
            break;
        case ACTIONS.SET_DENSITY:
            cb.density = payload;
            break;
        case ACTIONS.SET_VOLUME:
            // payload: { module: 'cb', value: 0.5 }
            if (stateMap[payload.module]) stateMap[payload.module].volume = payload.value;
            break;
        case ACTIONS.SET_REVERB:
            if (stateMap[payload.module]) stateMap[payload.module].reverb = payload.value;
            break;
        case ACTIONS.SET_OCTAVE:
            if (stateMap[payload.module]) stateMap[payload.module].octave = payload.value;
            break;
        
        // --- Groove / Drums ---
        case ACTIONS.SET_SWING:
            gb.swing = payload;
            break;
        case ACTIONS.SET_SWING_SUB:
            gb.swingSub = payload;
            break;
        case ACTIONS.SET_HUMANIZE:
            gb.humanize = payload;
            break;
        case ACTIONS.SET_FOLLOW_PLAYBACK:
            gb.followPlayback = payload;
            break;
        case ACTIONS.SET_LARS_MODE:
            gb.larsMode = !!payload;
            break;
        case ACTIONS.SET_LARS_INTENSITY:
            gb.larsIntensity = Math.max(0, Math.min(1, payload));
            break;
        case ACTIONS.SET_GENRE_FEEL:
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
        case ACTIONS.TRIGGER_FILL:
            gb.fillSteps = payload.steps;
            gb.fillActive = true;
            gb.fillStartStep = payload.startStep;
            gb.fillLength = payload.length;
            gb.pendingCrash = !!payload.crash;
            break;
        case ACTIONS.SET_ACTIVE_TAB:
            // payload: { module: 'cb', tab: 'smart' }
            if (stateMap[payload.module]) stateMap[payload.module].activeTab = payload.tab;
            break;
        
        // --- Options ---
        case ACTIONS.SET_METRONOME:
            ctx.metronome = payload;
            break;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            ctx.applyPresetSettings = payload;
            break;
        case ACTIONS.SET_PRACTICE_MODE:
            cb.practiceMode = payload;
            break;
        case ACTIONS.SET_NOTATION:
            arranger.notation = payload;
            break;
        case ACTIONS.SET_SESSION_TIMER:
            ctx.sessionTimer = payload;
            break;
        case ACTIONS.SET_STOP_AT_END:
            ctx.stopAtEnd = payload;
            break;
        case ACTIONS.SET_ENDING_PENDING:
            ctx.isEndingPending = payload;
            break;
        case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
            if (ctx.scheduleAheadTime < 0.4) {
                ctx.scheduleAheadTime *= 2.0;
                console.warn(`[Performance] Emergency Lookahead Triggered: ${ctx.scheduleAheadTime}s`);
                setTimeout(() => {
                    ctx.scheduleAheadTime = 0.2;
                    console.log("[Performance] Lookahead reset to normal.");
                }, 10000); // Reset after 10s of stability
            }
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
