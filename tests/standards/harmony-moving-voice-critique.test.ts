import { afterEach, describe, expect, it, vi } from 'vitest';
import * as inversions from '../../public/engine/chords-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import * as movingVoice from '../../public/engine/harmony-moving-voice.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { fillBuffers } from '../../public/engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from '../../public/engine/worker-orchestrator.js';
import { renderCurrentSessionToWav } from '../../public/export/audio-export.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import * as stateModule from '../../public/state.js';
import type { EnsembleState } from '../../public/types.js';
import { bootstrapEnsembleAudit } from '../../scripts/ensemble-analysis-utils.js';

const { scheduled } = vi.hoisted(() => ({ scheduled: vi.fn() }));
vi.mock('../../public/engine/engine.js', () => ({ initAudio: vi.fn() }));
vi.mock('../../public/engine/scheduler-core.js', () => ({ scheduleGlobalEvent: scheduled }));

async function scene(genre: string, meter = '4/4', value = 'C | Am | F | G | C | Am | F | G') {
    const boot = await bootstrapEnsembleAudit({
        genre,
        bpm: 100,
        intensity: 0.55,
        timeSignature: meter,
        seed: 'HARMONY_MOVING_VOICE',
        includeSoloist: false,
        includeChords: false,
        includeBass: false,
        includeDrums: false,
        harmonyStyle: 'smart',
        bassStyle: undefined,
        chordStyle: undefined,
        drumPreset: undefined,
        soloistStyle: undefined,
    });
    const detached = cloneStateForDetachedGeneration(boot.state);
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        harmony: { ...detached.harmony },
        groove: { ...detached.groove },
        soloist: { ...detached.soloist },
        chords: { ...detached.chords },
        bass: { ...detached.bass },
        playback: { ...detached.playback },
    };
    state.arranger.sections = [{ id: 'pad-verse', label: 'Verse', value, timeSignature: meter }];
    validateProgression(state);
    state.harmony.octave = 60;
    state.harmony.complexity = 0.55;
    state.groove.humanize = 0;
    return state;
}

function capture(initial: Awaited<ReturnType<typeof scene>>, baseline = false) {
    const state = cloneStateForDetachedGeneration(initial);
    resetHiddenGenerationMemory(state);
    const bypass = baseline
        ? vi.spyOn(movingVoice, 'getMovingPadVoicing').mockReturnValue(null)
        : null;
    const solver = vi.spyOn(inversions, 'getBestInversion');
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const emissions = [];
    try {
        for (let step = 0; step < state.arranger.totalSteps * 2; step++) {
            const result = generateNotesForStep(state, step, cursors, {}, null);
            const notes = result.notes.filter((note) => note.module === 'harmony');
            if (notes.length) {
                emissions.push({
                    step,
                    notes,
                    ordinary: solver.mock.results.at(-1)?.value as number[],
                    accompanimentMidis: result.coordination.accompanimentMidis,
                    bassMidi: result.coordination.bassMidi,
                });
            }
        }
        return emissions;
    } finally {
        bypass?.mockRestore();
        solver.mockRestore();
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scheduled.mockReset();
});

const pitches = (events: ReturnType<typeof capture>) =>
    events.map((event) => event.notes.map((note) => note.midi));
const changed = (event: ReturnType<typeof capture>[number]) =>
    event.notes.some((note) => !event.ordinary.includes(note.midi!));

