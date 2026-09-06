import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { generateDrumFills } from '../../public/engine/drum-seeder.js';
import { runDrumTick } from '../../public/engine/drums-tick.js';
import * as fills from '../../public/engine/fills.js';
import { createPRNG } from '../../public/engine/hash-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { getEffectiveTimeSignature } from '../../public/meter.js';
import { dispatch, getState } from '../../public/state.js';
import type { ArrangerState, EnsembleState, Mutable } from '../../public/types.js';
import { ACTIONS } from '../../public/types.js';

afterEach(() => vi.restoreAllMocks());

function arrangement(meter: string): Mutable<ArrangerState> {
    const ts = TIME_SIGNATURES[meter];
    const bar = ts.beats * ts.stepsPerBeat;
    return {
        timeSignature: meter,
        sectionMap: ['Verse', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'].map(
            (label, index) => ({
                id: `section-${index}`,
                label,
                start: index * 4 * bar,
                end: (index + 1) * 4 * bar,
                timeSignature: meter,
            }),
        ),
    } as unknown as Mutable<ArrangerState>;
}

function scene(genre: string, meter: string, barsPerSection = 32) {
    dispatch(ACTIONS.RESET_STATE);
    const detached = cloneStateForDetachedGeneration(getState());
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        groove: { ...detached.groove },
        playback: { ...detached.playback },
        soloist: { ...detached.soloist },
    };
    state.arranger.timeSignature = meter;
    state.arranger.seed = 'COMPOUND_PRACTICE';
    state.arranger.sections = ['Verse', 'Chorus'].map((label, index) => ({
        id: `section-${index}`,
        label,
        value: Array.from({ length: barsPerSection }, () => (index ? 'G' : 'C')).join(' | '),
        key: 'C',
        timeSignature: meter,
    }));
    state.groove.enabled = true;
    state.groove.genreFeel = genre;
    state.groove.sectionSeedMap = { 'section-0': 0.3, 'section-1': 0.7 };
    state.groove.humanize = 0;
    state.playback.bandIntensity = 0.7;
    state.playback.autoIntensity = false;
    state.soloist.enabled = false;
    validateProgression(state);
    return state;
}

function assertPulseGroups(
    fill: ReturnType<typeof fills.generateDeterministicFill>,
    pulses: number[],
) {
    const steps = Object.keys(fill).map(Number);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
        expect(Number.isInteger(step)).toBe(true);
        expect(step).toBeGreaterThanOrEqual(pulses[0]);
        expect(step).toBeLessThan(pulses.at(-1)! + 6);
        expect(step % 2).toBe(0); // intent: three eighth subdivisions, no 4/4 roll.
        expect(fill[step]).toHaveLength(1);
        expect(fill[step][0].vel).toBeGreaterThan(0);
        expect(fill[step][0].vel).toBeLessThanOrEqual(1);
        expect(fill[step][0].name).not.toBe('Crash');
    }
    for (const pulse of pulses) {
        expect(fill[pulse], `audible anchor at pulse ${pulse}`).toBeDefined();
        const continuation = steps.filter((step) => step > pulse && step < pulse + 6);
        expect(continuation.length).toBeGreaterThan(0);
        for (const step of continuation) {
            // intent: the large pulse outranks its continuation by at least 20%.
            expect(fill[pulse][0].vel / fill[step][0].vel).toBeGreaterThanOrEqual(1.2);
        }
    }
}

