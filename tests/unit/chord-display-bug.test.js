// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { getFormattedChordNames, getChordDetails, resolveChordRoot } from '../../public/chords.js';
import { ROMAN_VALS } from '../../public/config.js';

describe('Chord Display Bug Reproduction', () => {
    
    it('reproduces im9 rendering issue', () => {
        // "im9"
        const symbol = "im9";
        const rootPart = "i";
        const suffixPart = "m9";
        
        // Simulation of what happens in parseProgressionPart
        let { quality, is7th } = getChordDetails(suffixPart);
        // quality should be 'm9', is7th true
        
        expect(quality).toBe('m9');
        expect(is7th).toBe(true);

        // Roman numeral casing logic in parseProgressionPart check
        // (It doesn't change quality 'm9')
        
        // Now getFormattedChordNames
        const rootName = "C"; // Hypotehtical
        const rootNNS = "1";
        const rootRomanBase = "I";
        
        const formatted = getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th);
        
        // Expected: root should be 'i', suffix should be '9' (or 'm9') -> "i9"
        // Actual bug: root is 'I', suffix is '97' -> "I97"
        
        console.log('im9 formatted:', formatted.roman.root + formatted.roman.suffix);
        
        expect(formatted.roman.root).toBe('i'); // Fails if 'I'
        expect(formatted.roman.suffix).not.toContain('7'); // Fails if '97'
    });

    it('reproduces IV13 rendering issue', () => {
        // "IV13"
        const suffixPart = "13";
        let { quality, is7th } = getChordDetails(suffixPart);
        
        expect(quality).toBe('13');
        expect(is7th).toBe(true);
        
        const formatted = getFormattedChordNames("F", "4", "IV", quality, is7th);
        
        console.log('IV13 formatted:', formatted.roman.root + formatted.roman.suffix);

        // Expectation: IV13
        // Potential Bug: IV137
        expect(formatted.roman.suffix).toBe('13');
    });

});
