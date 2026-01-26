import { getFrequency, getMidi } from './utils.js';
import { playback, groove, soloist, harmony, arranger } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getScaleForChord } from './theory-scales.js';

const CANDIDATE_WEIGHTS = new Float32Array(128);

const RHYTHMIC_CELLS = [
    [1, 1, 1, 1], // 0: 16ths
    [1, 0, 1, 0], // 1: 8ths
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

/**
 * Generates a soloist note for a specific step.
 * Overhauled to resolve intensity-induced stagnation and "sticky notes".
 */
export function getSoloistNote(currentChord, nextChord, step, prevFreq, octave, style, stepInChord, isPriming, sectionInfo) {
    if (!currentChord) return null;
    
    let activeStyle = style;
    if (activeStyle === 'smart') {
        const mapping = { 'Rock': 'scalar', 'Jazz': 'bird', 'Funk': 'funk', 'Blues': 'blues', 'Neo-Soul': 'neo', 'Disco': 'disco', 'Bossa': 'bossa', 'Bossa Nova': 'bossa', 'Afrobeat': 'funk', 'Acoustic': 'minimal', 'Reggae': 'minimal' };
        activeStyle = mapping[groove.genreFeel] || 'scalar';
    }
    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const intensity = playback.bandIntensity || 0.5;

    // --- Dynamic Register Control & Soar Lift ---
    // registerSoar adds extra melodic "lift" at high intensity to prevent sticking.
    const soarValue = config.registerSoar || 8;
    const soarOffset = (intensity > 0.5) ? (intensity - 0.5) * soarValue : 0;
    const centerMidi = 54 + (intensity * 18) + soarOffset; 
    const MIN_GUITAR_MIDI = 48; // C3
    const MAX_GUITAR_MIDI = 58 + (intensity * 30); // Dynamic Ceiling

    if (!isPriming) soloist.sessionSteps = (soloist.sessionSteps || 0) + 1;
    const maturityFactor = Math.min(1.0, (soloist.sessionSteps || 0) / 1024);
    const warmupFactor = isPriming ? 1.0 : Math.min(1.0, soloist.sessionSteps / (stepsPerMeasure * 2));
    const effectiveIntensity = Math.min(1.0, intensity + (maturityFactor * 0.25));

    /**
     * Internal helper to finalize a note, updating history and session tracking.
     */
    const finalizeNote = (res) => {
        if (!res) return null;
        const primary = Array.isArray(res) ? res[0] : res;
        
        // Update Global Pitch History
        if (soloist.pitchHistory) {
            soloist.pitchHistory.push(primary.midi);
            if (soloist.pitchHistory.length > 128) soloist.pitchHistory.shift();
        }
        
        // Update session tracking for continuity
        if (!primary.isDoubleStop) soloist.lastFreq = getFrequency(primary.midi);
        soloist.notesInPhrase++;
        soloist.currentPhraseSteps++; // Ensure phrase progression
        
        return res;
    };

    // --- 1. Busy/Device Handling ---
    if (soloist.deviceBuffer && soloist.deviceBuffer.length > 0) {
        const devNote = soloist.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1;
        return finalizeNote(devNote);
    }
    if (soloist.busySteps > 0) { 
        soloist.busySteps--; return null; 
    }
    
    // --- 2. Phrasing & History Analysis ---
    const totalSteps = arranger.totalSteps || 1;
    const loopStep = step % totalSteps;
    const stepsUntilSectionEnd = (sectionInfo) ? (sectionInfo.sectionEnd - loopStep) : 1000;
    const isSectionEnding = stepsUntilSectionEnd > 0 && stepsUntilSectionEnd <= stepsPerMeasure;

    if (typeof soloist.currentPhraseSteps === 'undefined' || (step === 0 && !soloist.isResting)) {
        soloist.currentPhraseSteps = 0; soloist.notesInPhrase = 0; soloist.qaState = 'Question'; soloist.isResting = true; return null; 
    }
    
    const historyCounts = {};
    const pcCounts = new Array(12).fill(0);
    const historyLen = soloist.pitchHistory ? soloist.pitchHistory.length : 0;
    if (historyLen > 0) {
        for (const p of soloist.pitchHistory) {
            historyCounts[p] = (historyCounts[p] || 0) + 1;
            pcCounts[(p % 12 + 12) % 12]++;
        }
    }

    const phraseBars = soloist.currentPhraseSteps / stepsPerMeasure;
    let restProb = (config.restBase * (3.0 - effectiveIntensity * 2.0)) + (phraseBars * config.restGrowth);
    restProb += (1.0 - warmupFactor) * 0.4; // Conservative start
    if (intensity < 0.35) restProb += 0.3;

    // Phrase interlocking
    if (harmony.enabled && harmony.rhythmicMask > 0) {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const measureStep = step % (ts.beats * ts.stepsPerBeat);
        const hasHarmonyHit = (harmony.rhythmicMask >> measureStep) & 1;
        if (hasHarmonyHit && !soloist.isResting) restProb += (0.2 * harmony.complexity);
    }
    restProb = Math.max(0.05, restProb - (maturityFactor * 0.15));
    if (soloist.notesInPhrase >= config.maxNotesPerPhrase) restProb += 0.4;
    
    if (soloist.isResting) {
        const startProb = 0.4 + (effectiveIntensity * 0.5);
        if (Math.random() < startProb) { 
            soloist.isResting = false; soloist.currentPhraseSteps = 0; soloist.notesInPhrase = 0;
            soloist.qaState = soloist.qaState === 'Question' ? 'Answer' : 'Question';
            
            // Motif Decision
            const currentRoot = currentChord.rootMidi % 12;
            const motifRoot = soloist.motifRoot !== undefined ? soloist.motifRoot : currentRoot;
            const rootDiff = Math.abs(currentRoot - motifRoot);
            const isSignificantShift = rootDiff > 0 && rootDiff !== 5 && rootDiff !== 7;
            const isStale = (soloist.motifReplayCount || 0) > 3;

            let distinctPitchesCount = 0;
            let pitchRange = 0;
            if (soloist.motifBuffer && soloist.motifBuffer.length > 0) {
                const pitches = soloist.motifBuffer.map(n => Array.isArray(n) ? n[0].midi : n.midi);
                const distinct = new Set(pitches);
                distinctPitchesCount = distinct.size;
                pitchRange = Math.max(...pitches) - Math.min(...pitches);
            }
            const isInteresting = distinctPitchesCount > 2 || pitchRange > 2;

            if (soloist.motifBuffer && soloist.motifBuffer.length > 0 && isInteresting && Math.random() < config.motifProb && !isSignificantShift && !isStale) {
                soloist.isReplayingMotif = true;
                soloist.motifReplayIndex = 0;
                soloist.motifReplayCount = (soloist.motifReplayCount || 0) + 1;
            } else {
                soloist.isReplayingMotif = false;
                soloist.motifBuffer = []; 
                soloist.motifRoot = currentRoot;
                soloist.motifReplayCount = 0;
            }
        } else return null;
    }
        if (!soloist.isResting && soloist.currentPhraseSteps > 4 && Math.random() < restProb) {
            soloist.isResting = true; soloist.currentPhraseSteps = 0; return null;
        }
    
        // --- 3. Motif Replay ---
    if (soloist.isReplayingMotif) {
        const motifNote = soloist.motifBuffer[soloist.motifReplayIndex];
        if (motifNote && historyLen > 12) {
            const primaryMidi = Array.isArray(motifNote) ? motifNote[0].midi : motifNote.midi;
            const count = historyCounts[primaryMidi] || 0;
            const pcCount = pcCounts[primaryMidi % 12] || 0;
            if ((count / historyLen) > 0.35 || (pcCount / historyLen) > 0.45) {
                soloist.isReplayingMotif = false;
                soloist.motifBuffer = [];
            }
        }

        if (soloist.isReplayingMotif) {
            soloist.motifReplayIndex++;
            if (soloist.motifReplayIndex >= soloist.motifBuffer.length) soloist.isReplayingMotif = false;
            
            if (motifNote) {
                const currentRoot = currentChord.rootMidi % 12;
                const motifRoot = soloist.motifRoot !== undefined ? soloist.motifRoot : currentRoot;
                const shift = (currentRoot - motifRoot + 12) % 12;
                const octaveShift = shift > 6 ? -12 : (shift < -6 ? 12 : 0);
                
                let res = motifNote;
                if (Array.isArray(motifNote)) {
                    res = motifNote.map(n => ({ ...n, midi: n.midi + shift + octaveShift }));
                } else {
                    res = { ...motifNote, midi: motifNote.midi + shift + octaveShift };
                }
                
                const primary = Array.isArray(res) ? res[0] : res;
                const scaleIntervals = getScaleForChord(currentChord, null, style);
                const relPC = (primary.midi - currentChord.rootMidi + 120) % 12;
                
                if (!scaleIntervals.includes(relPC)) {
                    const nearest = scaleIntervals.reduce((prev, curr) => Math.abs(curr - relPC) < Math.abs(prev - relPC) ? curr : prev);
                    const nudge = nearest - relPC;
                    if (Array.isArray(res)) res = res.map(n => ({ ...n, midi: n.midi + nudge, bendStartInterval: 0 }));
                    else {
                        res.midi += nudge;
                        res.bendStartInterval = 0;
                    }
                }

                soloist.busySteps = (primary.durationSteps || 1) - 1;
                return finalizeNote(res);
            }
        }
    }

    // --- 4. Rhythmic Density ---
    if (stepInBeat === 0) {
        let pool = RHYTHMIC_CELLS.filter((_, idx) => config.cells.includes(idx));
        if (playback.complexity > 0.7 && !config.cells.includes(1)) pool.push(RHYTHMIC_CELLS[1]);
        if (intensity < 0.4) pool = pool.filter(c => c[1] === 0 && c[3] === 0);
        soloist.currentCell = pool[Math.floor(Math.random() * pool.length)];
    }
    if (soloist.currentCell && soloist.currentCell[stepInBeat] === 1) { /* hit */ } else return null;

    // --- 5. Pitch Selection ---
    let targetChord = currentChord;
    const isLateInChord = stepInChord >= (currentChord.beats * stepsPerBeat) - 2;
    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) targetChord = nextChord;

    const scaleIntervals = getScaleForChord(targetChord, null, style);
    const rootMidi = targetChord.rootMidi;
    const scaleTones = scaleIntervals.map(i => rootMidi + i);
    
    const chordTones = currentChord.intervals.map(i => rootMidi + i);
    
    const dynamicCenter = centerMidi; 
    const lastMidi = prevFreq ? getMidi(prevFreq) : Math.round(dynamicCenter);
    const minMidi = Math.max(MIN_GUITAR_MIDI, Math.min(dynamicCenter - 12, lastMidi - 14)); 
    const maxMidi = Math.min(MAX_GUITAR_MIDI, Math.max(dynamicCenter + 12, lastMidi + 14));

    let totalWeight = 0;
    CANDIDATE_WEIGHTS.fill(0);
    const lastInterval = soloist.lastInterval || 0; 
    const isResolvingSkip = Math.abs(lastInterval) > 4;
    
    if (Math.abs(lastInterval) < 3) soloist.stagnationCount = (soloist.stagnationCount || 0) + 1;
    else soloist.stagnationCount = 0;
    const isStagnant = soloist.stagnationCount > 4;

    for (let m = Math.floor(minMidi); m <= Math.ceil(maxMidi); m++) {
        if (m < 0 || m > 127) continue;
        const pc = (m % 12 + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        let weight = 1.0;
        if (!scaleTones.some(st => (st % 12 + 12) % 12 === pc)) continue; 

        const dist = Math.abs(m - lastMidi);

        // Bonuses
        if (isResolvingSkip && (lastInterval > 0 && m < lastMidi || lastInterval < 0 && m > lastMidi) && dist <= 2) weight += 1000;
        const isGuideTone = [3, 4, 10, 11].includes(interval);
        const isRoot = interval === 0;
        if (isGuideTone) weight += 30;
        if (isRoot) weight += 15;
        if (soloist.qaState === 'Answer') {
            const qaBonus = (activeStyle === 'minimal' ? 100 : 250) * effectiveIntensity;
            if (isRoot) weight += qaBonus;
            if (isGuideTone) weight += qaBonus * 0.5;
        }
        if (chordTones.some(ct => (ct % 12 + 12) % 12 === pc)) weight += 20;

        // Penalties (Multiplicative)
        if (dist === 0) {
            weight *= 0.0001; // Force a move
            if (isStagnant) weight = 0; 
        }
        if (historyLen > 12) {
            const count = historyCounts[m] || 0;
            const pcCount = pcCounts[pc] || 0;
            const pct = count / historyLen;
            const pcPct = pcCount / historyLen;
            if (pct > 0.35 || pcPct > 0.45) weight = 0; // Hard ban magnets
            else if (pct > 0.2 || pcPct > 0.3) weight *= 0.01;
        }
        if (isStagnant && dist < 3) weight *= 0.01;
        const dCenter = Math.abs(m - dynamicCenter);
        if (dCenter > 7) weight *= Math.max(0.01, 1.0 - (dCenter - 7) * 0.1);

        weight = Math.max(0.01, weight);
        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    const startM = Math.floor(minMidi);
    const endM = Math.ceil(maxMidi);

    if (totalWeight > 0) {
        let randomVal = Math.random() * totalWeight;
        for (let m = startM; m <= endM; m++) {
            if (m < 0 || m > 127) continue;
            const w = CANDIDATE_WEIGHTS[m];
            if (w > 0) { 
                randomVal -= w; 
                if (randomVal <= 0) { selectedMidi = m; break; } 
            }
        }
    }

    if (selectedMidi === -1 || selectedMidi === lastMidi) {
        const fallbacks = [];
        for (let m = startM; m <= endM; m++) {
            if (m < 0 || m > 127) continue;
            const pc = (m % 12 + 12) % 12;
            if (scaleTones.some(st => (st % 12 + 12) % 12 === pc) && m !== lastMidi) fallbacks.push(m);
        }
        selectedMidi = fallbacks.length > 0 ? fallbacks[Math.floor(Math.random() * fallbacks.length)] : lastMidi;
    }
    
    soloist.lastInterval = selectedMidi - lastMidi;

    // --- 6. Melodic Devices ---
    const allowFlash = intensity > 0.5;
    const deviceBaseProb = config.deviceProb * (0.5 + playback.complexity * 1.0);
    
    if (allowFlash && stepInBeat === 0 && Math.random() < (deviceBaseProb * 0.7 * warmupFactor)) {
        const deviceType = config.allowedDevices ? config.allowedDevices[Math.floor(Math.random() * config.allowedDevices.length)] : null;
        const devBaseVel = 0.5 + (effectiveIntensity * 0.6);
        
        if (deviceType === 'birdFlurry') {
            let flurry = []; let curr = selectedMidi + 3; 
            for (let i = 0; i < 4; i++) {
                let n = curr - 1; while (!scaleIntervals.includes((n - rootMidi + 120) % 12) && n > curr - 5) n--;
                flurry.push({ midi: n, velocity: devBaseVel * 1.05, durationSteps: 1, style: activeStyle });
                curr = n;
            }
            soloist.deviceBuffer = flurry;
            const first = soloist.deviceBuffer.shift(); 
            soloist.busySteps = (first.durationSteps || 1) - 1;
            return finalizeNote(first);
        }
        if (deviceType === 'run' || deviceType === 'enclosure') {
            soloist.deviceBuffer = [ { midi: selectedMidi - 1, velocity: devBaseVel * 1.1, durationSteps: 1, style: activeStyle }, { midi: selectedMidi, velocity: devBaseVel * 1.2, durationSteps: 1, style: activeStyle } ];
            const res = { midi: selectedMidi + (deviceType === 'run' ? -2 : 1), velocity: devBaseVel * 0.9, durationSteps: 1, style: activeStyle };
            soloist.busySteps = (res.durationSteps || 1) - 1;
            return finalizeNote(res);
        }
        if (deviceType === 'slide') {
            soloist.deviceBuffer = [ { midi: selectedMidi, velocity: devBaseVel * 1.15, durationSteps: 1, style: activeStyle } ];
            const res = { midi: selectedMidi - 1, velocity: devBaseVel * 0.95, durationSteps: 1, style: activeStyle };
            soloist.busySteps = (res.durationSteps || 1) - 1;
            return finalizeNote(res);
        }
        if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && soloist.doubleStops) {
            let dsInt = (activeStyle === 'blues' || activeStyle === 'scalar') ? 5 : 4;
            const res = [{ midi: selectedMidi + dsInt, velocity: devBaseVel * 1.05, durationSteps: 1, style: activeStyle, isDoubleStop: true }, { midi: selectedMidi, velocity: devBaseVel * 1.2, durationSteps: 1, style: activeStyle, isDoubleStop: false }];
            soloist.busySteps = 0; 
            return finalizeNote(res);
        }
    }

    let extraNotes = [];
    const dsChance = (config.doubleStopProb + (maturityFactor * 0.2)) * (stepInBeat === 2 ? 1.2 : 0.6) * warmupFactor;
    if (soloist.doubleStops && Math.random() < dsChance) {
        let dsInt = [5, 7, 9, 12][Math.floor(Math.random() * 4)];
        extraNotes.push({ midi: selectedMidi + dsInt, velocity: (0.5 + effectiveIntensity * 0.6) * 0.95, isDoubleStop: true });
    }

    // --- 7. Dynamic Duration & Bending ---
    let durationSteps = 1;
    let bendStartInterval = 0;

    const isImportantStep = stepInBeat === 0 || (stepInBeat === 2 && Math.random() < 0.3);
    const baseVelocity = 0.5 + (effectiveIntensity * 0.7);
    const stepVelocity = isImportantStep ? baseVelocity * 1.15 : baseVelocity;

    if (intensity < 0.4) {
        durationSteps = Math.random() < 0.6 ? 4 : 8;
    } else if (isImportantStep && (activeStyle === 'neo' || activeStyle === 'blues' || activeStyle === 'minimal' || activeStyle === 'bossa')) {
        durationSteps = Math.random() < (0.4 + maturityFactor * 0.2) ? 8 : 4;
    } else if (activeStyle === 'scalar' && stepInBeat === 0 && Math.random() < (0.15 + maturityFactor * 0.1)) {
        durationSteps = 4; 
    }

    const pc = selectedMidi % 12;
    const isRoot = pc === (targetChord.rootMidi % 12);
    const isGuideTone = [3, 4, 10, 11].includes((pc - (targetChord.rootMidi % 12) + 12) % 12);
    
    if ((isRoot || (isGuideTone && activeStyle === 'minimal')) && Math.abs(lastMidi - selectedMidi) === 1 && Math.random() < (0.4 + intensity * 0.3)) {
        bendStartInterval = -1;
        if (Math.random() < 0.3) bendStartInterval = -2;
    } else if (durationSteps >= 4 && Math.random() < (0.3 + maturityFactor * 0.2)) {
        bendStartInterval = Math.random() < 0.7 ? 1 : 2;
    }

    const result = { midi: selectedMidi, velocity: Math.min(1.25, stepVelocity), durationSteps, bendStartInterval, ccEvents: [], timingOffset: 0, style: activeStyle, isDoubleStop: false };
    if (durationSteps > 1) soloist.busySteps = durationSteps - 1;

    const finalResult = (extraNotes.length > 0 && soloist.doubleStops) ? [...extraNotes.map(n => ({...result, ...n})), result] : result;
    
    if (!soloist.isReplayingMotif) {
        soloist.motifBuffer.push(finalResult);
        if (soloist.motifBuffer.length > 16) soloist.motifBuffer.shift();
        soloist.motifRoot = targetChord.rootMidi % 12;
    }

    return finalizeNote(finalResult);
}

function distFromCenter(m, center) { return Math.abs(m - center); }
