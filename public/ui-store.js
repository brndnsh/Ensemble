/**
 * UIStore - Non-reactive storage for DOM caches and UI-specific transient state.
 * This prevents large HTMLElement arrays from bloating the reactive state or being serialized.
 */
export const UIStore = {
    cachedCards: [],
    cardOffsets: [],
    cachedSteps: []
};
