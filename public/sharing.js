import { arranger, cb, gb, ctx } from './state.js';
import { ui, showToast } from './ui.js';
import { compressSections, normalizeKey } from './utils.js';

export function shareProgression() {
    try {
        const params = new URLSearchParams();
        params.set('s', compressSections(arranger.sections));
        params.set('key', ui.keySelect.value);
        params.set('ts', arranger.timeSignature);
        params.set('bpm', ui.bpmInput.value);
        params.set('style', cb.style);
        params.set('genre', gb.genreFeel);
        params.set('int', ctx.bandIntensity.toFixed(2));
        params.set('comp', ctx.complexity.toFixed(2));
        params.set('notation', arranger.notation);
        const url = window.location.origin + window.location.pathname + '?' + params.toString();
        
        navigator.clipboard.writeText(url).then(() => {
            showToast("Share link copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy URL: ", err);
            showToast("Failed to copy link. Please copy it from the address bar.");
        });
    } catch (e) {
        console.error("Error generating share link:", e);
        showToast("Error generating share link.");
    }
}
