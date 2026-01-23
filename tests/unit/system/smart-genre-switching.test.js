/* eslint-disable */
import { describe, it, expect, vi } from 'vitest';
import { ACTIONS } from '../../../public/types.js';
import { arranger, playback, chords, bass, soloist, harmony, groove, vizState, storage, midi, dispatch } from '../../../public/state.js';

describe('Smart Genre Switching', () => {
    it('should queue a genre change during playback (pending)', () => {
        playback.isPlaying = true;
        
        dispatch(ACTIONS.SET_GENRE_FEEL, {
            feel: 'Jazz',
            swing: 60,
            sub: '8th',
            genreName: 'Jazz'
        });

        // Current genre should remain Rock
        expect(groove.genreFeel).toBe('Rock');
        // Pending should be set
        expect(groove.pendingGenreFeel).not.toBeNull();
        expect(groove.pendingGenreFeel.feel).toBe('Jazz');
    });

    it('should apply genre change immediately if not playing', () => {
        playback.isPlaying = false;
        
        dispatch(ACTIONS.SET_GENRE_FEEL, {
            feel: 'Funk',
            swing: 15,
            sub: '16th',
            genreName: 'Funk'
        });

        // Should apply immediately
        expect(groove.genreFeel).toBe('Funk');
        expect(groove.swing).toBe(15);
        expect(groove.swingSub).toBe('16th');
        expect(groove.pendingGenreFeel).toBeNull();
    });

    it('should set appropriate instrument styles for each smart genre', () => {
        // This simulates what ui-controller.js does when it dispatches SET_GENRE_FEEL
        // and then dispatches SET_STYLE/SET_ACTIVE_TAB
        
        const JAZZ_CONFIG = { feel: 'Jazz', swing: 60, sub: '8th', drum: 'Jazz', feel: 'Jazz', chord: 'jazz', bass: 'quarter', soloist: 'bird' };
        
        dispatch(ACTIONS.SET_GENRE_FEEL, JAZZ_CONFIG);
        dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: JAZZ_CONFIG.chord });
        dispatch(ACTIONS.SET_STYLE, { module: 'bass', style: JAZZ_CONFIG.bass });
        dispatch(ACTIONS.SET_STYLE, { module: 'soloist', style: JAZZ_CONFIG.soloist });

        expect(chords.style).toBe('jazz');
        expect(bass.style).toBe('quarter');
        expect(soloist.style).toBe('bird');
    });
});