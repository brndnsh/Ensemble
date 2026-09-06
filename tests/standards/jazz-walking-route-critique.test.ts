import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive, resetBassState } from '../../public/engine/bass-engine.js';
import * as walking from '../../public/engine/bass-walking-route.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { getState } from '../../public/state.js';
import type { EnsembleState } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

function scene(value: string, genre = 'Jazz', meter = '4/4', seed = 'WALKING') {
    const initial = cloneStateForDetachedGeneration(getState());
    const state = {
        ...initial,
        arranger: {
            ...initial.arranger,
            seed,
            timeSignature: meter,
            sections: [{ id: 'walk', label: 'Verse', value, key: 'C', timeSignature: meter }],
        },
        bass: { ...initial.bass, enabled: true, style: 'quarter', octave: 38 },
        playback: { ...initial.playback, bpm: 138, bandIntensity: 0.9, complexity: 0.9 },
        groove: { ...initial.groove, genreFeel: genre },
        soloist: { ...initial.soloist, enabled: false },
    };
    validateProgression(state);
    return state;
}

function play(state: EnsembleState, loops = 2, context = {}) {
    resetBassState(state);
    let previous: number | null = null;
    const events: Array<{
        step: number;
        midi: number;
        freq: number;
        velocity: number;
        duration: number;
        timing: number;
        muted: number;
        bend: number;
    }> = [];
    for (let absolute = 0; absolute <= state.arranger.totalSteps * loops; absolute++) {
        const step = foldPracticeStep(absolute, state.playback);
        const current = getChordAtStep(step, state.arranger, { index: 0, sectionIndex: 0 });
        if (!current) {
            throw new Error('Fixture has no current chord');
        }
        const info = getStepInfo(
            step % state.arranger.totalSteps,
            TIME_SIGNATURES['4/4'],
            state.arranger.measureMap,
            TIME_SIGNATURES,
        );
        if (!isBassActive(state, state.bass.style, step, current.stepInChord, info)) {
            continue;
        }
        // Production supplies only one beat of lookahead. The new route must
        // discover the destination before beat four without changing that API.
        const next = getChordAtStep(step + 4, state.arranger, { index: 0, sectionIndex: 0 });
        const note = getBassNote(
            state,
            current.chord,
            next?.chord,
            current.stepInChord / 4,
            previous,
            state.bass.octave,
            state.bass.style,
            current.chordIndex,
            step,
            current.stepInChord,
            { sectionStart: current.sectionStart, ...context },
            info,
        );
        if (!note) {
            continue;
        }
        previous = note.freq;
        events.push({
            step: absolute,
            midi: note.midi,
            freq: note.freq,
            velocity: note.velocity,
            duration: note.durationSteps,
            timing: note.timingOffset,
            muted: note.muted,
            bend: note.bendStartInterval,
        });
    }
    return events;
}

afterEach(() => vi.restoreAllMocks());

