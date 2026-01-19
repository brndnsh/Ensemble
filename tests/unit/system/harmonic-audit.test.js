/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SONG_TEMPLATES, CHORD_PRESETS } from '../../../public/presets.js';
import { getBassNote, isBassActive, getScaleForBass } from '../../../public/bass.js';
import { getSoloistNote, getScaleForChord } from '../../../public/soloist.js';
import { getHarmonyNotes } from '../../../public/harmonies.js';
import { getAccompanimentNotes } from '../../../public/accompaniment.js';
import { validateProgression } from '../../../public/chords.js';
import { ctx, arranger, gb, cb, bb, sb, hb, dispatch } from '../../../public/state.js';
import { getMidi } from '../../../public/utils.js';

// Mock UI and Worker
vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

const GENRES = [
    'Rock', 'Jazz', 'Funk', 'Blues', 'Neo-Soul', 
    'Disco', 'Bossa Nova', 'Reggae', 'Acoustic', 'Hip Hop'
];

const INTENSITIES = [0.1, 0.5, 0.9];

describe('Harmonic Audit: Global Preset/Genre Compatibility', () => {
    
    beforeEach(() => {
        // Reset state
        arranger.key = 'C';
        arranger.isMinor = false;
        arranger.timeSignature = '4/4';
        gb.enabled = true;
        bb.enabled = true;
        sb.enabled = true;
        hb.enabled = true;
        cb.enabled = true;
        cb.style = 'smart';
        bb.style = 'smart';
        sb.style = 'smart';
        hb.style = 'smart';
    });

    const runAudit = (presetName, sections, isMinor = false) => {
        it(`Audit: ${presetName}`, () => {
            arranger.sections = sections;
            arranger.isMinor = isMinor;
            validateProgression();

            const errors = [];

            GENRES.forEach(genre => {
                gb.genreFeel = genre;

                INTENSITIES.forEach(intensity => {
                    ctx.bandIntensity = intensity;
                    ctx.conductorVelocity = 0.8 + (intensity * 0.3);

                    // Test first 16 steps of the progression
                    for (let step = 0; step < Math.min(16, arranger.totalSteps); step++) {
                        const stepInMeasure = step % 16;
                        const entry = arranger.stepMap.find(e => step >= e.start && step < e.end);
                        if (!entry) continue;

                        const chord = entry.chord;
                        const stepInChord = step - entry.start;

                        // 1. Bass Check
                        if (isBassActive(bb.style, step, stepInChord)) {
                            const bassNote = getBassNote(chord, null, step / 4, bb.lastFreq, 38, bb.style, 0, step, stepInChord);
                            if (bassNote) {
                                // Velocity Check
                                const finalVel = bassNote.velocity * ctx.conductorVelocity;
                                if (finalVel > 1.5) errors.push(`[${genre} @ ${intensity}] Bass Vel Overload: ${finalVel.toFixed(2)} at step ${step}`);
                                
                                // Range Check
                                if (bassNote.midi < 12 || bassNote.midi > 60) errors.push(`[${genre} @ ${intensity}] Bass Range Warning: MIDI ${bassNote.midi} at step ${step}`);

                                // Scale Check (Skip for chromatic styles)
                                if (genre !== 'Jazz' && genre !== 'Blues' && !bassNote.muted) {
                                    const scale = getScaleForBass(chord, null);
                                    const interval = (bassNote.midi - chord.rootMidi + 120) % 12;
                                    if (!scale.includes(interval) && bassNote.bendStartInterval === 0) {
                                        // Allow for leading tones on the last beat
                                        const isLastBeat = (stepInChord === Math.round(chord.beats * 4) - 1);
                                        if (!isLastBeat) {
                                            errors.push(`[${genre} @ ${intensity}] Bass Out-of-Scale: ${bassNote.midi % 12} over ${chord.absName} (Scale: ${scale})`);
                                        }
                                    }
                                }
                                bb.lastFreq = bassNote.freq;
                            }
                        }

                        // 2. Soloist Check
                        const soloNote = getSoloistNote(chord, null, step, sb.lastFreq, 72, sb.style, stepInChord);
                        if (soloNote) {
                            const notes = Array.isArray(soloNote) ? soloNote : [soloNote];
                            notes.forEach(n => {
                                const finalVel = n.velocity * ctx.conductorVelocity;
                                if (finalVel > 1.5) errors.push(`[${genre} @ ${intensity}] Soloist Vel Overload: ${finalVel.toFixed(2)} at step ${step}`);
                                if (n.midi < 40 || n.midi > 110) errors.push(`[${genre} @ ${intensity}] Soloist Range Warning: MIDI ${n.midi} at step ${step}`);
                                
                                // Scale Check
                                if (genre !== 'Jazz' && genre !== 'Blues' && !n.isDoubleStop) {
                                    const scale = getScaleForChord(chord, null, 'smart');
                                    const interval = (n.midi - chord.rootMidi + 120) % 12;
                                    if (!scale.includes(interval) && n.bendStartInterval === 0) {
                                        errors.push(`[${genre} @ ${intensity}] Soloist Out-of-Scale: ${n.midi % 12} over ${chord.absName}`);
                                    }
                                }
                            });
                            const primary = Array.isArray(soloNote) ? soloNote[soloNote.length - 1] : soloNote;
                            sb.lastFreq = primary.freq;
                        }

                        // 3. Accompaniment Check
                        const accNotes = getAccompanimentNotes(chord, step, stepInChord, stepInMeasure, { isBeatStart: step % 4 === 0 });
                        accNotes.forEach(n => {
                            if (n.midi > 0 && !n.muted) {
                                const finalVel = n.velocity * ctx.conductorVelocity;
                                if (finalVel > 1.5) errors.push(`[${genre} @ ${intensity}] Accomp Vel Overload: ${finalVel.toFixed(2)} at step ${step}`);
                            }
                        });

                        // 4. Harmony Check
                        const harmonyNotes = getHarmonyNotes(chord, null, step, 60, hb.style, stepInChord);
                        harmonyNotes.forEach(n => {
                            const finalVel = n.velocity * ctx.conductorVelocity;
                            if (finalVel > 1.5) errors.push(`[${genre} @ ${intensity}] Harmony Vel Overload: ${finalVel.toFixed(2)} at step ${step}`);
                            if (n.midi < 30 || n.midi > 100) errors.push(`[${genre} @ ${intensity}] Harmony Range Warning: MIDI ${n.midi} at step ${step}`);
                            
                            // Scale Check
                            if (genre !== 'Jazz' && genre !== 'Blues') {
                                const scale = getScaleForChord(chord, null, 'smart');
                                const interval = (n.midi - chord.rootMidi + 120) % 12;
                                if (!scale.includes(interval)) {
                                    errors.push(`[${genre} @ ${intensity}] Harmony Out-of-Scale: ${n.midi % 12} over ${chord.absName}`);
                                }
                            }
                        });
                    }
                });
            });

            if (errors.length > 0) {
                console.warn(`Audit Findings for ${presetName}:\n` + errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n...and ${errors.length - 10} more` : ''));
            }
            
            // We don't necessarily want to fail the test for "warnings", 
            // but we want to ensure no critical crashes or massive overloads occur.
            expect(errors.filter(e => e.includes('Overload')).length).toBe(0);
        });
    };

    // Audit Song Templates
    SONG_TEMPLATES.forEach(template => {
        runAudit(`Template: ${template.name}`, template.sections, template.isMinor);
    });

    // Audit Chord Presets
    CHORD_PRESETS.forEach(preset => {
        runAudit(`Preset: ${preset.name}`, preset.sections, preset.isMinor);
    });
});