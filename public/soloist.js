import { getFrequency, getMidi } from './utils.js';
import { sb, cb, ctx, arranger, gb } from './state.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';

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

const LICK_LIBRARY = {
    blues: [
        { name: 'The Box', notes: [{o:0, i:3, d:2}, {o:2, i:5, d:2}, {o:4, i:0, d:4}] },
        { name: 'Soul Slide', notes: [{o:0, i:7, d:1}, {o:1, i:6, d:1}, {o:2, i:5, d:2}, {o:4, i:3, d:4}] },
        { name: 'Root Pivot', notes: [{o:0, i:0, d:2}, {o:2, i:10, d:2}, {o:4, i:0, d:4}] }
    ],
    jazz: [
        { name: 'ii-V Enclosure', notes: [{o:0, i:2, d:1}, {o:1, i:1, d:1}, {o:2, i:0, d:2}] },
        { name: 'Arp Up', notes: [{o:0, i:0, d:2}, {o:2, i:4, d:2}, {o:4, i:7, d:2}, {o:6, i:11, d:2}] }
    ],
    rock: [
        { name: 'Pentatonic Run', notes: [{o:0, i:7, d:1}, {o:1, i:5, d:1}, {o:2, i:3, d:1}, {o:3, i:0, d:5}] },
        { name: 'Octave Jump', notes: [{o:0, i:0, d:2}, {o:4, i:12, d:4}] }
    ],
    disco: [
        { name: 'Octave Pump', notes: [{o:0, i:0, d:2}, {o:2, i:12, d:2}, {o:4, i:0, d:2}, {o:6, i:12, d:2}] },
        { name: 'Syncopated Triad', notes: [{o:1, i:4, d:1}, {o:3, i:7, d:1}, {o:5, i:12, d:3}] }
    ],
    bird: [
        { name: 'Root Enclosure', notes: [{o:0, i:2, d:1}, {o:1, i:-1, d:1}, {o:2, i:0, d:2}] },
        { name: '5th Enclosure', notes: [{o:0, i:8, d:1}, {o:1, i:6, d:1}, {o:2, i:7, d:2}] }
    ],
    funk: [
        { name: 'Horn Line', notes: [{o:0, i:7, d:2}, {o:2, i:9, d:2}, {o:4, i:10, d:2}, {o:6, i:0, d:2}] }
    ],
    neo: [
        { name: 'Quartal Rise', notes: [{o:0, i:0, d:2}, {o:2, i:5, d:2}, {o:4, i:10, d:4}] }
    ]
};

