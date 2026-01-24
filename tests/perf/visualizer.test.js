// @vitest-environment happy-dom
import { UnifiedVisualizer } from '../../public/visualizer.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
};

describe('UnifiedVisualizer Performance', () => {
    let visualizer;
    let container;
    let getPropertyValueSpy;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'viz-container';
        // Give it some dimensions
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 })
        });
        document.body.appendChild(container);

        // Mock matchMedia
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        getPropertyValueSpy = vi.fn((prop) => {
             if (prop && prop.startsWith('--')) return '#123456';
             return '';
        });

        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: getPropertyValueSpy
        });

        // Mock Canvas
        const mockContext = {
            scale: vi.fn(),
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            fillText: vi.fn(),
            set lineCap(v) {},
            set lineJoin(v) {},
            set lineWidth(v) {},
            set strokeStyle(v) {},
            set fillStyle(v) {},
            set font(v) {},
            set textAlign(v) {},
            set textBaseline(v) {},
            set globalAlpha(v) {},
        };

        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            const el = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                el.getContext = vi.fn().mockReturnValue(mockContext);
            }
            return el;
        });
    });

    afterEach(() => {
        if (visualizer) visualizer.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('measures getPropertyValue calls during render', () => {
        visualizer = new UnifiedVisualizer('viz-container');
        // Force resize
        visualizer.resize();

        visualizer.addTrack('bass', 'var(--blue)');
        visualizer.addTrack('drums', 'var(--green)');
        visualizer.addTrack('melody', 'var(--red)');

        // Add some history
        visualizer.pushNote('bass', { time: 1, midi: 60, duration: 1 });
        visualizer.pushNote('drums', { time: 1, midi: 36, duration: 1 });
        visualizer.pushNote('melody', { time: 1, midi: 72, duration: 1 });

        getPropertyValueSpy.mockClear();

        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            visualizer.render(1.5, 120);
        }

        console.log(`[Optimized] getPropertyValue calls: ${getPropertyValueSpy.mock.calls.length}`);

        // Should be very low (only initial resolution)
        // 4 for chords + 3 for tracks = 7 expected
        expect(getPropertyValueSpy.mock.calls.length).toBeLessThan(50);
        expect(getPropertyValueSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('re-resolves colors when theme changes', () => {
        visualizer = new UnifiedVisualizer('viz-container');
        visualizer.resize();
        visualizer.addTrack('bass', 'var(--blue)');

        getPropertyValueSpy.mockClear();

        // 1. Initial Render
        document.documentElement.setAttribute('data-theme', 'light');

        visualizer.render(0, 120);
        const callsAfterFirstRender = getPropertyValueSpy.mock.calls.length;
        // Should be 4 (chords) + 1 (bass) = 5
        expect(callsAfterFirstRender).toBe(5);

        // 2. Second Render (No Change)
        visualizer.render(0.1, 120);
        expect(getPropertyValueSpy.mock.calls.length).toBe(callsAfterFirstRender);

        // 3. Change Theme
        document.documentElement.setAttribute('data-theme', 'dark');
        visualizer.render(0.2, 120);

        // Should re-resolve
        const callsAfterThemeChange = getPropertyValueSpy.mock.calls.length;
        expect(callsAfterThemeChange).toBeGreaterThan(callsAfterFirstRender);
        expect(callsAfterThemeChange).toBe(callsAfterFirstRender + 5); // Another 5 calls
    });
});
