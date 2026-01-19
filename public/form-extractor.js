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
        return c.replace(/maj7|m7|7|sus4|sus2|dim|5/g, (match) => {
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

    while (i < measures.length) {
        let bestLen = 0;
        let bestRepeat = 0;

        for (let len of [16, 8, 4, 2]) {
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
            const value = originalMeasures.slice(i, i + bestLen).join(' | ');
            const avgEnergy = measureEnergy.slice(i, i + bestLen * bestRepeat).reduce((a, b) => a + b, 0) / (bestLen * bestRepeat);
            sections.push({ value, repeat: bestRepeat, energy: avgEnergy });
            i += bestLen * bestRepeat;
        } else {
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            const avgEnergy = measureEnergy.slice(i, i + len).reduce((a, b) => a + b, 0) / len;
            sections.push({ value, repeat: 1, energy: avgEnergy });
            i += len;
        }
    }

    // 4. AGGRESSIVE CONSOLIDATION
    const consolidated = [];
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

    consolidated.forEach((s, idx) => {
        const relEnergy = range > 0 ? (s.energy - minE) / range : 0.5;
        const totalMeasures = s.value.split('|').length * s.repeat;
        const isVamp = s.value.split('|').every(m => m.trim() === s.value.split('|')[0].trim());

        if (idx === 0 && relEnergy < 0.4) s.label = "Intro";
        else if (idx === consolidated.length - 1 && relEnergy < 0.4) s.label = "Outro";
        else if (relEnergy > 0.85) s.label = "Climax";
        else if (relEnergy > 0.6) s.label = "Chorus";
        else if (relEnergy < 0.3 && totalMeasures >= 4) s.label = "Verse";
        else if (isVamp) s.label = "Vamp";
        else if (totalMeasures >= 16) s.label = "Main Theme";
        else s.label = "Section " + (idx + 1);
    });

    return consolidated;
}