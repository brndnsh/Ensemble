import { describe, expect, it } from 'vitest';
import { getBassNote } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { runDrumTick } from '../../public/engine/drums-tick.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function scene(seed: string) {
    dispatch(ACTIONS.RESET_STATE);
    const base = cloneStateForDetachedGeneration(getState());
    const state = {
        ...base,
        arranger: {
            ...base.arranger,
            seed,
            timeSignature: '4/4',
            sections: [
                {
                    id: 'a',
                    label: 'Verse',
                    value: 'C | C | C | C',
                    key: 'C',
                    timeSignature: '4/4',
                    seamless: false,
                },
                {
                    id: 'b',
                    label: 'Chorus',
                    value: 'G | G | G | G',
                    key: 'C',
                    timeSignature: '4/4',
                    seamless: false,
                },
            ],
        },
        bass: { ...base.bass, enabled: true, style: 'rock' },
        soloist: { ...base.soloist, enabled: false },
        groove: {
            ...base.groove,
            enabled: true,
            genreFeel: 'Rock',
            humanize: 0,
            fillActive: true,
            fillStartStep: 48,
            fillLength: 16,
            fillSteps: Array.from({ length: 16 }, () => [{ name: 'Tom1', vel: 0.9 }]),
        },
        playback: { ...base.playback, bandIntensity: 0.7, complexity: 0.7 },
    };
    validateProgression(state);
    return state;
}

const cursors = () => ({
    mainCursor: { index: 0, sectionIndex: 0 },
    lookaheadCursor: { index: 0, sectionIndex: 0 },
});
const tick = (state: ReturnType<typeof scene>, step: number) => runDrumTick(state, step, cursors());

