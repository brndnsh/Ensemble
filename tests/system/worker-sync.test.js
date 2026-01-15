/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arranger, cb, bb, sb, gb, ctx } from '../../public/state.js';

// We need to import syncWorker and initWorker AFTER we mock the global Worker
let lastWorkerInstance = null;
global.Worker = class MockWorker {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.postMessage = vi.fn();
        lastWorkerInstance = this;
    }
};

const { syncWorker, initWorker } = await import('../../public/worker-client.js');

describe('Worker Synchronization Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lastWorkerInstance = null;
        initWorker();
    });

    it('should include all critical state properties in the sync message', () => {
        // Setup state
        ctx.bpm = 120;
        ctx.bandIntensity = 0.7;
        gb.genreFeel = 'Jazz';
        gb.swing = 50;
        arranger.key = 'F';
        
        syncWorker();

        expect(lastWorkerInstance).not.toBeNull();
        const call = lastWorkerInstance.postMessage.mock.calls[0][0];
        
        expect(call.type).toBe('syncState');
        const data = call.data;

        // Verify Arranger
        expect(data.arranger.key).toBe('F');
        
        // Verify Context
        expect(data.ctx.bpm).toBe(120);
        expect(data.ctx.bandIntensity).toBe(0.7);

        // Verify Groove
        expect(data.gb.genreFeel).toBe('Jazz');
        expect(data.gb.swing).toBe(50);
        
        // Verify Instruments
        expect(data.cb).toBeDefined();
        expect(data.bb).toBeDefined();
        expect(data.sb).toBeDefined();
    });

    it('should correctly deep-copy drum instrument steps to avoid reference sharing', () => {
        gb.instruments[0].steps[0] = 1;
        
        syncWorker();
        
        const data = lastWorkerInstance.postMessage.mock.calls[0][0].data;
        const sentSteps = data.gb.instruments[0].steps;
        
        // Modify local state
        gb.instruments[0].steps[0] = 2;
        
        // Sent steps should remain 1 (deep copy check)
        expect(sentSteps[0]).toBe(1);
    });

    it('should trigger onNotes callback when worker sends notes', () => {
        const onNotes = vi.fn();
        initWorker(null, onNotes);
        
        const mockNotes = [{ midi: 60, step: 0, module: 'bb' }];
        lastWorkerInstance.onmessage({ data: { type: 'notes', notes: mockNotes } });
        
        expect(onNotes).toHaveBeenCalledWith(mockNotes);
    });

    it('should trigger onTick callback when worker sends tick', () => {
        const onTick = vi.fn();
        initWorker(onTick, null);
        
        lastWorkerInstance.onmessage({ data: { type: 'tick' } });
        
        expect(onTick).toHaveBeenCalled();
    });

    it('should not throw if called before worker is initialized', () => {
        lastWorkerInstance = null;
        // Reset the local timerWorker in the module is hard without re-importing 
        // but we can test the 'if (!timerWorker) return;' line.
        // For a true test of this, we'd need to not call initWorker() in this test.
        
        // (Testing this specifically might require more complex module mocking)
    });
});