import { afterEach, expect, test, vi } from 'vitest';
import { initAudio } from '../../public/engine/engine.js';
import { ensurePackLoaded, getPackZones } from '../../public/engine/pack-runtime.js';
import { scheduleSoloist } from '../../public/engine/scheduler-core.js';
import { SOLOIST_VELOCITY_ENVELOPE } from '../../public/engine/soloist-phrase-first.js';
import { conductorVelocityFor } from '../../public/engine/velocity-shaping.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import type { InstrumentVoice } from '../../public/types.js';
import { makeMulberry32 } from '../utils/seeded-random.js';
import { buildDynamicsState, performDynamics } from '../utils/soloist-dynamics.js';

afterEach(() => {
    vi.restoreAllMocks();
    SOLOIST_VELOCITY_ENVELOPE.enabled = true;
});

async function renderVelocity(velocity: number, intensity: number, voice: InstrumentVoice) {
    const initial = cloneStateForDetachedGeneration(buildDynamicsState('Jazz'));
    const state = {
        ...initial,
        playback: {
            ...initial.playback,
            bandIntensity: intensity,
            conductorVelocity: conductorVelocityFor(intensity),
        },
        soloist: { ...initial.soloist, voice, audio: { ...initial.soloist.audio } },
        groove: { ...initial.groove, humanize: 0 },
        vizState: { ...initial.vizState, enabled: true },
    };
    const ctx = new OfflineAudioContext(2, 48000, 48000);
    // Reset voice/noise random draws for matched renders. The clock, pitch,
    // articulation and polyphony stay identical: only generated velocity differs.
    vi.spyOn(Math, 'random').mockImplementation(makeMulberry32(1135));
    initAudio(state, { audioContext: ctx as unknown as AudioContext, enableWatchdog: false });
    if (voice.startsWith('pack:')) {
        await ensurePackLoaded(ctx, voice.slice(5));
        expect(getPackZones(voice.slice(5))?.length, 'sample pack must load').toBeGreaterThan(0);
    }
    // Observe real nodes without replacing the voice or its renderer. Loaded
    // zones alone would still pass if the source router fell back to the synth.
    const sources: AudioBufferSourceNode[] = [];
    const createBufferSource = ctx.createBufferSource.bind(ctx);
    vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
        const source = createBufferSource();
        sources.push(source);
        return source;
    });
    state.soloist.audio.buffer.set(0, [
        {
            midi: 72,
            freq: 523.2511306011972,
            velocity,
            durationSteps: 2,
            style: 'scalar',
        },
    ]);
    scheduleSoloist(
        state,
        getChordAtStep(0, state.arranger, { index: 0, sectionIndex: 0 })!,
        0,
        0.1,
    );
    if (voice.startsWith('pack:')) {
        const zones = getPackZones(voice.slice(5))!;
        expect(
            sources.some((source) => zones.some((zone) => zone.buffer === source.buffer)),
            'scheduled source must use a decoded sax buffer, not synth fallback',
        ).toBe(true);
    }
    const event = state.playback.drawQueue.find(
        (event) => 'track' in event && event.track === 'soloist',
    );
    const dispatched = event && 'renderVelocity' in event ? event.renderVelocity : undefined;
    expect(dispatched).toBeGreaterThan(0);
    const pcm = await ctx.startRendering();
    let energy = 0;
    let nonFinite = 0;
    // Same note-aligned attack/body window, through the real bus and master graph.
    for (let channel = 0; channel < pcm.numberOfChannels; channel++) {
        const data = pcm.getChannelData(channel);
        for (let i = 4800; i < 16800; i++) {
            if (!Number.isFinite(data[i])) {
                nonFinite++;
            }
            energy += data[i] ** 2;
        }
    }
    const rms = Math.sqrt(energy / (12000 * pcm.numberOfChannels));
    expect(nonFinite).toBe(0);
    expect(rms).toBeGreaterThan(0.0001);
    return { rms, dispatched: dispatched! };
}

test.each(['synth', 'pack:sax-alto'] as const)(
    'phrase crest survives production playback - %s',
    { timeout: 60000 },
    async (voice) => {
        // Browser-mode Vite disables publicDir to compile public/*.ts. Keep real pack
        // loading/decoding, only adapting its asset prefix to that test server.
        const fetch = globalThis.fetch.bind(globalThis);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
            fetch(
                typeof input === 'string' && input.startsWith('/packs/')
                    ? `/public${input}`
                    : input,
                init,
            ),
        );
        const state = buildDynamicsState('Jazz');
        const seed = state.soloist.session.seed!;
        const apex = seed.notes
            .filter((note) => note.step >= 0 && note.step < 192)
            .reduce((best, note) => (note.midi > best.midi ? note : best));
        const index = apex.step + seed.loopLengthSteps;
        const report = [];
        for (const intensity of [0.3, 1]) {
            SOLOIST_VELOCITY_ENVELOPE.enabled = true;
            const on = performDynamics(state, intensity)[index].notes.at(-1)!;
            SOLOIST_VELOCITY_ENVELOPE.enabled = false;
            const off = performDynamics(state, intensity)[index].notes.at(-1)!;
            expect(on.velocity / off.velocity).toBeCloseTo(1.15, 10);
            const unaccented = await renderVelocity(off.velocity, intensity, voice);
            const accented = await renderVelocity(on.velocity, intensity, voice);
            const repeat = await renderVelocity(on.velocity, intensity, voice);
            expect(repeat.rms).toBeCloseTo(accented.rms, 7);
            // The authored 15% crest must retain at least 10% in PCM amplitude,
            // not merely a nonzero float difference after compression/saturation.
            expect(accented.rms / unaccented.rms).toBeGreaterThan(1.1);
            expect(accented.dispatched / unaccented.dispatched).toBeCloseTo(1.15, 10);
            report.push({ intensity, crestDb: 20 * Math.log10(accented.rms / unaccented.rms) });
        }
        console.log(`[#1135 PCM ${voice}] ${JSON.stringify(report)}`);
    },
);
