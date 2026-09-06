import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { binarySearchMapIndex } from '../utils.js';
import { type ChordFacts, chordFacts } from './chord-facts.js';
import { foldPracticeStep } from './section-overrides.js';

export interface GuitarString {
    /** Low E = 0, high E = 5. */
    string: number;
    fret: number;
    midi: number;
}

/** Fully authored articulation; carried unchanged through the worker buffer. */
export interface ChordPerformance {
    player: 'acoustic-guitar';
    string: number;
    fret: number;
    stroke: 'down' | 'up';
}

export interface GuitarNote {
    midi: number;
    velocity: number;
    durationSteps: number;
    timingOffset: number;
    instrument: 'Piano';
    muted: false;
    dry: false;
    ccEvents?: { controller: number; value: number; timingOffset: number }[];
    chordPerformance: ChordPerformance;
}

const TUNING = [40, 45, 50, 55, 59, 64];
// An immutable content cache, never phrase/session memory. Bounded independently
// of song length; a hit and a miss produce the same candidate list.
const shapeCache = new Map<string, readonly GuitarString[][]>();

function candidates(facts: ChordFacts): readonly GuitarString[][] {
    const key = `${facts.tones.join(',')}/${facts.bass}`;
    const cached = shapeCache.get(key);
    if (cached) {
        return cached;
    }
    const allowed = new Set([...facts.tones, facts.bass]);
    const shapes: GuitarString[][] = [];
    const seen = new Set<string>();
    // Enumerate contiguous string groups: a downstroke must not jump over an
    // unmodelled ringing string. A four-fret window and <=4 fretting fingers
    // (one possible barre at the lowest fret) bound the fretting hand.
    for (let position = 1; position <= 12; position++) {
        for (let first = 0; first <= 3; first++) {
            const walk = (shape: GuitarString[], string: number): void => {
                if (shape.length >= 3) {
                    const fretted = shape.filter((n) => n.fret > 0);
                    const low = Math.min(...fretted.map((n) => n.fret));
                    const barre = fretted.filter((n) => n.fret === low);
                    const barreStart = barre[0]?.string ?? 0;
                    const barreEnd = barre.at(-1)?.string ?? 0;
                    const canBarre = !shape.some(
                        (n) => n.string >= barreStart && n.string <= barreEnd && n.fret === 0,
                    );
                    const fingers = canBarre
                        ? (fretted.length ? 1 : 0) + fretted.filter((n) => n.fret > low).length
                        : fretted.length;
                    const shapeKey = shape.map((n) => `${n.string}:${n.fret}`).join(',');
                    if (fingers <= 4 && !seen.has(shapeKey)) {
                        shapes.push([...shape]);
                        seen.add(shapeKey);
                    }
                }
                if (string >= 6) {
                    return;
                }
                for (const fret of [0, position, position + 1, position + 2, position + 3]) {
                    const midi = TUNING[string] + fret;
                    // Choose inside the existing chords slot, so downstream
                    // register enforcement cannot destroy the fingering.
                    if (midi < 52 || midi > 79 || !allowed.has(midi % 12)) {
                        continue;
                    }
                    walk([...shape, { string, fret, midi }], string + 1);
                }
            };
            walk([], first);
        }
    }
    if (shapeCache.size >= 128) {
        shapeCache.clear();
    }
    shapeCache.set(key, shapes);
    return shapes;
}

/** Select by harmonic coverage first, then by hand position and voice leading. */
export function chooseGuitarShape(
    facts: ChordFacts,
    bassPresent: boolean,
    previous: readonly GuitarString[] = [],
): GuitarString[] {
    let best: GuitarString[] = [];
    let bestCost = Infinity;
    for (const shape of candidates(facts)) {
        const pcs = new Set(shape.map((n) => n.midi % 12));
        const missing = facts.defining.filter((pc) => !pcs.has(pc)).length;
        const low = Math.min(...shape.map((n) => n.midi));
        const position = Math.max(...shape.map((n) => n.fret));
        const motion = previous.length
            ? shape.reduce((sum, n) => {
                  const old = previous.find((p) => p.string === n.string);
                  return sum + (old ? Math.abs(n.fret - old.fret) : 2);
              }, 0)
            : 0;
        const cost =
            missing * 1000 +
            (!bassPresent && low % 12 !== facts.bass ? 400 : 0) +
            (!pcs.has(facts.root) ? (bassPresent ? 12 : 150) : 0) +
            (facts.tones.length === 2 && !pcs.has(facts.tones[1]) ? 1000 : 0) +
            Math.abs(shape.length - 5) * 3 +
            position * 0.5 +
            motion +
            Math.abs(low - 55) * 0.15;
        if (cost < bestCost) {
            bestCost = cost;
            best = shape;
        }
    }
    return best;
}