const STYLE_CONFIG = {
    scalar: {
        restBase: 0.2, restGrowth: 0.05, cells: [0, 2, 11, 1], registerSoar: 10,
        tensionScale: 0.6, timingJitter: 8, maxNotesPerPhrase: 16,
        doubleStopProb: 0.1, anticipationProb: 0.1, targetExtensions: [2, 9],
        deviceProb: 0.15, allowedDevices: ['run', 'slide', 'guitarDouble']
    },
    shred: {
        restBase: 0.1, restGrowth: 0.02, cells: [1, 3, 4, 7, 0], registerSoar: 16,
        tensionScale: 0.3, timingJitter: 4, maxNotesPerPhrase: 32,
        doubleStopProb: 0.05, anticipationProb: 0.05, targetExtensions: [2],
        deviceProb: 0.4, allowedDevices: ['run', 'guitarDouble']
    },
    blues: {
        restBase: 0.6, restGrowth: 0.15, cells: [2, 11, 0, 12, 6], registerSoar: 4,
        tensionScale: 0.8, timingJitter: 25, maxNotesPerPhrase: 5,
        doubleStopProb: 0.35, anticipationProb: 0.3, targetExtensions: [9, 10],
        deviceProb: 0.3, allowedDevices: ['slide', 'enclosure', 'guitarDouble']
    },
    neo: {
        restBase: 0.45, restGrowth: 0.12, cells: [11, 2, 6, 10, 12, 14], registerSoar: 6,
        tensionScale: 0.7, timingJitter: 25, maxNotesPerPhrase: 8,
        doubleStopProb: 0.15, anticipationProb: 0.45, targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.25, allowedDevices: ['quartal', 'slide', 'guitarDouble']
    },
    funk: {
        restBase: 0.35, restGrowth: 0.08, cells: [1, 10, 14, 0, 6], registerSoar: 5,
        tensionScale: 0.4, timingJitter: 5, maxNotesPerPhrase: 16,
        doubleStopProb: 0.15, anticipationProb: 0.2, targetExtensions: [9, 13],
        deviceProb: 0.2, allowedDevices: ['slide', 'run']
    },
    minimal: {
        restBase: 0.65, restGrowth: 0.2, cells: [11, 2, 12], registerSoar: 10,
        tensionScale: 0.9, timingJitter: 20, maxNotesPerPhrase: 4,
        doubleStopProb: 0.0, anticipationProb: 0.1, targetExtensions: [2, 7],
        deviceProb: 0.1, allowedDevices: ['slide']
    },
    bird: {
        restBase: 0.15, restGrowth: 0.03, cells: [0, 1, 7, 3], registerSoar: 8,
        tensionScale: 0.7, timingJitter: 12, maxNotesPerPhrase: 48,
        doubleStopProb: 0.05, anticipationProb: 0.6, targetExtensions: [2, 5, 6, 9],
        deviceProb: 0.6, allowedDevices: ['enclosure', 'run', 'birdFlurry']
    },
    disco: {
        restBase: 0.25, restGrowth: 0.06, cells: [0, 2, 5, 10], registerSoar: 12,
        tensionScale: 0.5, timingJitter: 8, maxNotesPerPhrase: 12,
        doubleStopProb: 0.05, anticipationProb: 0.2, targetExtensions: [2, 9],
        deviceProb: 0.1, allowedDevices: ['run']
    },
    bossa: {
        restBase: 0.4, restGrowth: 0.08, cells: [11, 2, 0, 6, 8], registerSoar: 8,
        tensionScale: 0.7, timingJitter: 15, maxNotesPerPhrase: 8,
        doubleStopProb: 0.08, anticipationProb: 0.35, targetExtensions: [2, 6, 9],
        deviceProb: 0.2, allowedDevices: ['enclosure', 'slide', 'guitarDouble']
    }
};

// --- Helpers ---

