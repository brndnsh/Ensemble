import { ACTIONS } from '../types.js';

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
 * @property {number} snareMask - 16-bit mask of the current snare pattern.
 * @property {boolean} pendingCrash - Whether a crash cymbal is queued for the next downbeat.
 */
export const groove = {
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
    buffer: new Map(),
    activeTab: 'smart',
    mobileTab: 'chords',
    lastHatGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false
};

export function grooveReducer(action, payload, playback) {
    switch (action) {
        case ACTIONS.SET_SWING:
            Object.assign(groove, { swing: payload });
            return true;
        case ACTIONS.SET_SWING_SUB:
            Object.assign(groove, { swingSub: payload });
            return true;
        case ACTIONS.SET_HUMANIZE:
            Object.assign(groove, { humanize: payload });
            return true;
        case ACTIONS.SET_FOLLOW_PLAYBACK:
            Object.assign(groove, { followPlayback: payload });
            return true;
        case ACTIONS.SET_LARS_MODE:
            Object.assign(groove, { larsMode: !!payload });
            return true;
        case ACTIONS.SET_LARS_INTENSITY:
            Object.assign(groove, { larsIntensity: Math.max(0, Math.min(1, payload)) });
            return true;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                Object.assign(groove, { pendingGenreFeel: payload });
            } else {
                const updates = { genreFeel: payload.feel, pendingGenreFeel: null };
                if (payload.swing !== undefined) updates.swing = payload.swing;
                if (payload.sub !== undefined) updates.swingSub = payload.sub;
                Object.assign(groove, updates);
            }
            return true;
        case ACTIONS.SET_ACTIVE_TAB:
            if (payload.module === 'groove') {
                Object.assign(groove, { activeTab: payload.tab });
                return true;
            }
            return false;
        case ACTIONS.TRIGGER_FILL:
            Object.assign(groove, {
                fillSteps: payload.steps,
                fillActive: true,
                fillStartStep: payload.startStep,
                fillLength: payload.length,
                pendingCrash: !!payload.crash
            });
            return true;
    }
    return false;
}
