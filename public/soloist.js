import { getFrequency, getMidi } from './utils.js';
import { ctx, gb, sb, hb, arranger } from './state.js';
import { TIME_SIGNATURES, KEY_ORDER } from './config.js';

const CANDIDATE_WEIGHTS = new Float32Array(128);

/**
 * SOLOIST.JS
 * 
 * Refactored implementation focusing on "Expressive Musicality".
 * Features:
 * - Phrasing & Humanization ("Breath" Logic)
 * - Motif Retention & Variation (Smart Transposition)
 * - Harmonic Context (Beat Strength & Tension Cycles)
 * - Dynamic Arcs (Storytelling Velocity)
 * - Blue Note Curls (Soulful Articulation)
 * - Melodic Contour Resolution (Skip-Step Rule)
 */

// --- Constants ---

const RHYTHMIC_CELLS = [
    [1, 0, 1, 0], // 0: 8ths
    [1, 1, 1, 1], // 1: 16ths
    [1, 0, 0, 0], // 2: Quarter
    [1, 1, 1, 0], // 3: Gallop
    [1, 0, 1, 1], // 4: Reverse gallop
    [0, 1, 1, 1], // 5: Offbeat start
    [1, 0, 0, 1], // 6: Syncopated
    [1, 1, 0, 1], // 7: Bebop-esque 1
    [0, 1, 1, 0], // 8: Offbeat syncopation
    [1, 0, 1, 1], // 9: Syncopated 2
    [0, 1, 0, 1], // 10: Pure offbeats (16th offbeats)
    [1, 0, 0, 0, 0, 0, 0, 0], // 11: Half note (if 8 steps used)
    [0, 0, 1, 0], // 12: Single Offbeat 8th (the "And")
    [1, 0, 1, 0, 1, 0], // 13: Triplet-esque (Feel)
    [0, 1, 0, 0]  // 14: Single Syncopated 16th (the "e")
];