export function getScaleForChord(chord, nextChord, style) {
    if (style === 'smart') {
        const mapping = { 
            'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 
            'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 
            'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal'
        };
        style = mapping[gb.genreFeel] || 'scalar';
    }

    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const isDominant = chord.quality.startsWith('7') || 
                       ['13', '11', '9', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(chord.quality) ||
                       (chord.intervals.includes(10) && chord.intervals.includes(4));
    
    // 1. Tension High? Altered
    if (sb.tension > 0.7 && isDominant) {
        return [0, 1, 3, 4, 6, 8, 10]; // Altered
    }

    // 2. Style Specifics
    if (style === 'blues' || style === 'disco' || style === 'funk') {
        if (chord.quality.startsWith('maj') || chord.quality === 'major') {
             return [0, 2, 4, 5, 7, 9, 11]; 
        }
        const isMinorQ = ['minor', 'halfdim', 'dim', 'm9', 'm11', 'm13', 'm6'].includes(chord.quality);
        let base = (chord.quality === 'halfdim') ? [0, 1, 3, 5, 6, 8, 10] : (isMinorQ ? [0, 2, 3, 5, 6, 7, 10] : [0, 2, 3, 4, 5, 6, 7, 9, 10]);
        if ((style === 'blues' || style === 'funk') && !isMinorQ) { if (!base.includes(4)) base.push(4); if (!base.includes(9)) base.push(9); }
        if (sb.tension > 0.7) base.push(11);
        return base.sort((a,b)=>a-b);
    }
    
    if (style === 'neo' || style === 'bird') {
        const keyRootIdx = KEY_ORDER.indexOf(chord.key || arranger.key);
        const relativeRoot = (chord.rootMidi - keyRootIdx + 120) % 12;
        if (chord.quality.startsWith('maj') || chord.quality === 'major') {
            if (relativeRoot === 0 && !arranger.isMinor) return [0, 2, 4, 5, 7, 9, 11]; 
            if (relativeRoot === 5 && !arranger.isMinor && chord.quality.includes('maj')) return [0, 2, 4, 6, 7, 9, 11];
            return [0, 2, 4, 5, 7, 9, 11]; 
        }
        if (chord.quality === 'minor' || ['m9', 'm11', 'm13', 'm6'].includes(chord.quality)) {
            if (relativeRoot === 9 && !arranger.isMinor) return [0, 2, 3, 5, 7, 8, 10];
            return [0, 2, 3, 5, 7, 9, 10]; 
        }
    }

    if (style === 'bossa' && (chord.quality.startsWith('maj') || chord.quality === 'major')) {
        return [0, 2, 4, 6, 7, 9, 11]; 
    }

    // 3. Chord Quality Switch
    switch (chord.quality) {
        case 'dim': return [0, 2, 3, 5, 6, 8, 9, 11];
        case 'halfdim': return [0, 1, 3, 5, 6, 8, 10];
        case 'aug': return [0, 2, 4, 6, 8, 10];
        case 'm9': case 'm11': case 'm13': case 'm6': return [0, 2, 3, 5, 7, 9, 10]; 
        case 'sus4': return [0, 2, 5, 7, 9, 10]; 
        case '7alt': return [0, 1, 3, 4, 6, 8, 10];
        case '7#9': return (style === 'funk' || gb.genreFeel === 'Funk') ? [0, 1, 3, 4, 5, 7, 8, 10] : [0, 1, 3, 4, 6, 8, 10];
        case '7b9': case '7b13': return [0, 1, 4, 5, 7, 8, 10];
        case '7#11': return [0, 2, 4, 6, 7, 9, 10]; 
        case '9': case '13': return [0, 2, 4, 5, 7, 9, 10];
    }

    // 4. Resolution Logic
    const isMinorQuality = (q) => (q.startsWith('m') && !q.startsWith('maj')) || q.includes('minor') || q.includes('dim') || q.includes('halfdim');
    if (chord.quality === '7' && nextChord) {
        const resolvingDownFifth = ((nextChord.rootMidi - chord.rootMidi + 120) % 12 === 5);
        if (resolvingDownFifth) {
            if (isMinorQuality(nextChord.quality)) return [0, 1, 4, 5, 7, 8, 10]; 
            return [0, 2, 4, 5, 7, 9, 10]; 
        }
    }

    if (chord.quality === 'minor' || chord.quality.startsWith('m')) {
        const isActuallyMinor = chord.quality.startsWith('m') && !chord.quality.startsWith('maj');
        if (isActuallyMinor) {
            if (style === 'bird' || gb.genreFeel === 'Jazz' || style === 'neo' || gb.genreFeel === 'Neo-Soul' || gb.genreFeel === 'Funk' || style === 'bossa' || gb.genreFeel === 'Bossa Nova') {
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

    // 5. Diatonic Fallback
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

export function getSoloistNote(currentChord, nextChord, step, prevFreq = null, centerMidi = 72, style = 'scalar', stepInChord = 0, bassFreq = null, isPriming = false) {
    if (!currentChord) return null;
    if (style === 'smart') {
        const mapping = { 'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal' };
        style = mapping[gb.genreFeel] || 'scalar';
    }
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const intensity = ctx.bandIntensity || 0.5;
    
    if (!isPriming) sb.sessionSteps = (sb.sessionSteps || 0) + 1;
    const warmupFactor = isPriming ? 1.0 : Math.min(1.0, sb.sessionSteps / (stepsPerMeasure * 2));
    
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

    if (typeof sb.currentPhraseSteps === 'undefined' || (step === 0 && !sb.isResting)) {
        sb.currentPhraseSteps = 0; sb.notesInPhrase = 0; sb.qaState = 'Question'; sb.isResting = true; return null; 
    }
    
    const phraseBars = sb.currentPhraseSteps / stepsPerMeasure;
    let restProb = (config.restBase * (2.0 - intensity * 1.5)) + (phraseBars * config.restGrowth);
    restProb += (1.0 - warmupFactor) * 0.4;
    if (sb.notesInPhrase >= config.maxNotesPerPhrase) restProb += 0.4;
    
    if (sb.isResting) {
        if (Math.random() < (0.4 + (intensity * 0.3))) { 
            sb.isResting = false; sb.currentPhraseSteps = 0; sb.notesInPhrase = 0;
            sb.qaState = sb.qaState === 'Question' ? 'Answer' : 'Question';
            sb.isReplayingMotif = false; sb.motifBuffer = []; 
        } else return null;
    }
    if (!sb.isResting && sb.currentPhraseSteps > 4 && Math.random() < restProb) {
        sb.isResting = true; sb.currentPhraseSteps = 0; return null;
    }
    sb.currentPhraseSteps++;

    if (stepInBeat === 0) {
        let pool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));
        sb.currentCell = pool[Math.floor(Math.random() * pool.length)];
    }
    if (sb.currentCell && sb.currentCell[stepInBeat] === 1) {} else return null;                
    sb.notesInPhrase++;

    // Pitch Selection
    const scaleIntervals = getScaleForChord(currentChord, nextChord, style);
    const rootMidi = currentChord.rootMidi;
    const scaleTones = scaleIntervals.map(i => rootMidi + i);
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    
    sb.smoothedTension = (sb.smoothedTension || 0) * 0.8 + (sb.tension || 0) * 0.2;
    const dynamicCenter = centerMidi + Math.floor(sb.smoothedTension * config.registerSoar * (0.5 + intensity));
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
        let weight = 1.0;
        if (!scaleTones.some(st => (st % 12 + 12) % 12 === pc)) continue; 

        const dist = Math.abs(m - lastMidi);
        const currentInterval = m - lastMidi;

        if (isResolvingSkip) {
            const isOppositeDir = (lastInterval > 0 && currentInterval < 0) || (lastInterval < 0 && currentInterval > 0);
            if (isOppositeDir && dist > 0 && dist <= 2) weight += 5000; 
            else if (!isOppositeDir && dist > 2) weight -= 1000; 
        }

        if (config.targetExtensions && config.targetExtensions.includes(interval)) weight += 8;
        if (stepInBeat === 0) {
            if (chordTones.some(ct => (ct % 12 + 12) % 12 === pc)) {
                weight += 15; 
                if ([3, 4, 10, 11].includes(interval)) weight += 20; 
            } else weight -= 5;
        }
        if (style === 'neo' && dist === 5) weight += 100; 
        if (sb.qaState === 'Answer') { if (interval === 0) weight += 60; if (interval === 7) weight += 30; }

        if (dist === 0) weight -= 50; 
        if (dist > 0 && dist <= 2) weight += (50 + (ctx.bpm / 100) * 20); 
        else if (dist >= 3 && dist <= 4) weight += 10; 
        else if (dist >= 5 && dist <= 7) weight -= 30; 
        else if (dist === 12) weight += 10; 
        else if (dist > 7) weight -= 500; 

        if (distFromCenter(m, dynamicCenter) > 7) weight -= (distFromCenter(m, dynamicCenter) - 7) * 5; 
        
        weight = Math.max(0.1, weight);
        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let randomVal = Math.random() * totalWeight;
    let selectedMidi = lastMidi;
    for (let m = minMidi; m <= maxMidi; m++) {
        const w = CANDIDATE_WEIGHTS[m];
        if (w > 0) { randomVal -= w; if (randomVal <= 0) { selectedMidi = m; break; } }
    }
    sb.lastInterval = selectedMidi - lastMidi;

    // Devices
    if (stepInBeat === 0 && Math.random() < (config.deviceProb * 0.7 * warmupFactor)) {
        const deviceType = config.allowedDevices ? config.allowedDevices[Math.floor(Math.random() * config.allowedDevices.length)] : null;
        if (deviceType === 'birdFlurry') {
            let flurry = []; let curr = selectedMidi + 3; 
            for (let i = 0; i < 4; i++) {
                let n = curr - 1; while (!scaleIntervals.includes((n - rootMidi + 120) % 12) && n > curr - 5) n--;
                flurry.push({ midi: n, velocity: 0.8, durationSteps: 1, style });
                curr = n;
            }
            sb.deviceBuffer = flurry;
            const first = sb.deviceBuffer.shift(); return { ...first, timingOffset: 0 };
        }
        if (deviceType === 'run') {
            const sz = Math.random() < 0.5 ? 1 : 2;
            sb.deviceBuffer = [ { midi: selectedMidi - sz, velocity: 0.8, durationSteps: 1, style }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            return { midi: selectedMidi - (sz * 2), velocity: 0.7, durationSteps: 1, style };
        }
        if (deviceType === 'enclosure') {
            sb.deviceBuffer = [ { midi: selectedMidi - 1, velocity: 0.8, durationSteps: 1, style }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            let above = selectedMidi + 1; for(let d=1; d<=2; d++) { if (scaleIntervals.includes((selectedMidi + d - rootMidi + 120) % 12)) { above = selectedMidi + d; break; } }
            return { midi: above, velocity: 0.8, durationSteps: 1, style };
        }
        if (deviceType === 'slide') {
            sb.deviceBuffer = [ { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style } ];
            return { midi: selectedMidi - 1, velocity: 0.7, durationSteps: 1, style };
        }
        if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && sb.doubleStops) {
            let dsInt = (style === 'blues' || style === 'scalar') ? 5 : 4;
            return [{ midi: selectedMidi + dsInt, velocity: 0.8, durationSteps: 1, style, isDoubleStop: true }, { midi: selectedMidi, velocity: 0.9, durationSteps: 1, style, isDoubleStop: false }];
        }
    }

    let notes = [];
    if (sb.doubleStops && Math.random() < (config.doubleStopProb * (stepInBeat === 2 ? 1.2 : 0.6) * warmupFactor)) {
        let dsInt = [5, 7, 9, 12][Math.floor(Math.random() * 4)];
        notes.push({ midi: selectedMidi + dsInt, velocity: 0.8, isDoubleStop: true });
    }

    sb.lastFreq = getFrequency(selectedMidi);

    // --- Dynamic Duration & Bending ---
    let durationSteps = 1;
    let bendStartInterval = 0;

    // Sustained Notes: Longer durations on downbeats or when intensity is high
    const isImportantStep = stepInBeat === 0 || (stepInBeat === 2 && Math.random() < 0.3);
    if (isImportantStep && (style === 'neo' || style === 'blues' || style === 'minimal' || style === 'bossa')) {
        // Sustain for a half note (8 steps) or a quarter (4 steps)
        durationSteps = Math.random() < 0.4 ? 8 : 4;
    } else if (style === 'scalar' && stepInBeat === 0 && Math.random() < 0.15) {
        durationSteps = 4; // Occasional sustained rock note
    } else if (style === 'neo' && Math.random() < 0.2) {
        durationSteps = 2; // Subtle syncopated sustain
    }

    // Soulful Scoops: Bend into the note
    if (durationSteps >= 4 && Math.random() < 0.3) {
        // Bend from 1 or 2 semitones below
        bendStartInterval = Math.random() < 0.7 ? 1 : 2;
    }

    const result = { midi: selectedMidi, velocity: 0.8, durationSteps, bendStartInterval, ccEvents: [], timingOffset: 0, style, isDoubleStop: false };
    
    // Update busySteps to prevent generating new notes while this one is sustaining
    // We allow a 1-step overlap for legato if duration is > 1, otherwise strict
    if (durationSteps > 1) {
        sb.busySteps = durationSteps - 1;
    }

    if (notes.length > 0 && sb.doubleStops) return [...notes.map(n => ({...result, ...n})), result];
    return result;
}

function distFromCenter(m, center) { return Math.abs(m - center); }

export function isSoloistActive(style, step, stepInChord) {
    if (sb.busySteps > 0) return true;
    if (sb.isResting) return false;
    return true; 
}