describe('Rock transition ownership (#1138)', () => {
    it('reserves a whole transition window when the inferred drop threshold falls inside it (F2)', () => {
        const state = scene('TRANSITION_0');
        state.arranger.sections[1].value = 'G | G';
        state.groove.pendingCrash = true;
        validateProgression(state);
        expect(state.arranger.totalSteps).toBe(96);
        for (let step = 48; step < 64; step++) {
            expect(tick(state, step).coordination.rockTransitionOwner).toBe('ordinary');
        }
        expect(tick(state, 58).coordination.dropMuteActive).toBe(true);
        const withPendingFill = tick(state, 64).drumHits;
        state.groove.fillActive = false;
        expect(withPendingFill).toEqual(tick(state, 64).drumHits);
    });
    it('suppresses the denied fill arrival crash but retains the ordinary boundary accent (F1)', () => {
        const state = scene('TRANSITION_4');
        state.groove.pendingCrash = true;
        expect(tick(state, 60).coordination.rockTransitionOwner).toBe('bass');
        const withPendingFill = tick(state, 64).drumHits;
        state.groove.fillActive = false;
        const ordinary = tick(state, 64).drumHits;
        expect(ordinary.some((hit) => hit.soundName === 'Crash')).toBe(true);
        expect(withPendingFill).toEqual(ordinary);
    });
    it('selects both owners across seeds and holds one owner across a transition', () => {
        const owners = new Set();
        for (let seed = 0; seed < 32; seed++) {
            const state = scene(`TRANSITION_${seed}`);
            const owner = tick(state, 48).coordination.rockTransitionOwner;
            owners.add(owner);
            for (let step = 49; step < 64; step++) {
                expect(tick(state, step).coordination.rockTransitionOwner).toBe(owner);
            }
        }
        expect(owners).toEqual(new Set(['drums', 'bass']));
    });

    it('keeps the native bass anchor under drum fills and timekeeping under bass ownership', () => {
        let drumWindows = 0;
        let bassWindows = 0;
        let pickups = 0;
        for (let seed = 0; seed < 128; seed++) {
            const state = scene(`TRANSITION_${seed}`);
            const drum = tick(state, 60);
            const owner = drum.coordination.rockTransitionOwner;
            const note = getBassNote(
                state,
                drum.chordData!.chord,
                drum.coordination.upcomingSectionFirstChord,
                3,
                null,
                38,
                'rock',
                0,
                60,
                12,
                { stepCoordination: drum.coordination },
                drum.stepInfo,
            );
            expect(note).not.toBeNull();
            if (owner === 'drums') {
                drumWindows++;
                expect(note.midi % 12).toBe(0);
                expect(drum.drumHits.some((hit) => hit.soundName === 'Tom1')).toBe(true);
            } else {
                bassWindows++;
                if (note.midi % 12 !== 0) {
                    pickups++;
                }
                expect(drum.drumHits.some((hit) => hit.soundName === 'Tom1')).toBe(false);
                expect(drum.drumHits.some((hit) => hit.soundName === 'Snare')).toBe(true);
                expect(
                    tick(state, 62).drumHits.some(
                        (hit) => hit.inst.name === 'HiHat' || hit.inst.name === 'Open',
                    ),
                ).toBe(true);
            }
        }
        expect(drumWindows).toBeGreaterThan(20);
        expect(bassWindows).toBeGreaterThan(20);
        expect(pickups).toBeGreaterThan(0);
        expect(pickups).toBeLessThan(bassWindows);
    });

    it.each(['bass', 'groove', 'Kick', 'Snare', 'HiHat'])(
        'falls back to ordinary backing without %s',
        (lane) => {
            const state = scene('FALLBACK');
            if (lane === 'bass' || lane === 'groove') {
                state[lane].enabled = false;
            } else {
                state.groove.instruments = state.groove.instruments.map((inst) => ({
                    ...inst,
                    muted: inst.name === lane || inst.muted,
                }));
            }
            const result = tick(state, 60);
            expect(result.coordination.rockTransitionOwner).toBe('ordinary');
            expect(result.drumHits.some((hit) => hit.soundName === 'Tom1')).toBe(false);
        },
    );

    it('leaves nonpilot steps and seamless transitions unowned', () => {
        const state = scene('SCOPE');
        expect(tick(state, 16).coordination.rockTransitionOwner).toBeNull();
        state.arranger.sections[1] = { ...state.arranger.sections[1], seamless: true };
        expect(tick(state, 60).coordination.rockTransitionOwner).toBeNull();
        state.bass.style = 'quarter';
        expect(tick(state, 60).coordination.rockTransitionOwner).toBeNull();
    });

    it('keeps ownership stable on later form passes without a scheduler loop counter', () => {
        const state = scene('LATER_PASS');
        const owner = tick(state, 176).coordination.rockTransitionOwner;
        expect(['drums', 'bass']).toContain(owner);
        for (let step = 177; step < 192; step++) {
            expect(tick(state, step).coordination.rockTransitionOwner).toBe(owner);
        }
        state.playback.currentLoopCount = 3;
        expect(tick(state, 176).coordination.rockTransitionOwner).toBe(owner);
    });

    it('does not add activity inside a structural drop cut', () => {
        const state = scene('DROP');
        state.arranger.sections[1].label = 'Drop';
        validateProgression(state);
        const result = tick(state, 60);
        expect(result.coordination.dropMuteActive).toBe(true);
        expect(result.coordination.rockTransitionOwner).toBe('ordinary');
        expect(result.drumHits).toHaveLength(0);
    });

    it('leaves final-song cadence outside the pilot', () => {
        const state = scene('ENDING');
        state.groove.fillActive = false;
        state.playback.songMode = true;
        state.playback.isEndingPending = true;
        const result = tick(state, 112);
        expect(result.coordination.isFinalMeasure).toBe(true);
        expect(result.coordination.rockTransitionOwner).toBeNull();
        expect(result.drumHits.some((hit) => hit.soundName === 'Crash')).toBe(true);
    });

    it.each(['Jazz', 'Funk', 'Blues'])('does not coordinate %s transitions', (genre) => {
        const state = scene('OTHER_GENRE');
        state.groove.genreFeel = genre;
        expect(tick(state, 60).coordination.rockTransitionOwner).toBeNull();
    });

    it('reserves catch windows and agrees across full and bass-only generation sinks', () => {
        const state = scene('CATCH');
        state.groove.accentMap = { 58: { type: 'snare-stab', velocity: 1 } };
        expect(tick(state, 48).coordination.rockTransitionOwner).toBe('ordinary');
        state.groove.accentMap = {};
        const full = generateNotesForStep(
            cloneStateForDetachedGeneration(state),
            60,
            cursors(),
            {},
            null,
        );
        const bassOnly = generateNotesForStep(
            cloneStateForDetachedGeneration(state),
            60,
            cursors(),
            {
                includeBass: true,
                includeDrums: false,
                includeSoloist: false,
                includeHarmony: false,
                includeChords: false,
            },
            null,
        );
        expect(bassOnly.coordination.rockTransitionOwner).toBe(
            full.coordination.rockTransitionOwner,
        );
        expect(bassOnly.notes.filter((note) => note.module === 'bass')).toEqual(
            full.notes.filter((note) => note.module === 'bass'),
        );
    });
});