const STYLE_CONFIG = {
    scalar: {
        restBase: 0.2, restGrowth: 0.05, cells: [0, 2, 11, 1], registerSoar: 10,
        tensionScale: 0.6, timingJitter: 8, maxNotesPerPhrase: 16,
        doubleStopProb: 0.1, anticipationProb: 0.1, targetExtensions: [2, 9],
        deviceProb: 0.15, allowedDevices: ['run', 'slide', 'guitarDouble'],
        motifProb: 0.3, hookProb: 0.1
    },
    shred: {
        restBase: 0.1, restGrowth: 0.02, cells: [1, 3, 4, 7, 0], registerSoar: 16,
        tensionScale: 0.3, timingJitter: 4, maxNotesPerPhrase: 32,
        doubleStopProb: 0.05, anticipationProb: 0.05, targetExtensions: [2],
        deviceProb: 0.4, allowedDevices: ['run', 'guitarDouble'],
        motifProb: 0.1, hookProb: 0.05
    },
    blues: {
        restBase: 0.6, restGrowth: 0.15, cells: [2, 11, 0, 12, 6], registerSoar: 4,
        tensionScale: 0.8, timingJitter: 25, maxNotesPerPhrase: 5,
        doubleStopProb: 0.35, anticipationProb: 0.3, targetExtensions: [9, 10],
        deviceProb: 0.3, allowedDevices: ['slide', 'enclosure', 'guitarDouble'],
        motifProb: 0.5, hookProb: 0.3
    },
    neo: {
        restBase: 0.45, restGrowth: 0.12, cells: [11, 2, 6, 10, 12, 14], registerSoar: 6,
        tensionScale: 0.7, timingJitter: 25, maxNotesPerPhrase: 8,
        doubleStopProb: 0.15, anticipationProb: 0.45, targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.25, allowedDevices: ['quartal', 'slide', 'guitarDouble'],
        motifProb: 0.4, hookProb: 0.2
    },
    funk: {
        restBase: 0.35, restGrowth: 0.08, cells: [1, 10, 14, 0, 6], registerSoar: 5,
        tensionScale: 0.4, timingJitter: 5, maxNotesPerPhrase: 16,
        doubleStopProb: 0.15, anticipationProb: 0.2, targetExtensions: [9, 13],
        deviceProb: 0.2, allowedDevices: ['slide', 'run'],
        motifProb: 0.3, hookProb: 0.15
    },
    minimal: {
        restBase: 0.75, restGrowth: 0.15, cells: [11, 2, 12, 14], registerSoar: 6,
        tensionScale: 0.95, timingJitter: 35, maxNotesPerPhrase: 3,
        doubleStopProb: 0.0, anticipationProb: 0.25, targetExtensions: [2, 9, 11],
        deviceProb: 0.25, allowedDevices: ['slide'],
        motifProb: 0.7, hookProb: 0.5
    },
    bird: {
        restBase: 0.15, restGrowth: 0.03, cells: [0, 1, 7, 3], registerSoar: 8,
        tensionScale: 0.7, timingJitter: 12, maxNotesPerPhrase: 48,
        doubleStopProb: 0.05, anticipationProb: 0.6, targetExtensions: [2, 5, 6, 9],
        deviceProb: 0.6, allowedDevices: ['enclosure', 'run', 'birdFlurry'],
        motifProb: 0.2, hookProb: 0.1
    },
    disco: {
        restBase: 0.25, restGrowth: 0.06, cells: [0, 2, 5, 10], registerSoar: 12,
        tensionScale: 0.5, timingJitter: 8, maxNotesPerPhrase: 12,
        doubleStopProb: 0.05, anticipationProb: 0.2, targetExtensions: [2, 9],
        deviceProb: 0.1, allowedDevices: ['run'],
        motifProb: 0.4, hookProb: 0.2
    },
    bossa: {
        restBase: 0.4, restGrowth: 0.08, cells: [11, 2, 0, 6, 8], registerSoar: 8,
        tensionScale: 0.7, timingJitter: 15, maxNotesPerPhrase: 8,
        doubleStopProb: 0.08, anticipationProb: 0.35, targetExtensions: [2, 6, 9],
        deviceProb: 0.2, allowedDevices: ['enclosure', 'slide', 'guitarDouble'],
        motifProb: 0.5, hookProb: 0.25
    },
    country: {
        restBase: 0.2, restGrowth: 0.1, cells: [1, 3, 4, 12, 14], registerSoar: 8,
        tensionScale: 0.5, timingJitter: 4, maxNotesPerPhrase: 12,
        doubleStopProb: 0.4, anticipationProb: 0.2, targetExtensions: [2, 4, 9, 11], 
        deviceProb: 0.35, allowedDevices: ['guitarDouble', 'slide', 'run'],
        motifProb: 0.4, hookProb: 0.2
    },
    metal: {
        restBase: 0.1, restGrowth: 0.05, cells: [1, 3, 0], registerSoar: 14,
        tensionScale: 0.4, timingJitter: 2, maxNotesPerPhrase: 32,
        doubleStopProb: 0.05, anticipationProb: 0.05, targetExtensions: [2, 7],
        deviceProb: 0.5, allowedDevices: ['run'],
        motifProb: 0.1, hookProb: 0.05
    }
};

// --- Helpers ---

/**
 * Determines the most appropriate musical scale for a given chord and style.
 */
