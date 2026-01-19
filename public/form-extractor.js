/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized to 'think like a lead sheet' by favoring strong beats (1 and 3).
 */
export function extractForm(chordSequence, beatsPerMeasure = 4) {
    if (!chordSequence || chordSequence.length < 4) return [];

    // 1. LEAD SHEET PARSING (Beat Anchoring)
    // Real charts usually don't have chords changing on beats 2 or 4 unless it's very complex.
    // We snap changes to the nearest strong beat (1 or 3).
    const leadSheetMeasures = [];
    for (let i = 0; i < chordSequence.length; i += beatsPerMeasure) {
        const slice = chordSequence.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) break;

        // Extract the most stable chord for the first half (Beats 1 & 2) 
        // and second half (Beats 3 & 4)
        const half1 = slice.slice(0, 2);
        const half2 = slice.slice(2, 4);

        const getConsensus = (beats) => {
            const counts = {};
            beats.forEach(b => counts[b] = (counts[b] || 0) + 1);
            return Object.entries(counts).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
        };

        const chord1 = getConsensus(half1);
        const chord2 = getConsensus(half2);

        // Standard lead sheet measure format: 
        // If chord is the same for the whole bar: "C"
        // If it changes on the 3: "C G"
        if (chord1 === chord2) {
            leadSheetMeasures.push(chord1);
        } else {
            leadSheetMeasures.push(`${chord1} ${chord2}`);
        }
    }

    // 2. STRUCTURAL GROUPING
    // We look for patterns of 8, 4, or 2 measures (Standard song blocks)
    const suggestedSections = [];
    let i = 0;
    let sectionCount = 1;

    const getPattern = (start, len) => leadSheetMeasures.slice(start, start + len).join('|');

    while (i < leadSheetMeasures.length) {
        let foundPattern = false;
        
        // Look for the largest repeating blocks first (8 -> 4 -> 2)
        for (let len of [8, 4, 2]) {
            if (i + len * 2 <= leadSheetMeasures.length) {
                const p1 = getPattern(i, len);
                const p2 = getPattern(i + len, len);
                
                if (p1 === p2) {
                    const value = leadSheetMeasures.slice(i, i + len).join(' | ');
                    
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
                    while (i + len <= leadSheetMeasures.length && getPattern(i, len) === p1) {
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
            const remaining = leadSheetMeasures.length - i;
            let len = Math.min(4, remaining);
            if (remaining <= 6) len = remaining;

            const value = leadSheetMeasures.slice(i, i + len).join(' | ');
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
