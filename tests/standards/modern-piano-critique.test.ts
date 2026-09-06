import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { voicePianoChord } from '../../public/engine/piano-voicings.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import type { EnsembleState } from '../../public/types.js';
import { bootstrapEnsembleAudit } from '../../scripts/ensemble-analysis-utils.js';

afterEach(() => vi.restoreAllMocks());

async function scene(meter = '4/4', value = 'Dm7 | G7 | Cmaj7 | Cmaj7') {
    const boot = await bootstrapEnsembleAudit({
        genre: 'Jazz',
        bpm: 108,
        intensity: 0.45,
        timeSignature: meter,
        seed: 'PIANIST_3',
        chordStyle: 'modern-piano',
        bassStyle: undefined,
        drumPreset: undefined,
        harmonyStyle: undefined,
        soloistStyle: undefined,
    });
    const detached = cloneStateForDetachedGeneration(boot.state);
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        chords: { ...detached.chords },
        playback: { ...detached.playback },
        soloist: { ...detached.soloist },
        bass: { ...detached.bass },
        harmony: { ...detached.harmony },
        groove: { ...detached.groove },
    };
    state.arranger.sections = [
        { id: 'piano', label: 'Verse', value, key: 'C', timeSignature: meter },
    ];
    state.chords.style = 'modern-piano';
    state.chords.density = 'standard';
    state.soloist.enabled = false;
    state.bass.enabled = false;
    state.harmony.enabled = false;
    state.groove.enabled = false;
    validateProgression(state);
    return state;
}

function capture(initial: EnsembleState, random = 0.05, start = 0) {
    const state = cloneStateForDetachedGeneration(initial);
    resetHiddenGenerationMemory(state);
    const rng = vi.spyOn(Math, 'random').mockReturnValue(random);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const events = [];
    try {
        for (let step = start; step < state.arranger.totalSteps * 3; step++) {
            // Match worker-buffer-manager's folded generation and monotonic output key.
            const musicalStep = foldPracticeStep(step, state.playback);
            const result = generateNotesForStep(
                state,
                musicalStep,
                cursors,
                {
                    includeChords: true,
                    includeBass: false,
                    includeSoloist: false,
                    includeHarmony: false,
                    includeDrums: false,
                    noLiveConductor: true,
                },
                null,
            );
            const notes = result.notes
                .filter((n) => n.module === 'chords')
                .map((n) => ({ ...n, step }));
            if (notes.length) {
                // Authored hand gates must survive a switch from a pedalled MIDI style.
                expect(notes.flatMap((n) => n.ccEvents || [])).toEqual([
                    { controller: 64, value: 0, timingOffset: 0 },
                ]);
            }
            for (const n of notes) {
                for (const value of [n.midi, n.velocity, n.durationSteps, n.timingOffset]) {
                    expect(Number.isFinite(value)).toBe(true);
                }
                expect(n.durationSteps).toBeGreaterThan(0);
                expect(n.velocity).toBeGreaterThan(0);
                // theory: the keyboard must stay inside the shared chord slot.
                expect(n.midi).toBeGreaterThanOrEqual(52);
                expect(n.midi).toBeLessThanOrEqual(84);
                expect(n.chordPerformance?.player).toBe('modern-piano');
            }
            events.push({ step, notes });
        }
        return events;
    } finally {
        rng.mockRestore();
    }
}

