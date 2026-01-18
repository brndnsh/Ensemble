/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized to 'think like a drummer' by favoring measure boundaries and standard block lengths.
 */
export function extractForm(chordSequence, beatsPerMeasure = 4) {
    if (!chordSequence || chordSequence.length < 4) return [];

    // 1. MEASURE SMOOTHING (Noise Reduction)
    // If a measure has 3 beats of 'C' and 1 beat of 'G', it's likely just 'C' with harmonic noise
    // unless the change is on a strong beat (1 or 3).
    const smoothedMeasures = [];
    for (let i = 0; i < chordSequence.length; i += beatsPerMeasure) {
        const slice = chordSequence.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) break;

        // Calculate counts
        const counts = {};
        slice.forEach(c => counts[c] = (counts[c] || 0) + 1);
        
        // Find majority chord
        const majority = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        // If one chord dominates > 75%, consolidate the whole measure
        if (counts[majority] >= beatsPerMeasure * 0.75) {
            smoothedMeasures.push(new Array(beatsPerMeasure).fill(majority));
        } else {
            // Otherwise keep the internal changes but clean up single-beat 'glitches'
            const cleaned = [...slice];
            for (let b = 1; b < cleaned.length - 1; b++) {
                if (cleaned[b] !== cleaned[b-1] && cleaned[b] !== cleaned[b+1]) {
                    cleaned[b] = cleaned[b-1]; // Snap to previous
                }
            }
            smoothedMeasures.push(cleaned);
        }
    }

    // Convert measures to strings for pattern matching
    const measureStrings = smoothedMeasures.map(m => m.join(' '));

    // 2. STRUCTURAL GROUPING
    // We look for patterns of 8, 4, or 2 measures (Standard song blocks)
    const suggestedSections = [];
    let i = 0;
    let sectionCount = 1;

    const getPattern = (start, len) => measureStrings.slice(start, start + len).join('|');

    while (i < measureStrings.length) {
        let foundPattern = false;
        
        // Look for the largest repeating blocks first (8 -> 4 -> 2)
        for (let len of [8, 4, 2]) {
            if (i + len * 2 <= measureStrings.length) {
                const p1 = getPattern(i, len);
                const p2 = getPattern(i + len, len);
                
                if (p1 === p2) {
                    const value = measureStrings.slice(i, i + len).join(' | ');
                    
                    // Check if we can merge with previous identical section
                    const last = suggestedSections[suggestedSections.length - 1];
                    if (last && last.value === value) {
                        last.repeat += 2;
                    } else {
                        suggestedSections.push({
                            label: `Section ${sectionCount++}`,
                            value: value,
                            repeat: 2
                        });
                    }
                    
                    i += len * 2;
                    // Check for further repeats
                    while (i + len <= measureStrings.length && getPattern(i, len) === p1) {
                        suggestedSections[suggestedSections.length - 1].repeat++;
                        i += len;
                    }
                    foundPattern = true;
                    break;
                }
            }
        }

        if (!foundPattern) {
            // No repeat found, capture a standard 4-bar or 8-bar unique block
            // but stop if we hit the start of a repeat further down the line
            const remaining = measureStrings.length - i;
            let len = Math.min(4, remaining);
            
            // Heuristic: If we only have a tiny bit left, grab it all
            if (remaining <= 6) len = remaining;

            const value = measureStrings.slice(i, i + len).join(' | ');
            const last = suggestedSections[suggestedSections.length - 1];
            
            if (last && last.value === value) {
                last.repeat++;
            } else {
                suggestedSections.push({
                    label: `Section ${sectionCount++}`,
                    value: value,
                    repeat: 1
                });
            }
            i += len;
        }
    }

    // 3. MUSICIAN LABELING
    // Apply standard labels based on common song forms
    if (suggestedSections.length >= 2) {
        // Section 1 is almost always Intro or Verse
        if (suggestedSections[0].repeat <= 2) suggestedSections[0].label = 'Intro';
        else suggestedSections[0].label = 'Verse';

        // Find the most frequent repeating section - that's likely the Chorus or Verse
        const valueCounts = {};
        suggestedSections.forEach(s => valueCounts[s.value] = (valueCounts[s.value] || 0) + (s.repeat));
        const mostFrequentValue = Object.entries(valueCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

        let hasVerse = false;
        let hasChorus = false;

        suggestedSections.forEach((s, idx) => {
            if (s.value === mostFrequentValue) {
                if (!hasVerse) { s.label = 'Verse'; hasVerse = true; }
                else { s.label = 'Chorus'; hasChorus = true; }
            } else if (idx === suggestedSections.length - 1 && s.repeat === 1) {
                s.label = 'Outro';
            } else if (idx > 0 && !hasChorus && s.repeat >= 2) {
                s.label = 'Chorus';
                hasChorus = true;
            } else if (idx > 0) {
                s.label = `Bridge ${idx}`;
            }
        });
    }

    return suggestedSections;
}
