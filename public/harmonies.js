import { getScaleForChord } from './soloist.js';
import { getBestInversion } from './chords.js';
import { ctx, gb, cb, hb, sb, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getMidi } from './utils.js';

/**
 * HARMONIES.JS
 */

// Internal memory for motif consistency
const motifCache = new Map(); 
let lastPlayedStep = -1;

/**
 * Clears the internal motif memory. Used for section changes or testing.
 */
export function clearHarmonyMemory() {
    motifCache.clear();
    hb.lastMidis = [];
    lastPlayedStep = -1;
    sb.motifBuffer = [];
    sb.motifRoot = undefined;
    sb.motifReplayCount = 0;
    sb.isReplayingMotif = false;
}

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(chord, nextChord, step, octave, style, stepInChord, soloistResult = null) {
    if (!chord) return [];

    // Internal Style Config (Inlined for TDZ safety)
    const STYLE_CONFIG = {
        horns: { density: 2, rhythmicStyle: 'stabs', timingJitter: 0.005, velocity: 0.85, octaveOffset: 0, padProb: 0.2 },
        strings: { density: 2, rhythmicStyle: 'pads', timingJitter: 0.02, velocity: 0.6, octaveOffset: 0, padProb: 0.9 },
        organ: { density: 3, rhythmicStyle: 'stabs', timingJitter: 0.015, velocity: 1.0, octaveOffset: 0, padProb: 0.4 },
        plucks: { density: 2, rhythmicStyle: 'stabs', timingJitter: 0.002, velocity: 0.7, octaveOffset: 24, padProb: 0 },
        counter: { density: 1, rhythmicStyle: 'pads', timingJitter: 0.03, velocity: 0.75, octaveOffset: -12, padProb: 0.1 },
        smart: { density: 2, rhythmicStyle: 'auto', timingJitter: 0.008, velocity: 0.75, octaveOffset: 0, padProb: 0.5 }
    };

    const RHYTHMIC_PATTERNS = {
        'Funk': [[1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
        'Jazz': [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        'Pop': [[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
        'Neo-Soul': [[0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
        'Bossa Nova': [[1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]],
        'Disco': [[0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]],
        'Rock': [[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
        'Metal': [[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
        'Reggae': [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]],
        'Country': [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]],
        'Acoustic': [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]],
        'Hip Hop': [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]]
    };

    if (ctx.bandIntensity < 0.22) return [];
    const isChordStart = stepInChord === 0;
    if (lastPlayedStep !== -1 && step === lastPlayedStep + 1 && soloistResult) return [];

    const notes = [];
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const sectionId = chord.sectionId || 'default';
    const feel = gb.genreFeel;
    
    let activeStyle = style;
    if (style === 'smart') {
        if (feel === 'Blues') activeStyle = 'organ';
        else if (feel === 'Jazz' || feel === 'Bossa Nova') activeStyle = 'counter';
        else if (feel === 'Disco' || feel === 'Hip Hop') activeStyle = 'plucks';
        else if (feel === 'Funk' || feel === 'Metal') activeStyle = 'horns';
        else activeStyle = 'strings';
    }

    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.smart;
    let rhythmicStyle = config.rhythmicStyle;
    if (rhythmicStyle === 'auto') {
        const isPadGenre = (feel === 'Rock' || feel === 'Acoustic' || feel === 'Neo-Soul');
        rhythmicStyle = isPadGenre ? 'pads' : 'stabs';
    }

    const isSoloistBusy = sb.enabled && !sb.isResting && sb.notesInPhrase > 2;
    if (isSoloistBusy) rhythmicStyle = 'pads';

    if (!motifCache.has(sectionId)) {
        const genrePatterns = RHYTHMIC_PATTERNS[feel] || RHYTHMIC_PATTERNS['Pop'];
        let hash = 0;
        for (let i = 0; i < sectionId.length; i++) { hash = ((hash << 5) - hash) + sectionId.charCodeAt(i); hash |= 0; }
        const seed = Math.abs(hash);
        const patternIdx = seed % genrePatterns.length;
        const pattern = [...(genrePatterns[patternIdx] || genrePatterns[0])];
        const responseSeed = Math.abs(((seed << 13) | (seed >> 19)) ^ 0x55555555);
        const motionSeed = Math.abs(((seed << 17) | (seed >> 15)) ^ 0xAAAAAAAA);

        const isRhythmic = ['Funk', 'Reggae', 'Disco', 'Jazz'].includes(feel);
        if (isRhythmic) {
            for (let i = 0; i < 16; i++) {
                const snareHit = (gb.snareMask >> i) & 1;
                const chordHit = (cb.rhythmicMask >> i) & 1;
                if (snareHit && ctx.bandIntensity > 0.6 && Math.random() < 0.4) pattern[i] = 1;
                if (chordHit && pattern[i] === 1 && Math.random() < 0.7) pattern[i] = 0;
            }
        }

        let rhythmicMask = 0;
        for (let i = 0; i < 16; i++) { if (pattern[i] === 1) rhythmicMask |= (1 << i); }

        motifCache.set(sectionId, {
            patternIdx: patternIdx,
            intervals: [0, 4, 7],
            responseMask: responseSeed & 0xFFFF,
            motionMask: motionSeed & 0xFFFF,
            rhythmicMask: rhythmicMask,
            pattern: pattern
        });
    }
    const motif = motifCache.get(sectionId);
    if (hb.rhythmicMask !== motif.rhythmicMask) hb.rhythmicMask = motif.rhythmicMask;

    let shouldPlay = false;
    let durationSteps = 1;
    let isLatched = false;
    let isMovement = false;

    if (gb.enabled && gb.fillActive && step % 4 === 0) {
        const fillStep = step - gb.fillStartStep;
        if (fillStep < gb.fillLength) { shouldPlay = true; durationSteps = 4; isMovement = true; }
    }

    if (sb.enabled && sb.isReplayingMotif && ctx.bandIntensity > 0.4 && soloistResult) {
        const stepInCell = step % 4;
        const isStrongStep = stepInCell === 0 || (stepInCell === 2 && ctx.bandIntensity > 0.7);
        const hasSoloNote = Array.isArray(soloistResult) ? soloistResult.length > 0 : !!soloistResult;
        if (hasSoloNote && isStrongStep) { shouldPlay = true; durationSteps = 2; isLatched = true; }
    }

    if (!shouldPlay && sb.enabled && sb.isResting) {
        const baseProb = feel === 'Jazz' ? 0.45 : (feel === 'Funk' || feel === 'Disco' ? 0.35 : 0.2);
        const responseProb = baseProb * hb.complexity; 
        const isResponseStep = [6, 7, 10, 14].includes(measureStep);
        const bit = (motif.responseMask >> (measureStep % 16)) & 1;
        if (isResponseStep && bit && (measureStep / 16) < responseProb + 0.2) { shouldPlay = true; durationSteps = 2; isMovement = true; }
    }

    if (!shouldPlay && rhythmicStyle === 'pads') {
        let motionProb = (ctx.bandIntensity - 0.3) * 0.6;
        if (activeStyle === 'counter') motionProb = 0.8;
        const isMotionStep = (measureStep === 8 || measureStep === 12);
        const bit = (motif.motionMask >> (measureStep % 16)) & 1;
        const isCounterMove = activeStyle === 'counter' && (measureStep % 4 === 0);
        if ((isMotionStep && bit && (measureStep / 16) < motionProb + 0.1) || isCounterMove) {
            shouldPlay = true; durationSteps = 4; isMovement = true;
        }
    }

    let isAnticipating = false;
    const isJazzy = feel === 'Jazz' || style === 'horns' || activeStyle === 'counter';
    if (!shouldPlay && nextChord && measureStep === stepsPerMeasure - 1) {
        const anticipationProb = (isJazzy ? 0.3 : 0.1) * hb.complexity * ctx.bandIntensity;
        if (Math.random() < anticipationProb) { shouldPlay = true; durationSteps = 2; isAnticipating = true; }
    }

    let isApproach = false;
    if (!shouldPlay && nextChord && measureStep === stepsPerMeasure - 1 && rhythmicStyle !== 'pads') {
        const approachProb = (isJazzy ? 0.5 : 0.15) * hb.complexity;
        if (Math.random() < approachProb) { shouldPlay = true; durationSteps = 1; isApproach = true; }
    }

    if (!shouldPlay) {
        if (rhythmicStyle === 'pads') {
            if (stepInChord === 0 || measureStep === 0) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
            }
        } else {
            const pattern = motif.pattern;
            if (pattern && pattern[measureStep] === 1) { shouldPlay = true; durationSteps = 2; }
        }
    }

    if (!shouldPlay) return [];

    const targetChord = isAnticipating ? nextChord : chord;
    const rootMidi = targetChord.rootMidi;
    const baseDensity = config.density || 2;
    let density = Math.max(1, Math.floor(baseDensity * (0.4 + ctx.bandIntensity * 0.3 + hb.complexity * 0.3)));
    if (isLatched) density = Math.max(density, 1 + Math.min(1, Math.floor(sb.sessionSteps / 64)));

    let intervals = [0, 4, 7]; 
    if (isApproach && nextChord) {
        const nextRoot = nextChord.rootMidi % 12;
        const targetPC = Math.random() > 0.3 ? nextRoot : (nextRoot + 7) % 12;
        const approachPC = (targetPC + (Math.random() > 0.5 ? 1 : 11)) % 12;
        intervals = [(approachPC - (rootMidi % 12) + 12) % 12];
        density = 1;
    } else if (isMovement) {
        density = Math.min(density, 2);
        intervals = [targetChord.intervals?.[1] || 4];
    } else {
        intervals = targetChord.intervals || [0, 4, 7];
    }

    const isDisco = feel === 'Disco';
    if (isDisco && ctx.bandIntensity > 0.7) density = Math.max(density, 2);
    const cycleMeasure = Math.floor(step / stepsPerMeasure) % 4;
    const liftShift = isDisco ? (cycleMeasure * 2) : 0;
    if (isDisco && ctx.bandIntensity > 0.6 && rhythmicStyle === 'stabs' && !isLatched) intervals = [intervals[0], intervals[0] + 12];

    const currentMidis = getBestInversion(rootMidi, intervals, hb.lastMidis, stepInChord === 0, octave, 50, 79);    
    const soloistMidi = sb.enabled ? getMidi(sb.lastFreq) : 0;
    let finalOctaveShift = 0;
    if ((isChordStart || measureStep === 0) && soloistMidi > 0 && currentMidis.some(m => Math.abs(m - soloistMidi) < 7)) {
        if (currentMidis[0] > 48) finalOctaveShift = -12;
    }

    if (currentMidis.length > 0) lastPlayedStep = step;
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);
    
    if (rhythmicStyle === 'stabs') {
        if (durationSteps > 1 && durationSteps < 4) durationSteps = 2;
        else if (durationSteps >= 4) durationSteps = 4;
    }

    const pocketOffset = hb.pocketOffset || 0;
    const styleOffset = config.octaveOffset || 0;
    const finalMidisForMemory = [];
    const tones = targetChord.intervals || [0, 4, 7];

    for (let i = 0; i < currentMidis.length; i++) {
        const midi = currentMidis[i];
        let finalMidi = midi + liftShift + finalOctaveShift + styleOffset;
        if (!isApproach) {
            const pc = (finalMidi % 12 + 12) % 12;
            const relPC = (pc - (rootMidi % 12) + 12) % 12;
            let inChord = (relPC === 2 || relPC === 9);
            if (!inChord) { for (let t = 0; t < tones.length; t++) { if (tones[t] === relPC) { inChord = true; break; } } }
            if (!inChord) {
                let nearestRel = tones[0]; let minDelta = 12;
                for (let t = 0; t < tones.length; t++) {
                    const delta = Math.abs(tones[t] - relPC);
                    if (delta < minDelta) { minDelta = delta; nearestRel = tones[t]; }
                }
                finalMidi += (nearestRel - relPC);
            }
        }
        
        const lastMidi = (hb.lastMidis || [])[i] || (hb.lastMidis || [])[0];
        const intensity = ctx.bandIntensity;
        let slideInterval = 0, slideDuration = 0, vibrato = { rate: 0, depth: 0 };

        if (feel === 'Neo-Soul') {
            if (lastMidi && Math.abs(finalMidi - lastMidi) < 5 && Math.abs(finalMidi - lastMidi) > 0 && Math.random() < intensity) {
                slideInterval = lastMidi - finalMidi; slideDuration = 0.1 + (intensity * 0.1);
            }
            if (durationSteps >= 4 && intensity > 0.4) vibrato = { rate: 3.5, depth: 5 + (intensity * 5) };
        } else if (feel === 'Jazz' || feel === 'Blues') {
            if (Math.random() < (0.2 + hb.complexity * 0.3)) { slideInterval = -1; slideDuration = 0.05 + (intensity * 0.03); }
            if (durationSteps >= 4 && intensity > 0.5) vibrato = { rate: 5.0, depth: 5 + (intensity * 10) };
        }

        const baseVol = config.velocity * (0.8 + Math.random() * 0.2);
        const stagger = (i - (currentMidis.length - 1) / 2) * 0.005;
        let finalOffset = pocketOffset + stagger + (Math.random() * config.timingJitter);
        if ((isAnticipating || isApproach) && finalOffset > 0) finalOffset = -0.005 - (Math.random() * 0.010); 

        notes.push({
            midi: finalMidi, velocity: baseVol * (isLatched ? 1.05 : 1.0) * polyphonyComp,
            durationSteps: Math.max(0.1, durationSteps + (Math.random() - 0.5) * 0.1),
            timingOffset: finalOffset, style: activeStyle, isLatched: isLatched, isChordStart: true, 
            killFade: isApproach ? 0.005 : 0.05, slideInterval, slideDuration, vibrato
        });
        finalMidisForMemory.push(finalMidi);
    }

    hb.lastMidis = finalMidisForMemory;
    return notes;
}