describe('Modern piano: connected, economical and dependable accompaniment (#1150)', () => {
    it('voices parsed chord qualities in all keys with playable hands and literal defining tones', async () => {
        const state = await scene(
            '4/4',
            'C | Cm7 | C7 | Cmaj7 | C7b9 | C7#9 | C7alt | Cm7b5 | Cdim7 | Csus4 | C7sus4 | C/E | C5 | C9 | Cmaj9 | Cm9 | C11 | Cm11 | C13 | Cmaj13 | Cm13 | Cmaj7#11 | C7#11 | C7b13 | C7b5 | Cmaj7#5 | Cadd9 | C6 | Cm6',
        );
        const required = [
            [0, 4],
            [3, 10],
            [4, 10],
            [4, 11],
            [4, 10, 1],
            [4, 10, 3],
            [4, 10, 1],
            [3, 6, 10],
            [3, 6, 9],
            [5],
            [5, 10],
            [4],
            [0, 7],
            [4, 10, 2],
            [4, 11, 2],
            [3, 10, 2],
            [5, 10],
            [3, 10, 5],
            [4, 10, 9],
            [4, 11, 9],
            [3, 10, 9],
            [4, 11, 6],
            [4, 10, 6],
            [4, 10, 8],
            [4, 6, 10],
            [4, 8, 11],
            [4, 2],
            [4, 9],
            [3, 9],
        ];
        for (let transpose = 0; transpose < 12; transpose++) {
            for (const [i, chord] of state.arranger.progression.entries()) {
                const shifted = {
                    ...chord,
                    rootMidi: chord.rootMidi + transpose,
                    bassMidi: chord.bassMidi == null ? null : chord.bassMidi + transpose,
                    intervals: [1, 6, 11],
                };
                for (const bass of [false, true]) {
                    for (const density of ['thin', 'standard', 'rich']) {
                        const keys = voicePianoChord(shifted, bass, density);
                        // theory: enough keys for a chord, bounded to two compact hands.
                        expect(
                            keys.length,
                            `${shifted.absName} +${transpose} ${bass} ${density}`,
                        ).toBeGreaterThanOrEqual(3);
                        expect(keys.length).toBeLessThanOrEqual(5);
                        const pcs = keys.map((n) => n.midi % 12);
                        for (const pc of required[i]) {
                            expect(pcs, `${chord.absName} +${transpose}`).toContain(
                                (pc + transpose) % 12,
                            );
                        }
                        if (!bass) {
                            expect(keys[0].midi % 12).toBe(
                                (shifted.bassMidi ?? shifted.rootMidi) % 12,
                            );
                        }
                        for (const hand of ['left', 'right']) {
                            const notes = keys.filter((n) => n.hand === hand).map((n) => n.midi);
                            expect(notes.length).toBeGreaterThan(0);
                            expect(Math.max(...notes) - Math.min(...notes)).toBeLessThanOrEqual(12);
                        }
                    }
                }
            }
        }
    }, 60000);

    it('connects guide tones through ii–V–I while keeping the top line within a fourth', async () => {
        const state = await scene();
        let previous: ReturnType<typeof voicePianoChord> = [];
        const voicings = state.arranger.progression.map((chord) => {
            const next = voicePianoChord(chord, true, 'standard', previous);
            if (previous.length) {
                // theory: a restrained top line should not leap beyond a fourth here.
                expect(Math.abs(next.at(-1)!.midi - previous.at(-1)!.midi)).toBeLessThanOrEqual(5);
            }
            previous = next;
            return next.map((n) => n.midi);
        });
        expect(voicings[0].some((m) => voicings[1].includes(m))).toBe(true);
        const f = voicings[1].find((m) => m % 12 === 5)!;
        expect(voicings[2]).toContain(f - 1); // G7's seventh resolves down to C's third.
        console.log('Modern piano ii–V–I voicings:', voicings);
    });

    it.each(['4/4', '3/4', '6/8', '7/8'])(
        'keeps support and phrase contrast over three %s loops without the other players',
        async (meter) => {
            const state = await scene(meter);
            const events = capture(state);
            const attacks = events.filter((e) => e.notes.length);
            const cursor = { index: 0, sectionIndex: 0 };
            for (const event of events) {
                const chord = getChordAtStep(event.step, state.arranger, cursor);
                if (chord?.stepInChord === 0) {
                    expect(
                        event.notes.length,
                        `Missing arrival ${event.step}`,
                    ).toBeGreaterThanOrEqual(3);
                }
            }
            // theory: restrained comping has one to three gestures per bar on this chart.
            const perBar = attacks.length / 12;
            expect(perBar).toBeGreaterThanOrEqual(1);
            expect(perBar).toBeLessThanOrEqual(3);
            expect(
                attacks.some(
                    (e) =>
                        e.notes[0].chordPerformance?.player === 'modern-piano' &&
                        e.notes[0].chordPerformance.gesture === 'answer',
                ),
            ).toBe(true);
            expect(
                attacks.some(
                    (e) =>
                        e.notes[0].chordPerformance?.player === 'modern-piano' &&
                        e.notes[0].chordPerformance.gesture === 'settle',
                ),
            ).toBe(true);
            expect(capture(state, 0.95)).toEqual(events);
            expect(capture(state, 0.5, state.arranger.totalSteps + 3)).toEqual(
                events.slice(state.arranger.totalSteps + 3),
            );
            console.log(
                `Modern piano ${meter}: ${perBar} gestures/bar, finite and present across three loops`,
            );
        },
    );

    it('holds left-hand support under lighter, shorter right-hand answers; color does not add attacks', async () => {
        const state = await scene();
        state.chords.density = 'thin';
        const thin = capture(state).filter((e) => e.notes.length);
        state.chords.density = 'rich';
        const rich = capture(state).filter((e) => e.notes.length);
        expect(rich.map((e) => e.step)).toEqual(thin.map((e) => e.step));
        expect(rich.reduce((n, e) => n + e.notes.length, 0)).toBeGreaterThan(
            thin.reduce((n, e) => n + e.notes.length, 0),
        );
        const statement = rich[0];
        const answer = rich[1];
        expect(
            answer.notes.every(
                (n) =>
                    n.chordPerformance?.player === 'modern-piano' &&
                    n.chordPerformance.hand === 'right',
            ),
        ).toBe(true);
        const left = statement.notes.find(
            (n) =>
                n.chordPerformance?.player === 'modern-piano' && n.chordPerformance.hand === 'left',
        )!;
        expect(left.durationSteps! + statement.step).toBeGreaterThan(answer.step);
        expect(Math.max(...answer.notes.map((n) => n.velocity!))).toBeLessThan(
            Math.max(...statement.notes.map((n) => n.velocity!)),
        );
        expect(Math.max(...answer.notes.map((n) => n.durationSteps!))).toBeLessThan(
            left.durationSteps!,
        );
    });

    it.each(['4/4', '6/8', '7/8'])(
        'bounds releases at fast %s chord changes and preserves pitches with a pinned guitar sound',
        async (meter) => {
            const state = await scene(meter, 'Dm7 G7 | Cmaj7 C/E');
            state.chords.voice = 'pack:electric-guitar-rhythm';
            state.playback.bpm = 240;
            const events = capture(state);
            const cursor = { index: 0, sectionIndex: 0 };
            for (const e of events) {
                const data = getChordAtStep(e.step, state.arranger, cursor)!;
                const chartStep = e.step % state.arranger.totalSteps;
                const chordEnd = state.arranger.stepMap[data.chordIndex].end;
                for (const n of e.notes) {
                    // Read the parser's actual boundary, not the generator's duration formula.
                    expect(chartStep + n.durationSteps!).toBeLessThanOrEqual(chordEnd);
                }
            }
            expect(events[0].notes.some((n) => n.midi! % 12 === 5)).toBe(true); // Dm7's third survives crunch-source routing.
        },
    );

    it('retains the flat-five identity through chart parsing and displayed notation', async () => {
        const state = await scene('4/4', 'C7b5 | C7 | Cm7b5');
        const [altered, dominant, halfdim] = state.arranger.progression;
        expect(altered.absName).toBe('C7b5');
        expect(altered.nnsName).toBe('17b5');
        expect(altered.romanName).toBe('I7b5');
        expect(altered.absName).not.toBe(dominant.absName);
        expect(altered.quality).toBe('7b5');
        expect(halfdim.quality).toBe('halfdim');
    });

    it('invalidates a content-cached voicing after a same-object harmonic edit', async () => {
        const state = await scene();
        const original = capture(state)[0].notes;
        // Model the worker's deep-merge: mutate existing chord objects in place.
        state.arranger.progression[0].quality = '7';
        const changed = capture(state)[0].notes;
        expect(changed.some((n) => n.midi! % 12 === 6)).toBe(true);
        expect(changed).not.toEqual(original);
        expect(capture(cloneStateForDetachedGeneration(state))[0].notes).toEqual(changed);
    });

    it('repeats the chosen practice window and respects a disabled chord lane', async () => {
        const state = await scene();
        const normal = capture(state);
        state.playback.loopStartStep = 16;
        state.playback.loopEndStep = 48;
        const practice = capture(state, 0.5, 16);
        const musicalNotes = (notes: (typeof normal)[number]['notes']) =>
            notes.map((n) => ({ ...n, step: 0 }));
        for (const event of practice) {
            const folded = 16 + ((event.step - 16) % 32);
            expect(musicalNotes(event.notes)).toEqual(musicalNotes(normal[folded].notes));
        }
        state.chords.enabled = false;
        expect(capture(state).every((event) => event.notes.length === 0)).toBe(true);
    });
});
