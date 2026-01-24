/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer', () => {
    let visualizer;
    let mockCtx;
    let mockCanvas;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = '<div id="viz-container" style="width: 800px; height: 600px;"></div>';
        
        // Mock Context
        mockCtx = {
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            clearRect: vi.fn(),
            scale: vi.fn(),
            fillText: vi.fn(),
            measureText: vi.fn(() => ({ width: 10 })),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
            font: '',
            textAlign: '',
            textBaseline: ''
        };

        // Create a REAL canvas element from happy-dom
        const canvas = document.createElement('canvas');
        canvas.getContext = vi.fn(() => mockCtx);
        mockCanvas = canvas;

        // Mock ResizeObserver with proper spies
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback) {
                this.callback = callback;
                this.observe = vi.fn();
                this.unobserve = vi.fn();
                this.disconnect = vi.fn();
            }
        });

        // Use a safer way to mock createElement to avoid recursion
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName.toLowerCase() === 'canvas') return mockCanvas;
            // Use the prototype's original method to avoid recursion if vitest wraps the instance method
            return HTMLDocument.prototype.createElement.call(document, tagName);
        });

        visualizer = new UnifiedVisualizer('viz-container');
        visualizer.resize({ width: 800, height: 600 });
    });

    it('should initialize with a canvas and info layer', () => {
        const container = document.getElementById('viz-container');
        expect(container.contains(mockCanvas)).toBe(true);
        expect(visualizer.infoLayer).toBeDefined();
        expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
    });

    it('should correctly handle track additions', () => {
        visualizer.addTrack('bass', '#ff0000');
        expect(visualizer.tracks['bass']).toBeDefined();
        expect(visualizer.tracks['bass'].color).toBe('#ff0000');
        expect(visualizer.infoLayer.children.length).toBe(1);
    });

    it('should push notes into track history', () => {
        visualizer.addTrack('soloist', 'blue');
        const noteEvent = { time: 1.0, midi: 60, duration: 0.5, noteName: 'C', octave: 4 };
        visualizer.pushNote('soloist', noteEvent);
        
        expect(visualizer.tracks['soloist'].history.length).toBe(1);
        expect(visualizer.tracks['soloist'].label.textContent).toBe('C4');
    });

    it('should push chords into chord events', () => {
        const chordEvent = { time: 0, notes: [60, 64, 67], rootMidi: 60, intervals: [0, 4, 7] };
        visualizer.pushChord(chordEvent);
        
        expect(visualizer.chordEvents.length).toBe(1);
        expect(visualizer.chordEvents[0].notes).toEqual([60, 64, 67]);
    });

    it('should truncate notes correctly for monophonic rendering', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 0, midi: 36, duration: 1.0 });
        
        visualizer.truncateNotes('bass', 0.5);
        expect(visualizer.tracks['bass'].history[0].duration).toBe(0.5);
    });

    it('should execute draw calls during render', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 10, midi: 36, duration: 1.0 });
        visualizer.setBeatReference(0);
        
        // Mock getComputedStyle for theme colors
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: vi.fn().mockReturnValue('#000000')
        });

        visualizer.render(10.5, 120, 4);

        // Verify background was drawn
        expect(mockCtx.fillRect).toHaveBeenCalled();
        // Verify piano roll keys were drawn (startMidi to endMidi loop)
        expect(mockCtx.beginPath).toHaveBeenCalled();
        // Verify notes/tracks were processed
        expect(mockCtx.moveTo).toHaveBeenCalled();
        expect(mockCtx.lineTo).toHaveBeenCalled();
    });

    it('should clear all tracks and events on clear()', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 0, midi: 36 });
        visualizer.pushChord({ time: 0 });
        
        visualizer.clear();
        
        expect(visualizer.tracks['bass'].history.length).toBe(0);
        expect(visualizer.chordEvents.length).toBe(0);
        expect(mockCtx.clearRect).toHaveBeenCalled();
    });

    describe('Lifecycle', () => {
        it('should remove canvas and info layer on destroy', () => {
            // We can check if `mockCanvas` is removed from `document.body` (or container)
            // Container is 'viz-container'.
            const container = document.getElementById('viz-container');
            expect(container.contains(mockCanvas)).toBe(true);

            visualizer.destroy();

            expect(container.contains(mockCanvas)).toBe(false);
            expect(container.querySelector('div')).toBeNull(); // Info layer should be gone
        });

        it('should disconnect ResizeObserver on destroy', () => {
            const disconnectSpy = vi.spyOn(visualizer.resizeObserver, 'disconnect');
            visualizer.destroy();
            expect(disconnectSpy).toHaveBeenCalled();
        });
    });
});
