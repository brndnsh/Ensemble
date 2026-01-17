import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMIDINote, sendMIDIDrum, initMIDI, panic } from '../../../public/midi-controller.js';
import { ctx, midi } from '../../../public/state.js';

describe('MIDI Note Overlap Logic', () => {
    let mockOutput;
    let sentMessages = [];

    beforeEach(() => {
        vi.useFakeTimers();
        sentMessages = [];
        
        // Clear module state from previous tests
        panic();
        
        // Mock Audio Context
        ctx.audio = { currentTime: 1000 }; // Start at T=1000s

        // Mock MIDI Output
        mockOutput = {
            send: vi.fn((data, timestamp) => {
                sentMessages.push({ data, timestamp });
            })
        };

        // Mock MIDI Access
        const mockMidiAccess = {
            outputs: new Map([['mock-id', mockOutput]]),
            onstatechange: null
        };
        
        // Stub navigator
        vi.stubGlobal('navigator', {
            requestMIDIAccess: () => Promise.resolve(mockMidiAccess)
        });

        // Enable MIDI in state
        midi.enabled = true;
        midi.selectedOutputId = 'mock-id';
        midi.latency = 0;
        
        // Initialize
        return initMIDI();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        midi.enabled = false;
    });

    it('should truncate previous note if new note overlaps, ensuring Off occurs before new On', async () => {
        const channel = 1;
        const note = 60; 
        const duration = 1.0; 

        // 1. Send Note 1 at T=1000. Ends at T=1001 (approx).
        sendMIDINote(channel, note, 0.8, 1000, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);
        expect(mockOutput.send.mock.calls[0][0][0]).toBe(0x90);

        // 2. Send Note 2 at T=1000.5 (Overlap!)
        // This should force Note 1 to end IMMEDIATELY (synchronously)
        sendMIDINote(channel, note, 0.8, 1000.5, duration);

        // Expect 3 calls: On 1, Off 1 (truncated), On 2
        expect(mockOutput.send).toHaveBeenCalledTimes(3); 

        const calls = mockOutput.send.mock.calls;
        const msg1 = calls[0]; // On 1
        const msg2 = calls[1]; // Off 1 (Truncated)
        const msg3 = calls[2]; // On 2

        expect(msg1[0][0] & 0xF0).toBe(0x90);
        expect(msg2[0][0] & 0xF0).toBe(0x80); // Note Off
        expect(msg3[0][0] & 0xF0).toBe(0x90); // Note On

        // Verify Off 1 timestamp is before or equal to On 2 timestamp
        // msg2 timestamp: cutoffTime (1000.495)
        // msg3 timestamp: time (1000.5)
        // Note: mockOutput receives MIDI timestamp (ms), not AudioContext time.
        // But relative order should hold.
        expect(msg2[1]).toBeLessThan(msg3[1]);
    });

    it('should send Note Off correctly if no overlap occurs', () => {
        const channel = 1;
        const note = 60;
        const duration = 0.5;

        sendMIDINote(channel, note, 0.8, 1000, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // Advance past duration
        ctx.audio.currentTime = 1000.6;
        vi.advanceTimersByTime(600);

        expect(mockOutput.send).toHaveBeenCalledTimes(2);
        expect(mockOutput.send.mock.calls[1][0][0]).toBe(0x80);
    });

    it('should correctly map drum names to notes using sendMIDIDrum', () => {
        // DRUM_MAP: Kick -> 36
        // default drumsChannel -> 10 (0x99 for Note On)
        midi.drumsChannel = 10;
        
        sendMIDIDrum('Kick', 1000, 0.8);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);
        const [status, note, velocity] = mockOutput.send.mock.calls[0][0];
        
        expect(status).toBe(0x99); // Channel 10 Note On
        expect(note).toBe(36);     // Kick
    });

    it('should send explicit Note Offs for all active notes when panic() is called', () => {
        // 1. Start a few notes
        sendMIDINote(1, 60, 0.8, 1000, 2.0);
        sendMIDINote(2, 62, 0.8, 1000, 2.0);
        
        expect(mockOutput.send).toHaveBeenCalledTimes(2);
        
        // 2. Call panic
        panic();
        
        // 3. Verify explicit Note Offs were sent
        // Note 60 on Ch 1 -> 0x80, 60, 0
        // Note 62 on Ch 2 -> 0x81, 62, 0
        const messages = mockOutput.send.mock.calls.map(c => c[0]);
        
        expect(messages).toContainEqual([0x80, 60, 0]);
        expect(messages).toContainEqual([0x81, 62, 0]);
        
        // Also check global panic CCs (Ch 1-16)
        expect(messages).toContainEqual([0xB0, 123, 0]);
        expect(messages).toContainEqual([0xBF, 123, 0]);
    });
});
