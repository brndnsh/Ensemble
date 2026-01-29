import { useState, useEffect, useCallback } from 'preact/hooks';
import { subscribe, dispatch as internalDispatch, playback, chords, bass, soloist, harmony, groove, arranger, vizState, midi } from './state.js';

// Reconstruct the map locally since it's not exported directly, though it is passed to listeners
const localStateMap = { playback, chords, bass, soloist, harmony, groove, arranger, vizState, midi };

/**
 * Hook to access the Ensemble global state.
 * @param {Function} selector - Function taking (state) and returning a slice.
 * @returns {*} The selected state slice.
 */
export function useEnsembleState(selector) {
    const [slice, setSlice] = useState(() => selector(localStateMap));

    useEffect(() => {
        const update = (action, payload, updatedStateMap) => {
            const newSlice = selector(updatedStateMap);
            setSlice(prev => {
                if (prev === newSlice) return prev;
                return newSlice;
            });
        };
        
        // Initial sync in case state changed between render and effect
        update(null, null, localStateMap);

        const unsubscribe = subscribe(update);
        return unsubscribe;
    }, [selector]);

    return slice;
}

/**
 * Hook to get the dispatch function.
 */
export function useDispatch() {
    return useCallback((action, payload) => {
        internalDispatch(action, payload);
    }, []);
}

/**
 * Helper to force a re-render if needed (rarely used if selectors are good)
 */
export function useForceUpdate() {
    const [, setTick] = useState(0);
    return useCallback(() => setTick(t => t + 1), []);
}
