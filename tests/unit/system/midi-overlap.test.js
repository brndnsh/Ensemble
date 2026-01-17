import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMIDINote, sendMIDIDrum, initMIDI } from '../../../public/midi-controller.js';
import { ctx, midi } from '../../../public/state.js';

describe('MIDI Note Overlap Logic', () => {
    let mockOutput;
    let sentMessages = [];

    beforeEach(() => {
        vi.useFakeTimers();
        sentMessages = [];
        
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

    it('should cancel pending Note Off when a new Note On for the same pitch occurs', async () => {
        const channel = 1;
        const note = 60; // C4
        const velocity = 100; // 0.8 internal
        const time = 1000; // Immediate
        const duration = 1.0; // 1 second

        // 1. Send first note
        // Expected: Note On sent immediately. Note Off scheduled for T+1.
        sendMIDINote(channel, note, 0.8, time, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);
        expect(mockOutput.send.mock.calls[0][0][0]).toBe(0x90); // Note On

        // 2. Advance time to 1000.5 (0.5s elapsed)
        ctx.audio.currentTime = 1000.5;
        vi.advanceTimersByTime(500);

        // Note Off shouldn't have fired yet
        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // 3. Send second note (Overlap!)
        // This should CANCEL the previous Note Off (which was due at 1001.0)
        // And schedule a new Note Off for 1000.5 + 1.0 = 1001.5
        sendMIDINote(channel, note, 0.8, 1000.5, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(2); // New Note On
        expect(mockOutput.send.mock.calls[1][0][0]).toBe(0x90);

        // 4. Advance time to 1001.1 (Past the first note's original end time)
        ctx.audio.currentTime = 1001.1;
        vi.advanceTimersByTime(600); // 500 + 600 = 1100 total advancement

        // We expect NO Note Off yet, because it was cancelled.
        // If it wasn't cancelled, we'd see a Note Off at T=1001.0
        // Messages are: [On @ 1000, On @ 1000.5]
        expect(mockOutput.send).toHaveBeenCalledTimes(2);

        // 5. Advance time to 1001.6 (Past second note's end time)
        ctx.audio.currentTime = 1001.6;
        vi.advanceTimersByTime(500);

        // Now we expect Note Off
        expect(mockOutput.send).toHaveBeenCalledTimes(3);
        expect(mockOutput.send.mock.calls[2][0][0]).toBe(0x80); // Note Off
        
        // Verify only ONE Note Off was sent total
        const offMessages = sentMessages.filter(m => (m.data[0] & 0xF0) === 0x80);
        expect(offMessages.length).toBe(1);
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
});
