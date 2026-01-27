/**
 * UIStore - Centralized storage for DOM caches, UI-specific state, and lazy element retrieval.
 * This prevents circular dependencies by providing a single point of truth for UI references
 * that can be accessed without importing the large ui.js or ui-controller.js modules.
 */
export const UIStore = {
    // --- DOM Cache ---
    elements: new Map(),
    cachedCards: [],
    cardOffsets: [],
    cachedSteps: [],

    // --- Late-bound references to break circularity ---
    conductor: null,
    triggerFlash: null,

    /**
     * Lazy getter for DOM elements with caching.
     * @param {string} key - Unique key for the element.
     * @param {string} selector - CSS selector.
     * @returns {HTMLElement|null}
     */
    get(key, selector) {
        if (this.elements.has(key)) return this.elements.get(key);
        const el = document.querySelector(selector);
        if (el) this.elements.set(key, el);
        return el;
    },

    /**
     * Injects the conductor and flash references once they are loaded.
     */
    initLateBounds(conductor, flash) {
        this.conductor = conductor;
        this.triggerFlashRef = flash;
    },

    /**
     * Triggers a global visual flash using the late-bound reference.
     */
    triggerFlash(intensity) {
        if (this.triggerFlashRef) {
            this.triggerFlashRef(intensity);
        }
    }
};
