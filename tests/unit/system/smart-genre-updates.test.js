import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';
const { chords, bass, soloist, harmony, groove, playback } = getState();
import { ACTIONS } from '../../../public/types.js';

describe('Smart Genre State Updates', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        // Ensure we are not playing to avoid pending state
        playback.isPlaying = false;
    });

    it('should update all instruments and switch to smart tabs when a genre is selected', () => {
        // Set some non-default states first
        chords.activeTab = 'classic';
        bass.activeTab = 'classic';
        groove.activeTab = 'classic';
        
        const payload = {
            genreName: 'Funk',
            feel: 'Funk',
            swing: 15,
            sub: '16th',
            drum: 'Funk',
            chord: 'funk',
            bass: 'funk',
            soloist: 'blues',
            harmony: 'horns'
        };

        dispatch(ACTIONS.SET_GENRE_FEEL, payload);

        // Check Groove
        expect(groove.genreFeel).toBe('Funk');
        expect(groove.swing).toBe(15);
        expect(groove.swingSub).toBe('16th');
        expect(groove.activeTab).toBe('smart');

        // Check Chords
        expect(chords.style).toBe('funk');
        expect(chords.activeTab).toBe('smart');

        // Check Bass
        expect(bass.style).toBe('funk');
        expect(bass.activeTab).toBe('smart');

        // Check Soloist
        expect(soloist.style).toBe('blues');
        expect(soloist.activeTab).toBe('smart');

        // Check Harmony
        expect(harmony.style).toBe('horns');
        expect(harmony.activeTab).toBe('smart');
    });
});