describe('Smart pad moving-voice critique (#1146)', () => {
    it.each(
        ['Rock', 'Acoustic'].flatMap((genre) =>
            ['4/4', '3/4', '6/8', '12/8'].map((meter) => [genre, meter]),
        ),
    )('%s %s adds a bounded connection through the production output', async (genre, meter) => {
        const state = await scene(genre, meter);
        const before = capture(state, true);
        const after = capture(state);
        const interventions = after.filter(changed);
        console.log(
            `Harmony moving-voice critique: ${genre} ${meter}; ${interventions.length} changed onsets in four windows; target 1-2 per window, unchanged onset/voice count.`,
        );
        expect(after.map((event) => event.step)).toEqual(before.map((event) => event.step));
        expect(pitches(after)).not.toEqual(pitches(before));
        expect(after.map((event) => event.notes.length)).toEqual(
            before.map((event) => event.notes.length),
        );
        expect(
            after.map((event) =>
                event.notes.map(({ durationSteps, velocity }) => ({ durationSteps, velocity })),
            ),
        ).toEqual(
            before.map((event) =>
                event.notes.map(({ durationSteps, velocity }) => ({ durationSteps, velocity })),
            ),
        );
        // C->Am and Am->F cannot add the pilot while retaining a common tone
        // AND both chord thirds. F->G is the first eligible diatonic connection.
        for (let window = 0; window < 4; window++) {
            const pair = after.slice(window * 4 + 2, window * 4 + 4);
            const alteredBars = after
                .slice(window * 4, window * 4 + 4)
                .flatMap((event, bar) => (changed(event) ? [bar] : []));
            expect(alteredBars.length).toBeGreaterThan(0); // intent: a disconnected planner must fail
            expect(alteredBars.length).toBeLessThanOrEqual(2); // intent: two endpoints of ONE gesture
            expect(alteredBars.every((bar) => bar === 2 || bar === 3)).toBe(true);
            pair.forEach((event) =>
                expect(
                    event.notes.filter((note) => !event.ordinary.includes(note.midi!)).length,
                ).toBeLessThanOrEqual(1),
            ); // intent: change at most one voice of an ordinary voicing
            const source = pair[0].notes.map((note) => note.midi!);
            const target = pair[1].notes.map((note) => note.midi!);
            expect(
                source.some(
                    (midi, i) => Math.abs(midi - target[i]) > 0 && Math.abs(midi - target[i]) <= 2,
                ),
            ).toBe(true); // intent: an actual half/whole-step connection, not a repeated note
        }
        for (const event of after) {
            const chord = state.arranger.stepMap.find(
                (entry) =>
                    event.step % state.arranger.totalSteps >= entry.start &&
                    event.step % state.arranger.totalSteps < entry.end,
            )!.chord;
            const tones = [0, chord.isMinor ? 3 : 4, 7].map((iv) => (chord.rootMidi + iv) % 12);
            for (const note of event.notes) {
                expect(tones).toContain(note.midi! % 12);
                expect(note.midi).toBeGreaterThanOrEqual(52); // intent: harmony register floor
                expect(note.midi).toBeLessThanOrEqual(84); // intent: harmony register ceiling
                expect(note.freq).toBeCloseTo(440 * 2 ** ((note.midi! - 69) / 12), 3);
            }
        }
    });

    it('holds a shared voice while the other voice moves by a semitone', async () => {
        const state = await scene('Rock', '4/4', 'C | C#m | F | G');
        state.harmony.octave = 64;
        const result = capture(state);
        const from = result[0].notes.map((note) => note.midi!);
        const to = result[1].notes.map((note) => note.midi!);
        const common = from.filter((midi) => to.includes(midi));
        expect(common).toHaveLength(1);
        expect(result[1].notes.find((note) => note.midi === common[0])?.isLegato).toBe(true);
        expect(
            Math.abs(
                from.find((midi) => !common.includes(midi))! -
                    to.find((midi) => !common.includes(midi))!,
            ),
        ).toBe(1);
        expect(result.filter(changed).length).toBeGreaterThan(0);
    });

    it.each(['C | C | C | C', 'C | Am | C | Am', 'Csus4 | G7 | Dm7 | Cmaj7'])(
        'keeps ordinary sustained fallback for %s',
        async (value) => {
            const state = await scene('Acoustic', '4/4', value);
            const before = capture(state, true);
            const after = capture(state);
            expect(after).toEqual(before);
            expect(after).toHaveLength(8);
        },
    );

    it('leaves explicit styles, other genres, and high-intensity Rock on their ordinary paths', async () => {
        for (const genre of ['Rock', 'Acoustic', 'Country']) {
            const state = await scene(genre);
            if (genre !== 'Country') {
                state.harmony.style = 'strings';
            }
            expect(capture(state)).toEqual(capture(state, true));
        }
        const state = await scene('Rock');
        state.playback.bandIntensity = 0.82;
        expect(capture(state)).toEqual(capture(state, true));
    });

    it('does not increase the budget when the soloist is globally or section-muted', async () => {
        const state = await scene('Acoustic');
        const disabled = capture(state);
        state.soloist.enabled = true;
        state.arranger.sections[0].instruments = { soloist: false };
        expect(capture(state)).toEqual(disabled);
        state.arranger.sections[0].instruments = { soloist: false, harmony: false };
        expect(capture(state)).toHaveLength(0);
    });

    it.each(['Rock', 'Acoustic'])(
        '%s respects the active chord player and bass space',
        async (genre) => {
            const state = await scene(genre);
            state.chords.enabled = true;
            state.bass.enabled = true;
            const before = capture(state, true);
            const after = capture(state);
            if (genre === 'Acoustic') {
                expect(after.filter(changed).length).toBeGreaterThan(0); // intent: the existing two-voice crowding budget can still carry a connection
            }
            for (const event of after) {
                const pcs = new Set((event.accompanimentMidis || []).map((midi) => midi % 12));
                const overlaps = (midis: number[]) =>
                    midis.filter((midi) => pcs.has(midi % 12)).length;
                expect(overlaps(event.notes.map((note) => note.midi!))).toBeLessThanOrEqual(
                    overlaps(event.ordinary),
                ); // intent: no extra unison with a competing chord attack
                event.notes.forEach((note) =>
                    expect(note.midi).toBeGreaterThanOrEqual(
                        Math.max(52, (event.bassMidi || 0) + 7),
                    ),
                ); // intent: retain the existing fifth of bass separation
            }
            expect(after.map((event) => [event.step, event.notes.length])).toEqual(
                before.map((event) => [event.step, event.notes.length]),
            );
        },
    );

    it('replays fresh starts independently of ambient randomness and stale harmony memory', async () => {
        const state = await scene('Acoustic');
        vi.spyOn(Math, 'random').mockReturnValue(0.05);
        const first = capture(state);
        state.harmony.lastMidis = [80, 84];
        vi.mocked(Math.random).mockReturnValue(0.95);
        expect(capture(state)).toEqual(first);
    });

    it('uses actual chord boundaries within bars and does not spend a second gesture later in the window', async () => {
        const state = await scene('Acoustic', '6/8', 'F G F G | F G | F G | F G');
        const result = capture(state);
        const firstWindow = result.filter((event) => event.step < state.arranger.totalSteps);
        const interventions = firstWindow.filter(changed);
        expect(interventions.length).toBeGreaterThan(0);
        const firstPairSteps = state.arranger.stepMap.slice(0, 2).map((entry) => entry.start);
        expect(interventions.length).toBeLessThanOrEqual(2); // intent: at most the two endpoints of one connection
        expect(interventions.every((event) => firstPairSteps.includes(event.step))).toBe(true);
        // Four chord onsets in the first bar provide THREE eligible boundaries;
        // staying inside that bar alone would not prove the one-gesture budget.
        expect(state.arranger.stepMap.filter((entry) => entry.start < 12)).toHaveLength(4);
        expect(result.map((event) => event.step)).toEqual(
            capture(state, true).map((event) => event.step),
        );
    });

    it('repeats the same section-relative plan through the live practice buffer at a nonzero chart offset', async () => {
        const state = await scene('Acoustic');
        state.arranger.sections.unshift({
            id: 'lead-in',
            label: 'Lead-in',
            value: 'C | C | C',
            timeSignature: '3/4',
        });
        validateProgression(state);
        const section = state.arranger.sectionMap[1];
        state.playback.loopStartStep = section.start;
        state.playback.loopEndStep = section.end;
        const width = section.end - section.start;
        resetHiddenGenerationMemory(state);
        resetWorkerContext(section.start);
        const post = vi.fn();
        vi.stubGlobal('postMessage', post);
        const previousLookahead = workerContext.LOOKAHEAD;
        try {
            workerContext.LOOKAHEAD = width * 2;
            fillBuffers(state, section.start);
        } finally {
            workerContext.LOOKAHEAD = previousLookahead;
            resetWorkerContext(0);
        }
        const notes = post.mock.calls
            .flatMap(([message]) => message.notes || [])
            .filter((note) => note.module === 'harmony');
        const first = notes
            .filter((note) => note.step < section.end)
            .map(({ step, midi }) => ({ step: step - section.start, midi }));
        const second = notes
            .filter((note) => note.step >= section.end)
            .map(({ step, midi }) => ({ step: step - section.end, midi }));
        expect(first.length).toBeGreaterThan(0);
        expect(second).toEqual(first);
        expect(first.find((note) => note.step === 48 && note.midi === 62)).toBeDefined();
    });

    it('delivers the same pitches through live buffers, MIDI events, and the WAV scheduling seam', async () => {
        const initial = await scene('Acoustic');
        const expected = capture(initial)
            .filter((event) => event.step < initial.arranger.totalSteps)
            .flatMap((event) => event.notes.map((note) => ({ step: event.step, midi: note.midi })));
        const midiState = cloneStateForDetachedGeneration(initial);
        const processor = new ExportProcessor(midiState, {
            includedTracks: ['harmonies'],
            loopMode: 'once',
        });
        const midi = [];
        try {
            for (let step = 0; step < initial.arranger.totalSteps; step++) {
                const before = processor.harmonyTrack.events.length;
                processor.processStep(step);
                midi.push(
                    ...processor.harmonyTrack.events
                        .slice(before)
                        .filter((event) => (event.data[0] & 0xf0) === 0x90)
                        .map((event) => ({ step, midi: event.data[1] })),
                );
            }
        } finally {
            processor.cleanup();
        }
        expect(midi).toEqual(expected);

        const wav: { step: number; midi: number }[] = [];
        scheduled.mockImplementation((state: EnsembleState, step: number) => {
            wav.push(
                ...(state.harmony.buffer.get(step) || []).map((note: { midi: number }) => ({
                    step,
                    midi: note.midi,
                })),
            );
        });
        vi.spyOn(stateModule, 'getState').mockReturnValue(initial);
        vi.stubGlobal(
            'OfflineAudioContext',
            class {
                channels: number;
                length: number;
                sampleRate: number;
                constructor(channels: number, length: number, sampleRate: number) {
                    this.channels = channels;
                    this.length = length;
                    this.sampleRate = sampleRate;
                }
                async startRendering() {
                    return {
                        numberOfChannels: this.channels,
                        sampleRate: this.sampleRate,
                        getChannelData: () => new Float32Array(this.length),
                    };
                }
            },
        );
        await renderCurrentSessionToWav({ loops: 1, sampleRate: 100 });
        expect(wav).toEqual(expected);
    });
});
