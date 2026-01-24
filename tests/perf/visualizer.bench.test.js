// @vitest-environment happy-dom
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Performance', () => {
  let visualizer;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'viz-container';
    document.body.appendChild(container);

    // Mock canvas context
    const mockCtx = {
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
    };

    // Mock getContext
    HTMLCanvasElement.prototype.getContext = () => mockCtx;

    // Mock ResizeObserver
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    visualizer = new UnifiedVisualizer('viz-container');
    // Set dimensions manually since ResizeObserver is mocked
    visualizer.resize({ width: 800, height: 600 });
  });

  afterEach(() => {
    visualizer.destroy();
    document.body.removeChild(container);
  });

  it('measures render loop performance', () => {
    // Add some data to make render do work
    visualizer.addTrack('bass', 'var(--blue)');
    visualizer.pushNote('bass', { time: 0, duration: 1, midi: 60 });
    visualizer.pushChord({ time: 0, duration: 1, rootMidi: 60, notes: [60, 64, 67] });

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
        visualizer.render(0.5, 120); // Render at fixed time to hit active notes
    }

    const end = performance.now();
    const duration = end - start;

    console.log(`Render loop (${iterations} iterations) took ${duration.toFixed(2)}ms`);
    console.log(`Average per frame: ${(duration / iterations).toFixed(4)}ms`);
  });
});
