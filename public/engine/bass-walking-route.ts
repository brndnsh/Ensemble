import type { Chord, EnsembleState, StepInfo } from '../types.js';
import { binarySearchMap } from '../utils.js';
import { scrambleHash, stringHash33 } from './hash-utils.js';
import { foldPracticeStep } from './section-overrides.js';
import { chordTargetTones } from './soloist-pitch-engine.js';
import { getScaleForChord } from './theory-scales.js';

// #1136: a supportive walking line is a small journey into a known arrival.
// Keep the entire journey in the ordinary bass register, with no later octave
// lottery. The same chart anchor is used by this bar's plan and the next downbeat.
const LOW = 28;
const HIGH = 51;
const pc = (midi: number) => ((midi % 12) + 12) % 12;

function anchor(chord: Chord, center: number): number {
    const pitchClass = pc(chord.bassMidi ?? chord.rootMidi);
    let best = LOW + pc(pitchClass - LOW);
    for (let midi = best + 12; midi <= HIGH; midi += 12) {
        if (Math.abs(midi - center) < Math.abs(best - center)) {
            best = midi;
        }
    }
    return best;
}

function eligibleBar(state: EnsembleState, step: number) {
    const { arranger } = state;
    const position = wrapStep(foldPracticeStep(step, state.playback), arranger.totalSteps);
    const measure = binarySearchMap(arranger.measureMap, position);
    const entry = binarySearchMap(arranger.stepMap, position);
    if (
        !measure ||
        !entry ||
        measure.ts !== '4/4' ||
        measure.end - measure.start !== 16 ||
        entry.start !== measure.start ||
        entry.end !== measure.end ||
        !Number.isFinite(entry.chord.rootMidi) ||
        (entry.chord.bassMidi != null && !Number.isFinite(entry.chord.bassMidi))
    ) {
        return null;
    }
    return { ...entry, position };
}

const wrapStep = (step: number, length: number) => ((step % length) + length) % length;

type Route = { notes: number[]; score: number };

/**
 * Vocabulary: a scalar step or chord-tone departure, a scale/chord-tone middle,
 * then a diatonic or chromatic neighbor into the destination. Rank whole paths:
 * shorter travel, fewer leaps, one turn at most. Seed only chooses between
 * comparably smooth paths; it cannot buy an octave flourish or a zigzag.
 */
function composeRoute(
    start: number,
    target: number,
    scale: number[],
    pillars: number[],
    seed: number,
): number[] | null {
    const tones = [];
    for (let midi = LOW; midi <= HIGH; midi++) {
        if (scale.includes(pc(midi))) {
            tones.push(midi);
        }
    }
    // Chromatic neighbors are the primary Jazz arrival vocabulary (3 of 4
    // seeded choices). The remaining choice uses a scale neighbor where one
    // exists. This preserves a chromatic majority without making every bar
    // announce its destination with the same leading tone.
    const chromatic = scrambleHash(seed) < 0.75;
    const neighbors = [target - 1, target + 1, target - 2, target + 2].filter(
        (note) =>
            note >= LOW &&
            note <= HIGH &&
            (chromatic ? Math.abs(note - target) === 1 : scale.includes(pc(note))),
    );
    const approaches = neighbors.length
        ? neighbors
        : [target - 1, target + 1].filter((note) => note >= LOW && note <= HIGH);
    const routes: Route[] = [];
    let bestScore = Infinity;
    for (const second of tones) {
        const departure = Math.abs(second - start);
        if (departure === 0 || departure > 7 || (departure > 2 && !pillars.includes(pc(second)))) {
            continue;
        }
        for (const third of tones) {
            for (const fourth of approaches) {
                const notes = [start, second, third, fourth, target];
                let score = 0;
                let turns = 0;
                let direction = 0;
                let valid = true;
                for (let i = 1; i < notes.length; i++) {
                    const delta = notes[i] - notes[i - 1];
                    const distance = Math.abs(delta);
                    if (distance === 0 || distance > 7) {
                        valid = false;
                        break;
                    }
                    if (direction && Math.sign(delta) !== direction) {
                        turns++;
                    }
                    direction = Math.sign(delta);
                    // Why: walk between destinations rather than repeatedly
                    // bounding up a chord. A third is available but costs more
                    // than a step; a fifth remains a ceiling, not a target.
                    score += distance + Math.max(0, distance - 2);
                }
                if (!valid || turns > 1) {
                    continue;
                }
                score += turns * 2;
                // Beat three can quietly outline the current harmony. This
                // small preference cannot outweigh an extra leap or turn.
                if (pillars.includes(pc(third))) {
                    score -= 1;
                }
                bestScore = Math.min(bestScore, score);
                routes.push({ notes, score });
            }
        }
    }
    // Two score points allow a neighboring route, not a second tier of showy
    // alternatives. Unlike a per-note lottery, this choice has one destination.
    const shortlist = routes.filter((route) => route.score <= bestScore + 2);
    return shortlist[Math.floor(scrambleHash(seed ^ 0x51ed270b) * shortlist.length)]?.notes ?? null;
}