/** Meter-native pulse and answer plan; never removes a chord arrival. */
function strokes(info: StepInfo): { at: number; stroke: 'down' | 'up' }[] {
    const ts = info.tsConfig;
    const beat = ts.stepsPerBeat;
    const bar = ts.beats * beat;
    const result: { at: number; stroke: 'down' | 'up' }[] = [];
    if (beat === 2 && ts.grouping?.length) {
        let at = 0;
        for (const group of ts.grouping) {
            result.push({ at, stroke: 'down' });
            // Last eighth of each compound/asymmetric pulse answers lightly.
            if (group > 1) {
                result.push({ at: at + (group - 1) * beat, stroke: 'up' });
            }
            at += group * beat;
        }
    } else {
        for (let at = 0; at < bar; at += beat) {
            result.push({ at, stroke: 'down' });
            // The 2-and / 4-and lift repeats as an intentional two-beat cell.
            if ((at / beat) % 2 === 1 || at + beat === bar) {
                result.push({ at: at + Math.max(1, Math.floor(beat / 2)), stroke: 'up' });
            }
        }
    }
    return result;
}

export function getGuitarNotes(
    state: EnsembleState,
    chord: Chord,
    step: number,
    stepInChord: number,
    info: StepInfo,
    bassPresent: boolean,
): GuitarNote[] {
    const plan = strokes(info);
    // The existing coordination mask is worker-owned generation output. Keep
    // it aligned with this player's pulse rather than the previous piano cell.
    (state.chords as Mutable<typeof state.chords>).rhythmicMask = plan.reduce(
        (mask, stroke) => mask | (1 << stroke.at),
        0,
    ); // @worker-mutation
    const gesture =
        stepInChord === 0
            ? { at: info.mStep, stroke: 'down' as const }
            : plan.find((s) => s.at === info.mStep);
    if (!gesture) {
        return [];
    }
    const facts = chordFacts(chord);
    // Worker snapshots clone progression and stepMap separately: chord object
    // identity cannot locate the preceding shape across that boundary.
    const total = state.arranger.totalSteps || 1;
    const chartStep = ((foldPracticeStep(step, state.playback) % total) + total) % total;
    const index = binarySearchMapIndex(state.arranger.stepMap, chartStep);
    const prior = index > 0 ? state.arranger.stepMap[index - 1]?.chord : undefined;
    // Stateless, chart-local continuity also works after seek, export, and a
    // deep-merged worker update. No cache keys based on mutable state identity.
    const previous = prior ? chooseGuitarShape(chordFacts(prior), bassPresent) : [];
    const shape = chooseGuitarShape(facts, bassPresent, previous);
    const selected = gesture.stroke === 'up' ? shape.slice(-3).reverse() : shape;
    const next =
        plan.find((s) => s.at > info.mStep)?.at ?? info.tsConfig.beats * info.tsConfig.stepsPerBeat;
    const remaining = Math.max(0.25, chord.beats * info.tsConfig.stepsPerBeat - stepInChord);
    const gate = Math.min(remaining, Math.max(0.25, next - info.mStep));
    const stepSeconds = 60 / Math.max(30, state.playback.bpm) / 4;
    const spread = Math.min(0.009, (gate * stepSeconds) / Math.max(2, selected.length * 2));
    const intensity = Number.isFinite(state.playback.bandIntensity)
        ? state.playback.bandIntensity
        : 0.5;
    return selected.map((note, rank) => ({
        midi: note.midi,
        velocity:
            (0.38 + Math.max(0, Math.min(1, intensity)) * 0.3) *
            (gesture.stroke === 'up' ? 0.62 : info.mStep === 0 || stepInChord === 0 ? 1 : 0.8) *
            (1 - rank * 0.035),
        // All strings release at the next gesture/chord boundary. Subtract the
        // spread so the last pluck does not hang past a change at fast tempos.
        durationSteps: Math.max(0.05, gate - (rank * spread) / stepSeconds),
        timingOffset: rank * spread,
        instrument: 'Piano',
        muted: false,
        dry: false,
        // A live switch from a keyboard style can leave external MIDI's pedal
        // down. Clear it before the stroke so authored releases remain audible.
        ccEvents: rank === 0 ? [{ controller: 64, value: 0, timingOffset: 0 }] : undefined,
        chordPerformance: {
            player: 'acoustic-guitar',
            string: note.string,
            fret: note.fret,
            stroke: gesture.stroke,
        },
    }));
}
