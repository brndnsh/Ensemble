/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render } from 'preact';
import React from 'preact/compat';
import { GlobalShortcuts } from '../../public/components/GlobalShortcuts.jsx';
import { togglePlay } from '../../public/scheduler-core.js';
import { ModalManager } from '../../public/ui-modal-controller.js';

// Mock scheduler-core
vi.mock('../../public/scheduler-core.js', () => ({
    togglePlay: vi.fn()
}));

// Mock ModalManager
vi.mock('../../public/ui-modal-controller.js', () => ({
    ModalManager: {
        activeModal: null,
        open: vi.fn(),
        close: vi.fn()
    }
}));

// Mock State
vi.mock('../../public/state.js', () => ({
    playback: { viz: {} },
    groove: { currentMeasure: 0, measures: 4 }
}));

// Mock instrument-controller
vi.mock('../../public/instrument-controller.js', () => ({
    switchMeasure: vi.fn()
}));

describe('Global Shortcuts', () => {
    let container;

    beforeEach(async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        render(<GlobalShortcuts />, container);
        await new Promise(r => setTimeout(r, 100));
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.clearAllMocks();
    });

    it('should toggle playback on Space', () => {
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
        expect(togglePlay).toHaveBeenCalled();
    });

    it('should NOT toggle playback if modal is open', () => {
        ModalManager.activeModal = document.createElement('div');
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
        expect(togglePlay).not.toHaveBeenCalled();
        ModalManager.activeModal = null; // Reset
    });

    it('should toggle editor on E', () => {
        // Mock getElementById
        const overlay = document.createElement('div');
        overlay.id = 'editorOverlay';
        document.body.appendChild(overlay);

        const event = new KeyboardEvent('keydown', { key: 'e' });
        window.dispatchEvent(event);

        expect(ModalManager.open).toHaveBeenCalledWith(overlay);

        overlay.remove();
    });
});
