/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized for both standard songs and long, improvisational jam sessions.
 */
export function extractForm(chordSequence, beatsPerMeasure = 4) {
    if (!chordSequence || chordSequence.length < 4) return [];

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
    
    for (let i = 0; i < chordSequence.length; i += beatsPerMeasure) {
        const slice = chordSequence.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) break;

        const counts = {};
        slice.forEach(c => counts[c] = (counts[c] || 0) + 1);
        const majority = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        if (counts[majority] >= beatsPerMeasure * 0.5) {
            measures.push(simplify(majority));
            originalMeasures.push(majority);
        } else {
            measures.push(`${simplify(slice[0])} ${simplify(slice[2])}`);
            originalMeasures.push(`${slice[0]} ${slice[2]}`);
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

        // Try to find the longest possible repeating block
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
            sections.push({ value, repeat: bestRepeat });
            i += bestLen * bestRepeat;
        } else {
            // Look ahead to see if a repeat of the current 4-bar block starts soon
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            sections.push({ value, repeat: 1 });
            i += len;
        }
    }

    // 4. AGGRESSIVE CONSOLIDATION (Merging consecutive similar segments)
    const consolidated = [];
    sections.forEach(s => {
        const last = consolidated[consolidated.length - 1];
        if (last && last.value === s.value) {
            last.repeat += s.repeat;
        } else {
            consolidated.push(s);
        }
    });

    // 5. MUSICIAN LABELING
    consolidated.forEach((s, idx) => {
        const totalMeasures = s.value.split('|').length * s.repeat;
        const isVamp = s.value.split('|').every(m => m.trim() === s.value.split('|')[0].trim());

        if (s.repeat >= 4 || totalMeasures >= 16) s.label = "Main Theme";
        else if (isVamp) s.label = "Vamp";
        else if (idx === 0) s.label = "Intro";
        else if (idx === consolidated.length - 1) s.label = "Outro";
        else s.label = "Section";
    });

    return consolidated;
}