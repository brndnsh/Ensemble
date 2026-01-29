import { useState, useEffect, useCallback } from 'preact/hooks';
import { subscribe, dispatch as internalDispatch, playback, chords, bass, soloist, harmony, groove, arranger, vizState, midi } from './state.js';

// Reconstruct the map locally since it's not exported directly, though it is passed to listeners
const localStateMap = { playback, chords, bass, soloist, harmony, groove, arranger, vizState, midi };

function shallowEqual(objA, objB) {
    if (Object.is(objA, objB)) return true;
    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(objB, keysA[i]) || !Object.is(objA[keysA[i]], objB[keysA[i]])) return false;
    }
    return true;
}

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
            setSlice(prevSlice => {
                if (!shallowEqual(prevSlice, newSlice)) {
                    return newSlice;
                }
                return prevSlice;
            });
        };
        
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