export function getScaleForChord(chord, nextChord, style) {
    if (style === 'smart') {
        const mapping = { 
            'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 
            'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 
            'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal',
            'Reggae': 'minimal', 'Country': 'country', 'Metal': 'metal', 'Rock/Metal': 'metal'
        };
        style = mapping[gb.genreFeel] || 'scalar';
    }

    const quality = chord.quality;
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    const isDominant = !isMinor && !['dim', 'halfdim'].includes(quality) && !quality.startsWith('maj') && (chord.is7th || ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) || quality.startsWith('7'));
    
    if (sb.tension > 0.7 && isDominant && (gb.genreFeel === 'Jazz' || gb.genreFeel === 'Blues' || style === 'bird')) {
        return [0, 1, 3, 4, 6, 8, 10]; 
    }

    if (style === 'country') {
        const isMinorQualityLocal = ['minor', 'halfdim', 'dim', 'm9', 'm11', 'm13', 'm6'].includes(chord.quality) || (chord.quality.startsWith('m') && !chord.quality.startsWith('maj'));
        if (isMinorQualityLocal) {
            if (chord.quality === 'dim' || chord.quality === 'halfdim') return [0, 1, 3, 5, 6, 8, 10];
            return [0, 2, 3, 5, 7, 9, 10]; 
        }
        return [0, 2, 3, 4, 7, 9, 10].sort((a,b)=>a-b);
    }
    if (style === 'metal') {
        if (chord.quality.startsWith('maj')) return [0, 2, 4, 6, 7, 9, 11]; 
        if (isDominant || chord.quality === 'major') return [0, 1, 4, 5, 7, 8, 10]; 
        return [0, 2, 3, 5, 7, 8, 10]; 
    }

    if (style === 'blues' || style === 'disco' || style === 'funk') {
        if (chord.quality.startsWith('maj') || chord.quality === 'major') {
             let base = [0, 2, 4, 5, 7, 9, 11];
             if (style === 'disco') base = base.filter(i => i !== 5);
             return base;
        }
        const isMinorQualityLocal = ['minor', 'halfdim', 'dim', 'm9', 'm11', 'm13', 'm6'].includes(chord.quality) || (chord.quality.startsWith('m') && !chord.quality.startsWith('maj'));
        if (isMinorQualityLocal) {
            if (chord.quality === 'halfdim' || chord.quality === 'dim') return [0, 1, 3, 5, 6, 8, 10]; 
            return [0, 2, 3, 5, 7, 9, 10]; 
        }
        if (chord.quality === '7#9') return [0, 1, 3, 4, 5, 7, 8, 10];
        let base = (gb.genreFeel === 'Jazz' || style === 'blues') ? [0, 2, 3, 4, 5, 7, 9, 10] : [0, 2, 4, 5, 7, 9, 10];
        if (sb.tension > 0.7 && style !== 'disco') base.push(11);
        return base.sort((a,b)=>a-b);
    }
    
    if (style === 'neo' || style === 'bird') {
        const keyRootIdx = KEY_ORDER.indexOf(arranger.key || 'C');
        const relativeRoot = (chord.rootMidi - keyRootIdx + 120) % 12;
        if (chord.quality.startsWith('maj') || chord.quality === 'major') return [0, 2, 4, 5, 7, 9, 11]; 
        if (chord.quality === 'minor' || ['m9', 'm11', 'm13', 'm6'].includes(chord.quality)) {
            if (relativeRoot === 9 && !arranger.isMinor) return [0, 2, 3, 5, 7, 8, 10];
            return [0, 2, 3, 5, 7, 9, 10]; 
        }
    }

    if (style === 'bossa' && (chord.quality.startsWith('maj') || chord.quality === 'major')) return [0, 2, 4, 6, 7, 9, 11]; 

    switch (chord.quality) {
        case 'maj7#11': return [0, 2, 4, 6, 7, 9, 11];
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'augmaj7': return [0, 2, 4, 6, 8, 9, 11];
        case 'm9': case 'm11': case 'm13': case 'm6': return [0, 2, 3, 5, 7, 9, 10]; 
        case 'sus4': return [0, 2, 5, 7, 9, 10]; 
        case '7alt': return [0, 1, 3, 4, 6, 8, 10];
        case '7#9': return (style === 'funk' || gb.genreFeel === 'Funk') ? [0, 1, 3, 4, 5, 7, 8, 10] : [0, 1, 3, 4, 6, 8, 10];
        case '7b9': case '7b13': return [0, 1, 4, 5, 7, 8, 10];
        case '7#11': return [0, 2, 4, 6, 7, 9, 10]; 
        case '9': case '13': return [0, 2, 4, 5, 7, 9, 10];
    }

    const isMinorQuality = (q) => (q.startsWith('m') && !q.startsWith('maj')) || q.includes('minor') || q.includes('dim') || q.includes('halfdim');
    if (chord.quality === '7' && nextChord) {
        if (((nextChord.rootMidi - chord.rootMidi + 120) % 12 === 5)) {
            if (isMinorQuality(nextChord.quality)) return [0, 1, 4, 5, 7, 8, 10]; 
            return [0, 2, 4, 5, 7, 9, 10]; 
        }
    }

    if (chord.quality === 'minor' || chord.quality.startsWith('m')) {
        if (chord.quality.startsWith('m') && !chord.quality.startsWith('maj')) {
            if (style === 'bird' || gb.genreFeel === 'Jazz' || style === 'neo' || gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Funk' || style === 'bossa' || gb.genreFeel === 'Bossa Nova' || style === 'disco' || gb.genreFeel === 'Afrobeat') {
                return [0, 2, 3, 5, 7, 9, 10]; 
            }
        }
    }

    if (isDominant || chord.quality === 'major') {
        const kRootIdx = KEY_ORDER.indexOf(chord.key || arranger.key);
        const relRoot = (chord.rootMidi - kRootIdx + 120) % 12;
        if (arranger.isMinor && relRoot === 7) return [0, 1, 4, 5, 7, 8, 10];
        if (isDominant) {
            if (relRoot === 2 && !arranger.isMinor) return [0, 2, 4, 6, 7, 9, 10]; 
            if (relRoot === 10 && !arranger.isMinor) return [0, 2, 4, 6, 7, 9, 10];
            return [0, 2, 4, 5, 7, 9, 10]; 
        }
    }

    const keyRootIdx = KEY_ORDER.indexOf(chord.key || arranger.key);
    const keyIntervals = arranger.isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; 
    const keyNotes = keyIntervals.map(i => (keyRootIdx + i) % 12);
    const chordRoot = chord.rootMidi % 12;
    const chordTones = chord.intervals.map(i => (chordRoot + i) % 12);
    if (chordTones.every(note => keyNotes.includes(note))) {
        return keyNotes.map(note => (note - chordRoot + 12) % 12).sort((a, b) => a - b);
    }
    if (chord.quality === 'minor' || (chord.quality.startsWith('m') && !chord.quality.startsWith('maj'))) return [0, 2, 3, 5, 7, 8, 10]; 
    return chord.intervals.includes(11) ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 4, 5, 7, 9, 10];
}