describe('Jazz walking route critique — supportive contour and dependable arrivals', () => {
    it('walks into actual roots/slash bass with restrained contour across keys and seeds', () => {
        const charts = [
            'Dm7 | G7 | Cmaj7 | Cmaj7',
            'Cm7 | F7 | Bbmaj7 | Ebmaj7',
            'F#m7 | B7 | Emaj7 | Amaj7',
            'Cmaj7 | Edim7 | Dm7 | Db7',
            'Cmaj7/E | Fmaj7/A | Dm7/F | G7/B',
            'Am7 | D7 | Gmaj7 | Cmaj7',
        ];
        let transitions = 0;
        let steps = 0;
        let routes = 0;
        let restrained = 0;
        let chromatic = 0;
        let changes = 0;
        const shapes = new Set<string>();
        for (const chart of charts) {
            for (let seed = 0; seed < 12; seed++) {
                const state = scene(chart, 'Jazz', '4/4', `walking-${seed}`);
                const events = play(state);
                const byStep = new Map(events.map((note) => [note.step, note]));
                for (const note of events) {
                    expect(note.midi).toBeGreaterThanOrEqual(28); // intent: ordinary bass register
                    expect(note.midi).toBeLessThanOrEqual(51); // intent: leave the upper register free
                    expect(note.freq).toBeCloseTo(440 * 2 ** ((note.midi - 69) / 12));
                }
                for (let bar = 0; bar < state.arranger.totalSteps * 2; bar += 16) {
                    const line = [0, 4, 8, 12, 16].map((offset) => {
                        const note = byStep.get(bar + offset);
                        expect(note, 'walking quarter pulse must remain present').toBeDefined();
                        return note!.midi;
                    });
                    const destination = getChordAtStep(bar + 16, state.arranger)!.chord;
                    expect(line[4] % 12).toBe((destination.bassMidi ?? destination.rootMidi) % 12);
                    const deltas = line.slice(1).map((note, index) => note - line[index]);
                    for (const delta of deltas) {
                        transitions++;
                        if (Math.abs(delta) > 0 && Math.abs(delta) <= 2) {
                            steps++;
                        }
                        expect(Math.abs(delta)).toBeLessThanOrEqual(7); // intent: no leap beyond a fifth
                    }
                    const directions = deltas.filter(Boolean).map(Math.sign);
                    const turns = directions.slice(1).filter((d, i) => d !== directions[i]).length;
                    routes++;
                    if (turns <= 1) {
                        restrained++;
                    }
                    shapes.add(deltas.join(','));
                    // Measure the emitted final attack, not the planner's own
                    // approachTarget metadata or just pitch-class proximity.
                    const last = byStep.get(bar + 14) ?? byStep.get(bar + 12)!;
                    expect(Math.abs(last.midi - line[4])).toBeLessThanOrEqual(2);
                    if (line[0] % 12 !== line[4] % 12) {
                        changes++;
                        if (Math.abs(last.midi - line[4]) === 1) {
                            chromatic++;
                        }
                    }
                }
            }
        }
        console.log('Jazz walking route critique', {
            routes,
            stepwise: steps / transitions,
            restrained: restrained / routes,
            chromaticArrival: chromatic / changes,
            distinctContours: shapes.size,
        });
        expect(steps / transitions).toBeGreaterThan(0.5); // intent: walking is predominantly by step
        expect(restrained / routes).toBeGreaterThanOrEqual(0.8); // intent: at most one turn in most bars
        expect(chromatic / changes).toBeGreaterThan(0.5); // intent: preserve Jazz's chromatic approach majority
        expect(shapes.size).toBeGreaterThan(3); // intent: neither one memorized lick nor one contour per vocabulary
    });

    it('preserves every attack, duration and dynamic while changing the pitch route', () => {
        const state = scene('Dm7 | G7 | Cmaj7 | Cmaj7');
        const planned = play(state);
        const bypass = vi.spyOn(walking, 'getJazzWalkingPitch').mockReturnValue(null);
        const original = play(state);
        bypass.mockRestore();
        const rhythm = (events: ReturnType<typeof play>) =>
            events.map(({ midi: _midi, freq: _freq, bend: _bend, ...event }) => event);
        expect(rhythm(planned)).toEqual(rhythm(original));
        expect(planned.map((note) => note.midi)).not.toEqual(original.map((note) => note.midi));
    });

    it('replays independently of ambient randomness and prior pitch history', () => {
        const state = scene('Dm7 | G7 | Cmaj7 | Cmaj7');
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.05);
        const first = play(state);
        random.mockReturnValue(0.95);
        expect(play(state)).toEqual(first);
        expect(random).not.toHaveBeenCalled();
        const chord = state.arranger.stepMap[0].chord;
        const info = getStepInfo(
            8,
            TIME_SIGNATURES['4/4'],
            state.arranger.measureMap,
            TIME_SIGNATURES,
        );
        const emit = (previous: number) =>
            getBassNote(state, chord, chord, 2, previous, 38, 'quarter', 0, 8, 8, {}, info).midi;
        expect(emit(55)).toBe(emit(220));
    });

    it('approaches the practice-loop restart, including later passes', () => {
        const state = scene('Dm7 | G7 | Cmaj7 | Fmaj7');
        state.playback.loopStartStep = 16;
        state.playback.loopEndStep = 48;
        const notes = play(state, 3);
        for (const boundary of [48, 80, 112, 144, 176]) {
            const arrival = notes.find((note) => note.step === boundary)!;
            const approach = notes.filter((note) => note.step < boundary).at(-1)!;
            expect(arrival.midi % 12).toBe(7); // intent: restart on G, never the chart's following F
            expect(Math.abs(approach.midi - arrival.midi)).toBeLessThanOrEqual(2);
        }
    });

    it('sees in-place harmonic edits and does not depend on the comp voicing', () => {
        const state = scene('Cmaj7 | G7');
        const first = play(state);
        const destination = state.arranger.stepMap[1].chord;
        destination.bassMidi = 47; // G/B rather than G: same root, different bass destination
        const edited = play(state);
        expect(edited.find((note) => note.step === 16)!.midi % 12).toBe(11);
        expect(edited.filter((note) => note.step < 16).map((note) => note.midi)).not.toEqual(
            first.filter((note) => note.step < 16).map((note) => note.midi),
        );
        for (const entry of state.arranger.stepMap) {
            entry.chord.intervals = [4, 10, 14];
        }
        expect(play(state).map((note) => note.midi)).toEqual(edited.map((note) => note.midi));
    });

    it.each([
        ['Rock', 'quarter', '4/4', 'C | G'],
        ['Blues', 'quarter', '4/4', 'C7 | F7'],
        ['Jazz', 'bossa', '4/4', 'Dm7 | G7'],
        ['Jazz', 'quarter', '6/8', 'Dm7 | G7'],
        ['Jazz', 'quarter', '3/4', 'Dm7 | G7'],
        ['Jazz', 'quarter', '4/4', 'Dm7 G7 | Cmaj7 Am7'],
    ])('leaves %s / %s / %s / %s unchanged', (genre, style, meter, chart) => {
        const state = scene(chart, genre, meter);
        state.bass.style = style;
        const before = play(state);
        vi.spyOn(walking, 'getJazzWalkingPitch').mockReturnValue(null);
        expect(play(state)).toEqual(before);
        expect(before.length).toBeGreaterThan(0);
    });

    it('leaves chords held across multiple bars unchanged', () => {
        const state = scene('Cmaj7 | Cmaj7 | G7 | G7');
        state.arranger.stepMap = [state.arranger.stepMap[0], state.arranger.stepMap[2]].map(
            (entry) => ({ ...entry, end: entry.start + 32, chord: { ...entry.chord, beats: 8 } }),
        );
        const before = play(state);
        vi.spyOn(walking, 'getJazzWalkingPitch').mockReturnValue(null);
        expect(play(state)).toEqual(before);
        expect(before.length).toBeGreaterThan(0);
    });

    it('leaves the final cadence in charge', () => {
        const state = scene('Dm7 | G7 | Cmaj7 | Cmaj7');
        const context = { stepCoordination: { isFinalMeasure: true } };
        const before = play(state, 1, context);
        vi.spyOn(walking, 'getJazzWalkingPitch').mockReturnValue(null);
        expect(play(state, 1, context)).toEqual(before);
        expect(before.every((note) => note.step % 16 === 0)).toBe(true);
    });

    it.each(['maj7', 'm7', '7alt', 'halfdim', 'dim7', 'sus2'])(
        'can connect every root pair for %s at low, middle and high register anchors',
        (quality) => {
            const state = scene('Cmaj7 | G7');
            const chord = state.arranger.stepMap[0].chord;
            const destination = state.arranger.stepMap[1].chord;
            chord.quality = quality;
            for (const center of [28, 38, 51]) {
                for (let root = 0; root < 12; root++) {
                    chord.rootMidi = 36 + root;
                    for (let next = 0; next < 12; next++) {
                        destination.rootMidi = 36 + next;
                        for (const step of [4, 8, 12]) {
                            const pitch = walking.getJazzWalkingPitch(
                                state,
                                chord,
                                'quarter',
                                step,
                                step,
                                center,
                                undefined,
                            );
                            expect(
                                pitch,
                                `${quality}: ${root} into ${next}, center ${center}, step ${step}`,
                            ).not.toBeNull();
                        }
                    }
                }
            }
        },
    );

    it('keeps bass-owned soloist responses out of the route planner', () => {
        const state = scene('Dm7 | G7 | Cmaj7 | Cmaj7');
        const planner = vi.spyOn(walking, 'getJazzWalkingPitch');
        const notes = play(state, 1, { stepCoordination: { soloistQaResponseOwner: 'bass' } });
        expect(notes.length).toBeGreaterThan(0);
        expect(planner).not.toHaveBeenCalled();
    });

    it('preserves the planned octave through real tick processing for every output sink (JWR-001)', () => {
        const state = scene('Ebmaj7 | Emaj7', 'Jazz', '4/4', 'probe-1');
        state.bass.octave = 28;
        const authored = play(state, 1);
        resetBassState(state);
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
        const carryover = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
        const emitted = [];
        for (let step = 0; step <= state.arranger.totalSteps; step++) {
            const tick = generateNotesForStep(
                state,
                step,
                cursors,
                {
                    includeBass: true,
                    includeChords: false,
                    includeDrums: false,
                    includeSoloist: false,
                    includeHarmony: false,
                    noLiveConductor: true,
                },
                carryover,
            );
            for (const note of tick.notes.filter((note) => note.module === 'bass')) {
                expect(note.freq).toBeCloseTo(440 * 2 ** ((note.midi! - 69) / 12));
                expect(note).not.toHaveProperty('pitchPlanned'); // internal choice never becomes protocol state
                emitted.push({ step, midi: note.midi });
            }
        }
        expect(emitted).toEqual(authored.map(({ step, midi }) => ({ step, midi })));
        const approach = emitted.filter((note) => note.step < 16).at(-1)!;
        const arrival = emitted.find((note) => note.step === 16)!;
        expect(Math.abs(approach.midi! - arrival.midi!)).toBe(1); // intent: actual semitone, not pitch-class proximity
    });
});