export interface WalkingPitch {
    midi: number;
    approachTarget?: number;
}

/** Pure chart-derived plan: no cache, cursor, new state field or reset ritual. */
export function getJazzWalkingPitch(
    state: EnsembleState,
    chord: Chord,
    style: string,
    step: number,
    stepInChord: number,
    centerMidi: number,
    info: StepInfo | undefined,
): WalkingPitch | null {
    if (
        style !== 'quarter' ||
        state.groove.genreFeel !== 'Jazz' ||
        !(state.arranger.totalSteps > 0)
    ) {
        return null;
    }
    const current = eligibleBar(state, step);
    if (!current) {
        return null;
    }
    const offset = current.position - current.start;
    // A mismatched/future chord or partial-bar fixture must not acquire a plan
    // for a different harmony. Production supplies the current chart position.
    if (
        stepInChord !== offset ||
        (info && info.mStep !== offset) ||
        chord.rootMidi !== current.chord.rootMidi ||
        chord.bassMidi !== current.chord.bassMidi
    ) {
        return null;
    }

    // Keep the user's register anchor, without transient intensity/previous-note
    // drift: otherwise the destination's octave changes while approaching it.
    const center = Math.max(LOW, Math.min(HIGH, Number.isFinite(centerMidi) ? centerMidi : 38));
    const start = anchor(chord, center);
    // Every eligible bar owns its downbeat independently of the following bar.
    // A route can therefore approach the last 4/4 bar before a meter change.
    if (offset === 0) {
        return { midi: start };
    }
    const next = eligibleBar(state, step - offset + 16);
    if (!next) {
        return null;
    }
    const target = anchor(next.chord, center);
    // Functional tones, never the comp's potentially rootless voicing. The
    // shared soloist helper groups suspended qualities around sus4; sus2's
    // defining second needs its own literal here.
    const pillars =
        chord.quality === 'sus2'
            ? [0, 2, 7].map((interval) => pc(chord.rootMidi + interval))
            : chordTargetTones(chord.rootMidi, chord.quality).pillars;
    // 'scalar' suppresses the transient soloist-tension substitution. Explicit
    // altered harmony still has its own scale; a live soloist phrase cannot
    // silently recompose the bassist's half-finished bar. Diatonic-fit detection
    // also sees functional harmony, never the comp's mutable voicing/tensions.
    const harmonicChord = {
        ...chord,
        intervals: pillars.map((pitchClass) => pc(pitchClass - chord.rootMidi)),
    };
    const scale = getScaleForChord(state, harmonicChord, next.chord, 'scalar').map((interval) =>
        pc(chord.rootMidi + interval),
    );
    const seed = stringHash33(state.arranger.seed || '') ^ Math.imul(current.start, 0x9e3779b1);
    const route = composeRoute(start, target, scale, pillars, seed);
    if (!route) {
        return null;
    }
    const beat = Math.floor(offset / 4);
    let midi = route[beat];
    // Existing eighth-note skips decorate, never add to, the rhythm. On a leap
    // use an intervening scale tone; beside a step rearticulate the current
    // pitch. The final skip repeats the approach, leaving the arrival for One.
    if (offset % 4 !== 0 && beat < 3) {
        const following = route[beat + 1];
        const direction = Math.sign(following - midi);
        for (let note = midi + direction; note !== following; note += direction) {
            if (scale.includes(pc(note))) {
                midi = note;
                break;
            }
        }
    }
    return { midi, approachTarget: beat === 3 ? target : undefined };
}