// --- Main Generator ---

/**
 * Generates a soloist note for a specific step.
 */
export function getSoloistNote(currentChord, nextChord, step, prevFreq, baseOctave, style, stepInChord, isPriming, sectionInfo) {
    if (!currentChord) return null;
    
    let activeStyle = style;
    if (activeStyle === 'smart') {
        const mapping = { 'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal', 'Reggae': 'minimal' };
        activeStyle = mapping[gb.genreFeel] || 'scalar';
    }
    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const intensity = ctx.bandIntensity || 0.5;
    const centerMidi = 64; 

    // --- Audit/Benchmarking Path (Deterministic Weight Return) ---
    if (isPriming === 'audit') {
        const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerBeat = tsConfig.stepsPerBeat;
        let targetChord = currentChord;
        if (nextChord && stepInChord >= (currentChord.beats * stepsPerBeat) - 2) {
            targetChord = nextChord;
        }

        const scaleIntervals = getScaleForChord(targetChord, (targetChord === currentChord ? nextChord : null), style);
        const rootMidi = targetChord.rootMidi;
        const scaleTones = scaleIntervals.map(i => rootMidi + i);
        
        // console.log('Audit Scale Check:', { targetRoot: targetChord.rootMidi, scaleIntervals, scaleTones });

        const maturityFactor = Math.min(1.0, (sb.sessionSteps || 0) / 1024);
        sb.smoothedTension = (sb.smoothedTension || 0) * 0.8 + (sb.tension || 0) * 0.2;
        const registerBuildOffset = -4 * (1.0 - maturityFactor);
        const dynamicCenter = centerMidi + registerBuildOffset + Math.floor(sb.smoothedTension * config.registerSoar * maturityFactor * (0.5 + intensity));
        const lastMidi = prevFreq ? getMidi(prevFreq) : dynamicCenter;
        const lastInterval = sb.lastInterval || 0;
        const totalSteps = arranger.totalSteps || 1;
        const loopStep = step % totalSteps;
        const stepsUntilSectionEnd = (sectionInfo) ? (sectionInfo.sectionEnd - loopStep) : 1000;
        const isSectionEnding = stepsUntilSectionEnd > 0 && stepsUntilSectionEnd <= stepsPerMeasure;

        CANDIDATE_WEIGHTS.fill(0);
        for (let m = 0; m <= 127; m++) {
            const pc = (m % 12 + 12) % 12;
            const interval = (pc - (rootMidi % 12) + 12) % 12;
            
            const inScale = scaleTones.some(st => (st % 12 + 12) % 12 === pc);

            if (!inScale) continue; 
            let weight = 100;
            const dist = Math.abs(m - lastMidi);
            if (Math.abs(lastInterval) > 4) {
                if (((lastInterval > 0 && m - lastMidi < 0) || (lastInterval < 0 && m - lastMidi > 0)) && dist > 0 && dist <= 2) weight += 2000;
            }
            if ([3, 4, 10, 11].includes(interval)) weight += (activeStyle === 'minimal' ? 500 : 800);
            if (interval === 0) weight += 100;
            if (isSectionEnding && stepsUntilSectionEnd <= 4) {
                if (interval === 0) weight += 3000;
                if ([3, 4, 10, 11].includes(interval)) weight += 1500;
            }
            if (sb.qaState === 'Answer') {
                if (interval === 0) weight += 200;
                if ([3, 4, 10, 11].includes(interval)) weight += 100;
            }
            if (dist === 0) {
                weight -= 800;
                if (lastInterval === 0) weight -= 1000;
            }
            if (dist > 0 && dist <= 2) weight += 100;
            if (m - dynamicCenter > 0) weight -= ((m - dynamicCenter) * 3);
            if (Math.abs(m - dynamicCenter) > 7) weight -= (Math.abs(m - dynamicCenter) - 7) * 2;
            CANDIDATE_WEIGHTS[m] = Math.max(0.1, weight);
            
            // if (m === 65 || m === 84) console.log(`Audit MIDI ${m}:`, { weight: CANDIDATE_WEIGHTS[m], pc, interval, dynamicCenter, dist });
        }
        return CANDIDATE_WEIGHTS;
    }
    
    if (!isPriming) sb.sessionSteps = (sb.sessionSteps || 0) + 1;
    
    const maturityFactor = Math.min(1.0, (sb.sessionSteps || 0) / 1024);
    const effectiveIntensity = Math.min(1.0, intensity + (maturityFactor * 0.2));

    if (sb.deviceBuffer && sb.deviceBuffer.length > 0) {
        const devNote = sb.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        sb.busySteps = (primaryNote.durationSteps || 1) - 1;
        sb.notesInPhrase++;
        if (!primaryNote.isDoubleStop) sb.lastFreq = getFrequency(primaryNote.midi);
        return devNote;
    }
    if (sb.busySteps > 0) { sb.busySteps--; return null; }
    
    const cycleStep = step % (stepsPerMeasure * 4);
    const measureIndex = Math.floor(cycleStep / stepsPerMeasure);
    sb.tension = Math.max(0, Math.min(1, (measureIndex / 4) * (0.5 + intensity * 0.5)));

    const totalSteps = arranger.totalSteps || 1;
    const loopStep = step % totalSteps;
    const stepsUntilSectionEnd = (sectionInfo) ? (sectionInfo.sectionEnd - loopStep) : 1000;
    const isSectionEnding = stepsUntilSectionEnd > 0 && stepsUntilSectionEnd <= stepsPerMeasure;

    if (typeof sb.currentPhraseSteps === 'undefined' || (step === 0 && !sb.isResting)) {
        sb.currentPhraseSteps = 0; sb.notesInPhrase = 0; sb.qaState = 'Question'; sb.isResting = true; return null; 
    }
    
    const phraseBars = sb.currentPhraseSteps / stepsPerMeasure;
    let restProb = (config.restBase * (2.0 - effectiveIntensity * 1.5)) + (phraseBars * config.restGrowth);
    
    if (isSectionEnding) {
        const progress = 1.0 - (stepsUntilSectionEnd / stepsPerMeasure); 
        if (!sb.isResting) {
            if (progress > 0.5 && effectiveIntensity < 0.8) restProb += (progress * 0.5);
            if (stepsUntilSectionEnd <= 2 && effectiveIntensity < 0.9) restProb = 1.0;
        } else if (stepsUntilSectionEnd > 2) restProb += 0.2; 
    }

    if (hb.enabled && hb.rhythmicMask > 0) {
        const hasHarmonyHit = (hb.rhythmicMask >> measureStep) & 1;
        if (hasHarmonyHit && !sb.isResting) restProb += (0.2 * hb.complexity);
    }

    restProb = Math.max(0.05, restProb - (maturityFactor * 1.0));
    if (sb.notesInPhrase >= config.maxNotesPerPhrase) restProb += 0.4;
    
    if (sb.isResting) {
        if (Math.random() < (0.4 + (intensity * 0.3))) { 
            sb.isResting = false; sb.currentPhraseSteps = 0; sb.notesInPhrase = 0;
            sb.qaState = sb.qaState === 'Question' ? 'Answer' : 'Question';
            const currentRoot = currentChord.rootMidi % 12;
            const motifRoot = sb.motifRoot !== undefined ? sb.motifRoot : currentRoot;
            
            // Probabilistic memory flush on chord change to prevent harmonic latching
            if (currentRoot !== sb.motifRoot && Math.random() < 0.3) {
                sb.motifBuffer = [];
                sb.motifReplayCount = 0;
            }

            let distinctPitchesCount = 0;
            if (sb.motifBuffer && sb.motifBuffer.length > 0) {
                const distinctPitches = new Set(sb.motifBuffer.map(n => Array.isArray(n) ? n[0].midi : n.midi));
                distinctPitchesCount = distinctPitches.size;
            }

            if (sb.motifBuffer && sb.motifBuffer.length > 0 && distinctPitchesCount > 1 && Math.random() < config.motifProb && !((Math.abs(currentRoot - motifRoot) % 12) !== 0 && (Math.abs(currentRoot - motifRoot) % 12) !== 5 && (Math.abs(currentRoot - motifRoot) % 12) !== 7) && (sb.motifReplayCount || 0) <= 3) {
                sb.isReplayingMotif = true; sb.motifReplayIndex = 0; sb.motifReplayCount = (sb.motifReplayCount || 0) + 1;
            } else {
                sb.isReplayingMotif = false; sb.motifBuffer = []; sb.motifRoot = currentRoot; sb.motifReplayCount = 0;
            }
        } else return null;
    }
    if (!sb.isResting && sb.currentPhraseSteps > 4 && Math.random() < restProb) {
        sb.isResting = true; sb.currentPhraseSteps = 0; return null;
    }
    sb.currentPhraseSteps++;

    if (sb.isReplayingMotif) {
        const motifNote = sb.motifBuffer[sb.motifReplayIndex++];
        if (sb.motifReplayIndex >= sb.motifBuffer.length) sb.isReplayingMotif = false;
        if (motifNote) {
            const currentRoot = currentChord.rootMidi % 12;
            const motifRoot = sb.motifRoot !== undefined ? sb.motifRoot : currentRoot;
            let shift = (currentRoot - motifRoot + 12) % 12;
            if (shift > 6) shift -= 12;
            let res = Array.isArray(motifNote) ? motifNote.map(n => ({ ...n, midi: n.midi + shift, bendStartInterval: n.bendStartInterval || 0 })) : { ...motifNote, midi: motifNote.midi + shift, bendStartInterval: motifNote.bendStartInterval || 0 };
            const primary = Array.isArray(res) ? res[0] : res;
            const scaleIntervals = getScaleForChord(currentChord, null, style);
            if (!scaleIntervals.includes((primary.midi - currentRoot + 120) % 12)) {
                const nearest = scaleIntervals.reduce((prev, curr) => Math.abs(curr - ((primary.midi - currentRoot + 120) % 12)) < Math.abs(prev - ((primary.midi - currentRoot + 120) % 12)) ? curr : prev);
                const nudge = nearest - ((primary.midi - currentRoot + 120) % 12);
                if (Array.isArray(res)) res = res.map(n => ({ ...n, midi: n.midi + nudge, bendStartInterval: (n.bendStartInterval || 0) + nudge }));
                else { res.midi += nudge; res.bendStartInterval = (res.bendStartInterval || 0) + nudge; }
            }
            sb.busySteps = (primary.durationSteps || 1) - 1; sb.notesInPhrase++; return res;
        }
    }

    if (stepInBeat === 0) {
        let pool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));
        sb.currentCell = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!sb.currentCell || sb.currentCell[stepInBeat] !== 1) return null;                
    sb.notesInPhrase++;

    let targetChord = currentChord;
    if (nextChord && stepInChord >= (currentChord.beats * stepsPerBeat) - 2 && Math.random() < (config.anticipationProb || 0)) targetChord = nextChord;

                    const scaleIntervals = getScaleForChord(targetChord, (targetChord === currentChord ? nextChord : null), style);

                    const rootMidi = targetChord.rootMidi;

                    const scaleTones = scaleIntervals.map(i => rootMidi + i);    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    
    sb.smoothedTension = (sb.smoothedTension || 0) * 0.8 + (sb.tension || 0) * 0.2;
    const registerBuildOffset = -4 * (1.0 - maturityFactor);
    const dynamicCenter = centerMidi + registerBuildOffset + Math.floor(sb.smoothedTension * config.registerSoar * maturityFactor * (0.5 + intensity));
    const lastMidi = prevFreq ? getMidi(prevFreq) : dynamicCenter;
    const minMidi = Math.max(0, Math.min(dynamicCenter - 12, lastMidi - 14)); 
    const maxMidi = Math.min(127, Math.max(dynamicCenter + 12, lastMidi + 14));

    let totalWeight = 0;
    const lastInterval = sb.lastInterval || 0; 
    const isResolvingSkip = Math.abs(lastInterval) > 4;

    for (let m = minMidi; m <= maxMidi; m++) {
        CANDIDATE_WEIGHTS[m] = 0; 
        const pc = (m % 12 + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        if (!scaleTones.some(st => (st % 12 + 12) % 12 === pc)) continue; 

        let weight = 100;
        const dist = Math.abs(m - lastMidi);
        if (isResolvingSkip) {
            if (((lastInterval > 0 && m - lastMidi < 0) || (lastInterval < 0 && m - lastMidi > 0)) && dist > 0 && dist <= 2) weight += 2000; 
            else if (!((lastInterval > 0 && m - lastMidi < 0) || (lastInterval < 0 && m - lastMidi > 0)) && dist > 2) weight -= 10000; 
        }

        const isGuideTone = [3, 4, 10, 11].includes(interval);
        const isRoot = interval === 0;

        if (isRoot) weight += 50;
        if (isGuideTone) weight += (activeStyle === 'minimal' ? 500 : 800);
        
        // --- RESTORED: Satisfying Resolution Logic ---
        // Half-step resolutions between chords are high-value melodic movement
        const isChordChanging = stepInChord === 0;
        if (isChordChanging && dist === 1 && chordTones.some(ct => (ct % 12 + 12) % 12 === pc)) {
            weight += (activeStyle === 'minimal' ? 2000 : 500); 
        }

        if (isSectionEnding && stepsUntilSectionEnd <= 4) {
            if (isRoot) weight += 3000;
            if (isGuideTone) weight += 1500;
        }
        if (stepInBeat === 0) {
            if (chordTones.some(ct => (ct % 12 + 12) % 12 === pc)) { 
                weight += 15; 
                if (isGuideTone) weight += 30; 
                // Boost movement away from the previous note on a new downbeat
                if (dist > 0) weight += 100;
            } else weight -= 15;
        }
        if (sb.qaState === 'Answer') { 
            if (isRoot) weight += (activeStyle === 'minimal' ? 200 : 200); 
            if (isGuideTone) weight += (activeStyle === 'minimal' ? 100 : 100); 
        }
        if (dist === 0) {
            weight -= 800;
            if (lastInterval === 0) weight -= 1000;
        }
        if (dist > 0 && dist <= 2) weight += (100 + (ctx.bpm / 100) * 20); 
        else if (dist > 7) weight -= 500; 

        if (m - dynamicCenter > 0) weight -= ((m - dynamicCenter) * 3); 
        if (Math.abs(m - dynamicCenter) > 7) weight -= (Math.abs(m - dynamicCenter) - 7) * 2; 
        
        weight = Math.max(0.1, weight);
        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = lastMidi;
    if (sb.deterministic) {
        let maxW = -1;
        for (let m = minMidi; m <= maxMidi; m++) { if (CANDIDATE_WEIGHTS[m] > maxW) { maxW = CANDIDATE_WEIGHTS[m]; selectedMidi = m; } }
    } else {
        let randomVal = Math.random() * totalWeight;
        for (let m = minMidi; m <= maxMidi; m++) { const w = CANDIDATE_WEIGHTS[m]; if (w > 0) { randomVal -= w; if (randomVal <= 0) { selectedMidi = m; break; } } }
    }
    sb.lastInterval = selectedMidi - lastMidi;

    if (stepInBeat === 0 && Math.random() < (config.deviceProb * 0.7 * (0.2 + maturityFactor * 0.8))) {
        const deviceType = config.allowedDevices ? config.allowedDevices[Math.floor(Math.random() * config.allowedDevices.length)] : null;
        if (deviceType === 'birdFlurry') {
            let flurry = []; let curr = selectedMidi + 3; 
            for (let i = 0; i < 4; i++) {
                let n = curr - 1; while (!scaleIntervals.includes((n - rootMidi + 120) % 12) && n > curr - 5) n--;
                flurry.push({ midi: n, velocity: 0.8, durationSteps: 1, style }); curr = n;
            }
            sb.deviceBuffer = flurry; const first = sb.deviceBuffer.shift(); sb.busySteps = (first.durationSteps || 1) - 1; sb.motifBuffer.push(first); return { ...first, timingOffset: 0 };
        }
        if (deviceType === 'run') {
            const sz = Math.random() < 0.5 ? 1 : 2;
            sb.deviceBuffer = [ { midi: selectedMidi - sz, velocity: 0.8, durationSteps: 1, style }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            const res = { midi: selectedMidi - (sz * 2), velocity: 0.7, durationSteps: 1, style };
            sb.busySteps = (res.durationSteps || 1) - 1; sb.motifBuffer.push(res); return res;
        }
        if (deviceType === 'enclosure') {
            sb.deviceBuffer = [ { midi: selectedMidi - 1, velocity: 0.8, durationSteps: 1, style }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            let above = selectedMidi + 1; for(let d=1; d<=2; d++) { if (scaleIntervals.includes((selectedMidi + d - rootMidi + 120) % 12)) { above = selectedMidi + d; break; } }
            const res = { midi: above, velocity: 0.8, durationSteps: 1, style };
            sb.busySteps = (res.durationSteps || 1) - 1; sb.motifBuffer.push(res); return res;
        }
        if (deviceType === 'slide') {
            sb.deviceBuffer = [ { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            const res = { midi: selectedMidi - 1, velocity: 0.7, durationSteps: 1, style };
            sb.busySteps = (res.durationSteps || 1) - 1; sb.motifBuffer.push(res); return res;
        }
        if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && sb.doubleStops) {
            const res = [{ midi: selectedMidi + (style === 'blues' || style === 'scalar' ? 5 : 4), velocity: 0.8, durationSteps: 1, style, isDoubleStop: true }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style, isDoubleStop: false }];
            sb.busySteps = 0; sb.motifBuffer.push(res); return res;
        }
    }

    let notes = [];
    if (sb.doubleStops && Math.random() < (config.doubleStopProb + (maturityFactor * 0.2)) * (stepInBeat === 2 ? 1.2 : 0.6) * (0.5 + maturityFactor * 0.5)) {
        notes.push({ midi: selectedMidi + [5, 7, 9, 12][Math.floor(Math.random() * 4)], velocity: 0.8, isDoubleStop: true });
    }

    sb.lastFreq = getFrequency(selectedMidi);
    let durationSteps = 1; let bendStartInterval = 0;
    if ((stepInBeat === 0 || (stepInBeat === 2 && Math.random() < 0.3)) && (activeStyle === 'neo' || activeStyle === 'blues' || activeStyle === 'minimal' || activeStyle === 'bossa')) durationSteps = Math.random() < (0.4 + maturityFactor * 0.2) ? 8 : 4;
    else if (activeStyle === 'scalar' && stepInBeat === 0 && Math.random() < (0.15 + maturityFactor * 0.1)) durationSteps = 4; 

    if ((selectedMidi % 12 === (targetChord.rootMidi % 12) || ([3, 4, 10, 11].includes((selectedMidi % 12 - (targetChord.rootMidi % 12) + 12) % 12) && activeStyle === 'minimal')) && Math.abs(lastMidi - selectedMidi) === 1 && Math.random() < (0.4 + intensity * 0.3)) bendStartInterval = Math.random() < 0.3 ? 2 : 1;
    else if (durationSteps >= 4 && Math.random() < (0.3 + maturityFactor * 0.2)) bendStartInterval = Math.random() < 0.7 ? 1 : 2;

    const result = { midi: selectedMidi, velocity: 0.8, durationSteps, bendStartInterval, ccEvents: [], timingOffset: 0, style: activeStyle, isDoubleStop: false };
    if (durationSteps > 1) sb.busySteps = durationSteps - 1;
    const finalResult = (notes.length > 0 && sb.doubleStops) ? [...notes.map(n => ({...result, ...n})), result] : result;
    if (!sb.isReplayingMotif) { sb.motifBuffer.push(finalResult); if (sb.motifBuffer.length > 16) sb.motifBuffer.shift(); sb.motifRoot = targetChord.rootMidi % 12; }
    return finalResult;
}
