/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized for both standard songs and long, improvisational jam sessions.
 * @param {Array} beatData Array of { chord, energy } objects
 */
export function extractForm(beatData, beatsPerMeasure = 4) {
    if (!beatData || beatData.length < 4) return [];

    // Flatten beat results into a full timeline
    const maxBeat = beatData[beatData.length - 1].beat;
    const timeline = new Array(maxBeat + 1).fill(null);
    beatData.forEach(b => { timeline[b.beat] = b; });
    
    // Fill gaps
    let current = timeline.find(b => b !== null) || { chord: "C", energy: 0 };
    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i]) current = timeline[i];
        else timeline[i] = { ...current, beat: i };
    }

    // 1. HARMONIC SIMPLIFICATION (The "Ear" Pass)
    const simplify = (c) => {
        if (!c || c === 'Rest' || c === '-') return '-';
        return c.replace(/maj7|m7|m6|7|6|sus4|sus2|dim|5/g, (match) => {
            if (match.startsWith('m')) return 'm'; 
            return ''; 
        });
    };

    // 2. MEASURE CONSOLIDATION
    const measures = [];
    const originalMeasures = []; 
    const measureEnergy = [];
    
    for (let i = 0; i < timeline.length; i += beatsPerMeasure) {
        const slice = timeline.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) break;

        const counts = {};
        let totalEnergy = 0;
        slice.forEach(b => {
            counts[b.chord] = (counts[b.chord] || 0) + 1;
            totalEnergy += b.energy;
        });
        
        const majority = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        measureEnergy.push(totalEnergy / beatsPerMeasure);

        if (counts[majority] >= beatsPerMeasure * 0.5) {
            measures.push(simplify(majority));
            originalMeasures.push(majority);
        } else {
            measures.push(`${simplify(slice[0].chord)} ${simplify(slice[2].chord)}`);
            originalMeasures.push(`${slice[0].chord} ${slice[2].chord}`);
        }
    }

    // 3. PATTERN MINING (Multi-scale: 16, 8, 4, 2)
    const sections = [];
    let i = 0;

    const getSimilarity = (idx1, idx2, len) => {
        let matches = 0;
        for (let k = 0; k < len; k++) {
            if (measures[idx1 + k] === measures[idx2 + k]) matches++;
        }
        return matches / len;
    };

    const getConsensusValue = (startIdx, len, repeats) => {
        const consensus = [];
        for (let k = 0; k < len; k++) {
            const counts = {};
            for (let r = 0; r < repeats; r++) {
                // Use originalMeasures to preserve chord quality (C7 vs C)
                const measure = originalMeasures[startIdx + r * len + k];
                counts[measure] = (counts[measure] || 0) + 1;
            }
            // Pick the most frequent chord for this measure slot
            // If tie, prefer the one from the first iteration (stability)
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            consensus.push(best);
        }
        return consensus.join(' | ');
    };

    while (i < measures.length) {
        let bestLen = 0;
        let bestRepeat = 0;

        // Expanded lengths to catch 32-bar forms, 12-bar blues, etc.
        for (let len of [32, 24, 16, 12, 8, 6, 4, 2]) {
            if (i + len * 2 <= measures.length) {
                if (getSimilarity(i, i + len, len) >= 0.75) {
                    bestLen = len;
                    bestRepeat = 2;
                    while (i + (bestRepeat + 1) * len <= measures.length && 
                           getSimilarity(i, i + bestRepeat * len, len) >= 0.75) {
                        bestRepeat++;
                    }
                    break;
                }
            }
        }

        if (bestLen > 0) {
            const value = getConsensusValue(i, bestLen, bestRepeat);
            const avgEnergy = measureEnergy.slice(i, i + bestLen * bestRepeat).reduce((a, b) => a + b, 0) / (bestLen * bestRepeat);
            sections.push({ 
                value, 
                repeat: bestRepeat, 
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: bestLen
            });
            i += bestLen * bestRepeat;
        } else {
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            const avgEnergy = measureEnergy.slice(i, i + len).reduce((a, b) => a + b, 0) / len;
            sections.push({ 
                value, 
                repeat: 1, 
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: len
            });
            i += len;
        }
    }

    // 4. AGGRESSIVE CONSOLIDATION
    let consolidated = [];
    sections.forEach(s => {
        const last = consolidated[consolidated.length - 1];
        if (last && last.value === s.value) {
            last.repeat += s.repeat;
            // Update running average energy
            last.energy = (last.energy + s.energy) / 2;
        } else {
            consolidated.push(s);
        }
    });

    // 5. MUSICIAN LABELING (using relative energy)
    const allEnergies = consolidated.map(s => s.energy);
    const maxE = Math.max(...allEnergies) || 1;
    const minE = Math.min(...allEnergies) || 0;
    const range = maxE - minE;

    const labelMap = new Map();
    let currentLetterCode = 65; // 'A'

    const getSequenceSimilarity = (seq1, seq2) => {
        const m1 = seq1.split(' | ').map(simplify);
        const m2 = seq2.split(' | ').map(simplify);
        if (m1.length !== m2.length) return 0;
        let matches = 0;
        for (let k = 0; k < m1.length; k++) {
            if (m1[k] === m2[k]) matches++;
        }
        return matches / m1.length;
    };

    consolidated.forEach((s, idx) => {
        const totalMeasures = s.value.split('|').length * s.repeat;
        const relEnergy = range > 0 ? (s.energy - minE) / range : 0.5;
        
        // Use a persistent label for similar chord progressions
        let matchedKey = null;
        for (const key of labelMap.keys()) {
             if (s.value === key || getSequenceSimilarity(s.value, key) >= 0.7) {
                 matchedKey = key;
                 break;
             }
        }

        if (!matchedKey) {
            // First time seeing this progression
            let label = "Section " + String.fromCharCode(currentLetterCode++);
            if (idx === 0 && totalMeasures <= 8 && relEnergy < 0.4) {
                label = "Intro";
                currentLetterCode--; // Don't burn a letter
            } else if (idx === consolidated.length - 1 && totalMeasures <= 8 && relEnergy < 0.4) {
                label = "Outro";
                currentLetterCode--; 
            }
            
            labelMap.set(s.value, label);
            matchedKey = s.value;
        }

        s.label = labelMap.get(matchedKey);
        
        // Special override for single-chord loops
        const isVamp = s.value.split('|').every(m => m.trim() === s.value.split('|')[0].trim());
        if (isVamp && !s.label.includes("Intro") && !s.label.includes("Outro")) {
            s.label = "Vamp (" + s.label + ")";
        }
    });

    // 5.2 GLOBAL CONSENSUS HEALING (The "Logic" Pass)
    // If "Section A" appears 3 times, use the majority vote for each measure to "heal" outliers.
    const labelGroups = new Map();
    consolidated.forEach(s => {
        if (!labelGroups.has(s.label)) labelGroups.set(s.label, []);
        labelGroups.get(s.label).push(s);
    });

    for (const [label, group] of labelGroups.entries()) {
        if (group.length <= 1) continue;

        // Determine the "Standard Length" for this label (most frequent measure count)
        const lengths = group.map(s => s.value.split(' | ').length);
        const freqMap = {};
        lengths.forEach(l => freqMap[l] = (freqMap[l] || 0) + 1);
        const standardLen = parseInt(Object.entries(freqMap).sort((a, b) => b[1] - a[1])[0][0]);

        // Only include instances that match the standard length for voting
        const validInstances = group.filter(s => s.value.split(' | ').length === standardLen);
        if (validInstances.length <= 1) continue;

        const consensusChords = [];
        for (let m = 0; m < standardLen; m++) {
            const voteBox = {};
            validInstances.forEach(s => {
                const chord = s.value.split(' | ')[m];
                voteBox[chord] = (voteBox[chord] || 0) + 1;
            });
            // Winner takes the slot
            const winner = Object.entries(voteBox).sort((a, b) => b[1] - a[1])[0][0];
            consensusChords.push(winner);
        }

        const healedProgression = consensusChords.join(' | ');
        // Update all instances of this label to the consensus progression
        group.forEach(s => {
            if (s.value.split(' | ').length === standardLen) {
                s.value = healedProgression;
            }
        });
    }

    // 5.5 META-STRUCTURE CONSOLIDATION (Finding the "12 Bar Loop")
    // If we have A, B, C, A, B, C -> Merge into (A+B+C) x 2
    const metaConsolidated = [];
    let processedIdx = 0;
    
    while (processedIdx < consolidated.length) {
        let bestLen = 0;
        let bestRepeats = 0;
        
        const maxLen = Math.floor((consolidated.length - processedIdx) / 2);
        
        for (let len = 1; len <= maxLen; len++) {
            // Check if block [processedIdx ... processedIdx+len] repeats immediately
            let repeats = 1;
            let currentIdx = processedIdx + len;
            
            while (currentIdx + len <= consolidated.length) {
                let match = true;
                for (let k = 0; k < len; k++) {
                    if (consolidated[processedIdx + k].label !== consolidated[currentIdx + k].label) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    repeats++;
                    currentIdx += len;
                } else {
                    break;
                }
            }
            
            // Prefer longer sequences or more repeats
            if (repeats > 1 && len * repeats > bestLen * bestRepeats) {
                bestLen = len;
                bestRepeats = repeats;
            }
        }
        
        if (bestLen > 0) {
            // Merge!
            const subSections = consolidated.slice(processedIdx, processedIdx + bestLen);
            const combinedValue = subSections.map(s => s.value).join(' | ');
            const combinedEnergy = subSections.reduce((acc, s) => acc + s.energy, 0) / subSections.length;
            const combinedStart = subSections[0].startMeasureIndex;
            const combinedLength = subSections.reduce((acc, s) => acc + s.lengthInMeasures * s.repeat, 0); 
            
            // If it repeats a lot or is long, it's likely the Main Theme
            let label = "Main Theme";
            if (combinedLength === 12) label = "12-Bar Blues Form";
            if (combinedLength === 32) label = "32-Bar Form";

            metaConsolidated.push({
                label,
                value: combinedValue,
                repeat: bestRepeats,
                energy: combinedEnergy,
                startMeasureIndex: combinedStart,
                lengthInMeasures: combinedLength
            });
            
            processedIdx += bestLen * bestRepeats;
        } else {
            metaConsolidated.push(consolidated[processedIdx]);
            processedIdx++;
        }
    }
    consolidated = metaConsolidated;

    // 6. LOOP ANALYSIS
    consolidated.forEach(s => {
        const parts = s.value.split(' | ');
        const first = parts[0].trim();
        const last = parts[parts.length - 1].trim();
        const totalMeasures = parts.length * s.repeat; // Total length of this block
        const singleLen = parts.length;

        // Timestamps (Beat Index)
        // Note: startMeasureIndex is from the FIRST iteration.
        s.startBeat = s.startMeasureIndex * beatsPerMeasure;
        
        // Use the length of ONE iteration for the loop selection window?
        // Usually user wants to grab the loop "source", i.e. one cycle.
        // But if it repeats 4 times, they might want the whole thing?
        // Let's provide the bounds of the FIRST iteration for looping.
        s.loopLengthBeats = singleLen * beatsPerMeasure;
        s.endBeat = s.startBeat + s.loopLengthBeats; 
        
        // Full block bounds (for visual highlighting)
        s.blockEndBeat = s.startBeat + (totalMeasures * beatsPerMeasure);

        // Scoring
        let score = 50;
        if (s.repeat > 1) score += 20;
        if ([4, 8, 12, 16, 24, 32].includes(singleLen)) score += 20;
        if (s.startMeasureIndex === 0) score += 10; // Intro loops are easy to grab

        // Harmonic Resolution Check (Simple)
        const getRoot = (c) => c.replace(/m|maj|dim|aug|sus|6|7|9|11|13/g, '').trim();
        const r1 = getRoot(first);
        const r2 = getRoot(last);
        
        // V -> I (G -> C)
        // IV -> I (F -> C)
        // Same (C -> C)
        // We don't know Key here easily without passing it down.
        // But we can check interval? 
        // Let's just reward movement.
        if (r1 !== r2) score += 10; 
        
        s.loopScore = Math.min(100, score);
        s.isLoop = score >= 70;
    });

    return consolidated;
}