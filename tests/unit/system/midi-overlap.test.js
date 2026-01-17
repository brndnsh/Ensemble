import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMIDINote, sendMIDIDrum, initMIDI, panic } from '../../../public/midi-controller.js';
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

    it('should NOT cancel pending Note Off for repeated notes, ensuring distinct re-attacks', async () => {
        const channel = 1;
        const note = 60; // C4
        const velocity = 100; // 0.8 internal
        const time = 1000; // Immediate
        const duration = 0.5; // 0.5 second

        // 1. Send first note
        sendMIDINote(channel, note, 0.8, time, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);
        expect(mockOutput.send.mock.calls[0][0][0]).toBe(0x90); // Note On

        // 2. Advance time to 1000.4 (0.4s elapsed)
        // Note 1 should still be playing (Ends at 1000 + 0.5 - 0.015 = 1000.485)
        ctx.audio.currentTime = 1000.4;
        vi.advanceTimersByTime(400);

        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // 3. Send second note (Abutting/Overlapping)
        // This simulates a fast bass line or retrigger
        sendMIDINote(channel, note, 0.8, 1000.5, duration);

        expect(mockOutput.send).toHaveBeenCalledTimes(2); // New Note On
        expect(mockOutput.send.mock.calls[1][0][0]).toBe(0x90);

        // 4. Advance time to 1000.6
        // Note 1 Off should have fired at ~1000.485
        ctx.audio.currentTime = 1000.6;
        vi.advanceTimersByTime(200); 

        // We expect Note Off for Note 1 to have fired!
        // Because we removed the cancellation logic.
        expect(mockOutput.send).toHaveBeenCalledTimes(3);
        expect(mockOutput.send.mock.calls[2][0][0]).toBe(0x80); // Note Off for Note 1

        // 5. Advance time to 1001.1 (Past second note's end)
        ctx.audio.currentTime = 1001.1;
        vi.advanceTimersByTime(500);

        // Note Off for Note 2
        expect(mockOutput.send).toHaveBeenCalledTimes(4);
        expect(mockOutput.send.mock.calls[3][0][0]).toBe(0x80);
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
