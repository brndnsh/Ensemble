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
    // Initialize with current state
    const [slice, setSlice] = useState(() => selector(localStateMap));

    useEffect(() => {
        const unsubscribe = subscribe((action, payload, updatedStateMap) => {
            const newSlice = selector(updatedStateMap);
            
            setSlice(prev => {
                // If the selector returns a primitive (string, number, boolean), strict equality is sufficient.
                // If it returns an object, we rely on the reducer having created a new reference,
                // OR we force an update if we know it's a mutation.
                // Given the legacy mutable state, we might encounter issues where prev === newSlice even if content changed.
                // For this refactor, we encourage selectors to return primitives or spread copies.
                if (prev === newSlice) return prev;
                return newSlice;
            });
        });
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