describe('Compound fill pulse pilot (#1137)', () => {
    it('preserves matching 4/4 fill fixtures', () => {
        // Captured on main before #1137. Exact equality belongs here because
        // compatibility, not musical quality, is the claim of this fixture.
        const trace = Object.keys(fills.FILL_TEMPLATES).flatMap((genre) =>
            [0.2, 0.6, 0.9].flatMap((intensity) =>
                Array.from({ length: 16 }, (_, seed) =>
                    generateDrumFills(
                        {} as EnsembleState,
                        arrangement('4/4'),
                        genre,
                        intensity,
                        `COMPOUND_FILL_${seed}`,
                    ),
                ),
            ),
        );
        expect(createHash('sha256').update(JSON.stringify(trace)).digest('hex')).toBe(
            'af256eff6982114f6a779e07aaed0a6bfbbb29db8bb756015a270d58f0ebe23b',
        );
    });

    for (const genre of ['Rock', 'Blues']) {
        for (const meter of ['6/8', '12/8']) {
            const ts = TIME_SIGNATURES[meter];
            const bar = ts.beats * ts.stepsPerBeat;
            it(`${genre} ${meter}: grouped, bounded, reproducible gestures across energy and seeds`, () => {
                const colors = new Set<string>();
                let checked = 0;
                for (const intensity of [0.1, 0.4, 0.41, 0.75, 0.76, 1]) {
                    for (let seed = 0; seed < 32; seed++) {
                        const run = (ambient: number) => {
                            vi.spyOn(Math, 'random').mockReturnValue(ambient);
                            return fills.generateDeterministicFill(
                                genre,
                                intensity,
                                bar,
                                createPRNG(`PULSE_${seed}`),
                                ts,
                            );
                        };
                        const fill = run(0.05);
                        expect(run(0.95)).toEqual(fill);
                        const pulses = meter === '6/8' ? [6] : intensity <= 0.4 ? [18] : [12, 18];
                        assertPulseGroups(fill, pulses);
                        // The sparse pickup leaves the MIDDLE eighth open;
                        // bounds and note count cannot distinguish that rest.
                        if (intensity <= 0.4) {
                            expect(Object.keys(fill).map(Number)).toEqual(
                                pulses.flatMap((pulse) => [pulse, pulse + 4]),
                            );
                        }
                        const firstGroup = Object.entries(fill)
                            .filter(([step]) => Number(step) < pulses[0] + 6)
                            .map(([, notes]) => notes[0].name);
                        colors.add(firstGroup.join(','));
                        checked++;
                    }
                }
                expect(colors).toEqual(
                    new Set(['Snare,Snare', 'Snare,Snare,Snare', 'High Tom,Mid Tom,Low Tom']),
                );
                console.log(
                    `[Compound fill Critique] ${genre} ${meter}: ${checked} fills; ` +
                        'every occupied pulse anchored; accent/continuation >= 1.2; three gestures; bounded and replayable',
                );
            });

            it.each([false, true])(
                `${genre} ${meter}: preserves selection and crash contracts (busy solo: %s)`,
                (busySolo) => {
                    const original = fills.generateDeterministicFill;
                    const arranger = arrangement(meter);
                    arranger.sections = [
                        { id: 'section-2', seamless: true },
                    ] as ArrangerState['sections'];
                    let selected = 0;
                    for (const intensity of [0.2, 0.6, 0.9]) {
                        for (let seed = 0; seed < 12; seed++) {
                            const solo = {
                                notes: Array.from({ length: 4 * bar }, (_, step) => ({
                                    step,
                                    velocity: 0.9,
                                })),
                                loopLengthSteps: 4 * bar,
                            };
                            const args = [
                                {} as EnsembleState,
                                arranger,
                                genre,
                                intensity,
                                `SELECT_${seed}`,
                                busySolo ? solo : undefined,
                            ] as const;
                            const actual = generateDrumFills(...args);
                            const spy = vi
                                .spyOn(fills, 'generateDeterministicFill')
                                .mockImplementation((g, i, length, random) =>
                                    original(g, i, length, random),
                                );
                            const legacy = generateDrumFills(...args);
                            spy.mockRestore();
                            const schedule = (map: typeof actual) =>
                                Object.entries(map).map(([start, entry]) => [
                                    start,
                                    entry.length,
                                    entry.crash,
                                ]);
                            expect(schedule(actual)).toEqual(schedule(legacy));
                            expect(actual[7 * bar]).toBeUndefined(); // seamless Chorus entrance.
                            selected += Object.keys(actual).length;
                            for (const [start, fill] of Object.entries(actual)) {
                                expect((Number(start) + fill.length) % (4 * bar)).toBe(0);
                            }
                        }
                    }
                    expect(selected).toBeGreaterThan(0);
                },
            );

            it(`${genre} ${meter}: emitted fills preserve groove outside the gesture and the arrival`, () => {
                vi.spyOn(Math, 'random').mockReturnValue(0.5);
                const state = scene(genre, meter);
                // A real 64-bar chart keeps authored sections (short charts
                // deliberately use the seeder's coalesced virtual macro-form).
                const start = 31 * bar;
                const map = generateDrumFills(
                    state,
                    state.arranger,
                    genre,
                    0.7,
                    'COMPOUND_PRACTICE',
                );
                const fill = map[start];
                expect(fill).toBeDefined();
                assertPulseGroups(fill.steps, meter === '6/8' ? [6] : [12, 18]);
                state.groove.fillActive = true;
                state.groove.fillStartStep = start;
                state.groove.fillLength = fill.length;
                state.groove.fillSteps = fill.steps;
                state.groove.pendingCrash = fill.crash;
                const clone = cloneStateForDetachedGeneration(state);
                const ordinary = {
                    ...state,
                    ...clone,
                    groove: { ...clone.groove, fillActive: false },
                };
                const tick = (s: EnsembleState, step: number) =>
                    runDrumTick(s, step, {
                        mainCursor: { index: 0, sectionIndex: 0 },
                        lookaheadCursor: { index: 0, sectionIndex: 0 },
                    }).drumHits;
                let ordinaryHits = 0;
                for (let step = start; step < start + 2 * bar; step++) {
                    const emitted = tick(state, step);
                    const baseline = tick(ordinary, step);
                    const intended = fill.steps[step - start];
                    if (intended) {
                        for (const note of intended) {
                            expect(emitted).toContainEqual(
                                expect.objectContaining({
                                    soundName: note.name,
                                    velocity: note.vel,
                                    instTimeOffset: 0,
                                }),
                            );
                        }
                    } else if (step === start + bar) {
                        // The existing crash contract may add a cymbal, never
                        // remove/retime the new bar's ordinary foundation.
                        expect(emitted.filter((hit) => hit.soundName !== 'Crash')).toEqual(
                            baseline.filter((hit) => hit.soundName !== 'Crash'),
                        );
                        expect(emitted.some((hit) => hit.soundName === 'Crash')).toBe(true);
                    } else {
                        expect(emitted).toEqual(baseline);
                        ordinaryHits += baseline.length;
                    }
                }
                expect(ordinaryHits).toBeGreaterThan(0);
            });
        }
    }

    it('uses local compound meter for extended-playback fallback even under a 4/4 global meter', () => {
        const state = scene('Blues', '6/8', 4);
        state.arranger.timeSignature = '4/4';
        state.groove.fillMap = null;
        state.groove.orchestrationMap = null;
        const send = vi.fn();
        checkSectionTransition(state, state.arranger.totalSteps + 36, 12, send, true, 2);
        const trigger = send.mock.calls.find(([action]) => action === ACTIONS.TRIGGER_FILL);
        expect(trigger).toBeDefined();
        expect(trigger![1].startStep).toBe(state.arranger.totalSteps + 36);
        expect(trigger![1].length).toBe(12);
        assertPulseGroups(trigger![1].steps, [6]);
    });

    it('keeps non-pilot styles, odd meters, 3/4 and authored alternative groupings unchanged', () => {
        const cases = [
            ['Jazz', TIME_SIGNATURES['6/8']],
            ['Rock', TIME_SIGNATURES['3/4']],
            ['Blues', TIME_SIGNATURES['7/8']],
            ['Rock', getEffectiveTimeSignature('6/8', [2, 2, 2])],
        ] as const;
        for (const [genre, ts] of cases) {
            const bar = ts.beats * ts.stepsPerBeat;
            for (const intensity of [0.2, 0.6, 0.9]) {
                const generate = (meter?: typeof ts) =>
                    fills.generateDeterministicFill(
                        genre,
                        intensity,
                        bar,
                        createPRNG('UNCHANGED'),
                        meter,
                    );
                expect(generate(ts)).toEqual(generate());
            }
        }
    });
});
