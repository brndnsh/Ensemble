import type { Chord, EnsembleState } from '../types.js';
import { binarySearchMap } from '../utils.js';

const pc = (midi: number) => ((midi % 12) + 12) % 12;
type Dyad = [number, number];
const thirdInterval = (chord: Chord) => (['m', 'minor'].includes(chord.quality) ? 3 : 4);

/** The pilot uses plain triads only; richer qualities retain their curated voicing. */
function dyads(chord: Chord, anchor: number): Dyad[] {
    if (!['', 'major', 'm', 'minor'].includes(chord.quality) || !Number.isFinite(chord.rootMidi)) {
        return [];
    }
    const third = pc(chord.rootMidi + thirdInterval(chord));
    const support = [pc(chord.rootMidi), pc(chord.rootMidi + 7)];
    const result: Dyad[] = [];
    for (let a = 52; a <= 84; a++) {
        for (let b = a + 3; b <= Math.min(84, a + 9); b++) {
            if (
                Math.abs((a + b) / 2 - anchor) <= 6 &&
                ((pc(a) === third && support.includes(pc(b))) ||
                    (pc(b) === third && support.includes(pc(a))))
            ) {
                result.push([a, b]);
            }
        }
    }
    return result;
}

function connect(from: Chord, to: Chord, anchor: number) {
    const fromTones = [0, thirdInterval(from), 7].map((iv) => pc(from.rootMidi + iv));
    const toTones = [0, thirdInterval(to), 7].map((iv) => pc(to.rootMidi + iv));
    const hasCommonTone = fromTones.some((tone) => toTones.includes(tone));
    let best: { from: Dyad; to: Dyad; score: number } | null = null;
    const targets = dyads(to, anchor);
    for (const source of dyads(from, anchor)) {
        for (const target of targets) {
            const distances = source.map((midi, i) => Math.abs(midi - target[i]));
            if (hasCommonTone && !distances.includes(0)) {
                continue;
            }
            if (!distances.some((d) => d >= 1 && d <= 2) || distances.some((d) => d > 5)) {
                continue;
            }
            // A common voice is the first preference; otherwise the companion makes
            // its ordinary chord arrival. Never sacrifice either chord's third.
            // Then prefer a quiet register and short travel. Ascending MIDI order
            // breaks exact ties, so the chart has one answer in every generation host.
            const score =
                (distances.includes(0) ? 0 : 100) +
                Math.abs((source[0] + source[1]) / 2 - anchor) +
                Math.abs((target[0] + target[1]) / 2 - anchor) +
                distances[0] +
                distances[1];
            if (!best || score < best.score) {
                best = { from: source, to: target, score };
            }
        }
    }
    return best;
}

/**
 * One chart-derived connection per section-relative four-bar window (#1146).
 * No cursor/cache or performance counter: fresh runs, section practice, repeated
 * sections and detached exports select the same boundary from the same chart.
 * `step` is the musical step supplied to generateNotesForStep by its host.
 */
export function getMovingPadVoicing(
    state: EnsembleState,
    chord: Chord,
    step: number,
    anchor: number,
): { midis: Dyad; source: Dyad; arrival: boolean } | null {
    const { arranger } = state;
    if (!(arranger.totalSteps > 0) || !Number.isFinite(anchor)) {
        return null;
    }
    const position = ((step % arranger.totalSteps) + arranger.totalSteps) % arranger.totalSteps;
    const section = binarySearchMap(arranger.sectionMap, position);
    const current = binarySearchMap(arranger.stepMap, position);
    if (!section || !current || current.chord !== chord) {
        return null;
    }
    // measureMap already encodes effective local meters, including mixed-meter
    // sections. Four actual bars, never four hardcoded 16-step chunks.
    const measures = arranger.measureMap.filter(
        (measure) => measure.start >= section.start && measure.start < section.end,
    );
    const bar = measures.findIndex((measure) => position < measure.end);
    if (bar < 0) {
        return null;
    }
    const windowBar = Math.floor(bar / 4) * 4;
    const start = measures[windowBar].start;
    const end = measures[Math.min(windowBar + 3, measures.length - 1)].end;
    const entries = arranger.stepMap.filter((entry) => entry.start >= start && entry.end <= end);
    for (let i = 0; i + 1 < entries.length; i++) {
        const from = entries[i];
        const to = entries[i + 1];
        if (
            from.end !== to.start ||
            (pc(from.chord.rootMidi) === pc(to.chord.rootMidi) &&
                from.chord.quality === to.chord.quality)
        ) {
            continue;
        }
        const connection = connect(from.chord, to.chord, anchor);
        if (!connection) {
            continue;
        }
        // Reserve the first eligible connection even when a live crowding/mute
        // rule prevents it. A quiet soloist must not unlock a later decoration.
        if (current !== from && current !== to) {
            return null;
        }
        const arrival = current === to;
        return {
            midis: arrival ? connection.to : connection.from,
            source: connection.from,
            arrival,
        };
    }
    return null;
}
