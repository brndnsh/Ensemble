/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Lifecycle', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'unifiedVizContainer';
        document.body.appendChild(container);

        // Mock ResizeObserver
        global.ResizeObserver = class ResizeObserver {
            constructor(callback) {
                this.callback = callback;
                this.disconnect = vi.fn();
                this.observe = vi.fn();
                this.unobserve = vi.fn();
            }
        };
    });

    afterEach(() => {
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    it('should remove canvas and info layer on destroy', () => {
        const viz = new UnifiedVisualizer('unifiedVizContainer');
        
        // Verify initial state
        expect(container.querySelector('canvas')).toBeTruthy();
        expect(container.querySelector('div')).toBeTruthy(); // Info layer

        viz.destroy();

        // Verify cleanup
        expect(container.querySelector('canvas')).toBeNull();
        expect(container.querySelector('div')).toBeNull();
    });

    it('should disconnect ResizeObserver on destroy', () => {
        const viz = new UnifiedVisualizer('unifiedVizContainer');
        const disconnectSpy = vi.spyOn(viz.resizeObserver, 'disconnect');

        viz.destroy();

        expect(disconnectSpy).toHaveBeenCalled();
        expect(viz.resizeObserver).toBeNull();
    });
});
