import { arranger } from './state.js';

export const SECTION_ENERGY_MAP = {
    'intro': 0.4, 'verse': 0.5, 'pre-chorus': 0.6, 'build': 0.7,
    'chorus': 0.9, 'drop': 1.0, 'bridge': 0.6, 'solo': 0.8,
    'outro': 0.4, 'breakdown': 0.3
};

/**
 * Returns a baseline energy level (0.0 - 1.0) based on section label.
 * @param {string} label 
 * @returns {number}
 */
export function getSectionEnergy(label) {
    if (!label) return 0.5;
    const lower = label.toLowerCase();
    for (const [key, val] of Object.entries(SECTION_ENERGY_MAP)) {
        if (lower.includes(key)) return val;
    }
    return 0.5; // Default
}

/**
 * Analyzes the arranger's progression to detect musical form and assign roles.
 * @returns {Object|null} The analyzed form data or null if no progression exists.
 */
export function analyzeForm() {
    if (!arranger.stepMap.length) return null;
    
    // 1. Simplify Labels to Abstract Sections (A, B, C...)
    const labels = arranger.stepMap.map(s => {
        const l = s.chord.sectionLabel.toLowerCase();
        if (l.includes('verse') || l.includes('a section')) return 'A';
        if (l.includes('chorus') || l.includes('b section')) return 'B';
        if (l.includes('bridge') || l.includes('c section')) return 'C';
        if (l.includes('intro')) return 'Intro';
        if (l.includes('outro')) return 'Outro';
        return l.charAt(0).toUpperCase();
    });
    
    // 2. Detect Form
    const sequence = labels.join('-');
    let formType = 'Linear';
    
    if (sequence.includes('A-A-B-A')) formType = 'AABA';
    else if (sequence.includes('A-A-B-C')) formType = 'AABC';
    else if (sequence.includes('A-B-A-B')) formType = 'ABAB';
    
    // 3. Assign Roles
    const roles = labels.map((label, i) => {
        if (label === 'Intro') return 'Exposition';
        if (label === 'Outro') return 'Resolution';
        
        if (formType === 'AABA') {
            if (i === 0) return 'Exposition';
            if (i === 1) return 'Development';
            if (label === 'B') return 'Contrast';
            if (i === 3) return 'Recapitulation';
        }
        
        if (formType === 'AABC') {
            if (i === 0) return 'Exposition';
            if (i === 1) return 'Development';
            if (label === 'B') return 'Build';
            if (label === 'C') return 'Climax';
        }

        if (label === 'B' || label === 'Chorus') return 'Climax';
        if (label === 'C' || label === 'Bridge') return 'Contrast';
        
        return 'Standard';
    });

    return { type: formType, sequence, roles };
}
