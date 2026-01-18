/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 */
export function extractForm(chordSequence, beatsPerMeasure = 4) {
    if (!chordSequence || chordSequence.length < 4) return [];

    // 1. Group into measures
    const measures = [];
    for (let i = 0; i < chordSequence.length; i += beatsPerMeasure) {
        measures.push(chordSequence.slice(i, i + beatsPerMeasure).join(' '));
    }

    if (measures.length < 2) return [{ label: 'Main', value: measures[0] || '', repeat: 1 }];

    // 2. Identify patterns (segments of 2, 4, or 8 measures)
    const suggestedSections = [];
    
    const findPattern = (startIdx, length) => {
        if (startIdx + length * 2 > measures.length) return false;
        const p1 = measures.slice(startIdx, startIdx + length).join('|');
        const p2 = measures.slice(startIdx + length, startIdx + length * 2).join('|');
        return p1 === p2;
    };

    let i = 0;
    let sectionCount = 1;

    while (i < measures.length) {
        // Look for 4-measure or 2-measure repeats to identify "blocks"
        let foundRepeat = false;
        for (let len of [4, 2]) {
            if (findPattern(i, len)) {
                const pattern = measures.slice(i, i + len).join(' | ');
                
                // Check if this pattern is different from the last added section
                const lastSection = suggestedSections[suggestedSections.length - 1];
                if (lastSection && lastSection.value === pattern) {
                    lastSection.repeat++;
                } else {
                    suggestedSections.push({
                        label: `Section ${sectionCount++}`,
                        value: pattern,
                        repeat: 2 // We found a repeat
                    });
                }
                i += len * 2;
                
                // Check for further repeats of the same pattern
                while (i + len <= measures.length && measures.slice(i, i + len).join(' | ') === pattern) {
                    suggestedSections[suggestedSections.length - 1].repeat++;
                    i += len;
                }

                foundRepeat = true;
                break;
            }
        }

        if (!foundRepeat) {
            // If no repeat found, just add the next 4 measures as a unique section or until we hit a repeat
            const len = Math.min(4, measures.length - i);
            const pattern = measures.slice(i, i + len).join(' | ');
            
            const lastSection = suggestedSections[suggestedSections.length - 1];
            if (lastSection && lastSection.value === pattern) {
                lastSection.repeat++;
            } else {
                suggestedSections.push({
                    label: `Section ${sectionCount++}`,
                    value: pattern,
                    repeat: 1
                });
            }
            i += len;
        }
    }

    // 3. Rename common sections (Heuristic)
    if (suggestedSections.length >= 2) {
        suggestedSections[0].label = 'Intro';
        if (suggestedSections[1]) suggestedSections[1].label = 'Verse';
        if (suggestedSections[2]) suggestedSections[2].label = 'Chorus';
    }

    return suggestedSections;
}
