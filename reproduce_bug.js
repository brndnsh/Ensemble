
import { getFormattedChordNames, getChordDetails } from './public/chords.js';

console.log("Testing im9...");
let quality = 'm9';
let is7th = true;
let formatted = getFormattedChordNames('C', '1', 'I', quality, is7th);
console.log(`Input: quality=${quality}, is7th=${is7th}`);
console.log(`Output: ${formatted.roman.root}${formatted.roman.suffix}`);

console.log("\nTesting IV13...");
quality = '13';
is7th = true;
formatted = getFormattedChordNames('F', '4', 'IV', quality, is7th);
console.log(`Input: quality=${quality}, is7th=${is7th}`);
console.log(`Output: ${formatted.roman.root}${formatted.roman.suffix}`);
