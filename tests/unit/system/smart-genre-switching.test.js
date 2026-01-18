/* eslint-disable */
import { describe, it, expect, vi } from 'vitest';
import { ACTIONS } from '../../../public/types.js';
import { gb, cb, bb, sb, dispatch, ctx } from '../../../public/state.js';

describe('Smart Genre Switching', () => {
    it('should queue a genre change during playback (pending)', () => {
        ctx.isPlaying = true;
        
        dispatch(ACTIONS.SET_GENRE_FEEL, {
            feel: 'Jazz',
            swing: 60,
            sub: '8th',
            genreName: 'Jazz'
        });

        // Current genre should remain Rock
        expect(gb.genreFeel).toBe('Rock');
        // Pending should be set
        expect(gb.pendingGenreFeel).not.toBeNull();
        expect(gb.pendingGenreFeel.feel).toBe('Jazz');
    });

    it('should apply genre change immediately if not playing', () => {
        ctx.isPlaying = false;
        
        dispatch(ACTIONS.SET_GENRE_FEEL, {
            feel: 'Funk',
            swing: 15,
            sub: '16th',
            genreName: 'Funk'
        });

        // Should apply immediately
        expect(gb.genreFeel).toBe('Funk');
        expect(gb.swing).toBe(15);
        expect(gb.swingSub).toBe('16th');
        expect(gb.pendingGenreFeel).toBeNull();
    });

    it('should set appropriate instrument styles for each smart genre', () => {
        // This simulates what ui-controller.js does when it dispatches SET_GENRE_FEEL
        // and then dispatches SET_STYLE/SET_ACTIVE_TAB
        
        const JAZZ_CONFIG = { feel: 'Jazz', swing: 60, sub: '8th', drum: 'Jazz', feel: 'Jazz', chord: 'jazz', bass: 'quarter', soloist: 'bird' };
        
        dispatch(ACTIONS.SET_GENRE_FEEL, JAZZ_CONFIG);
        dispatch(ACTIONS.SET_STYLE, { module: 'cb', style: JAZZ_CONFIG.chord });
        dispatch(ACTIONS.SET_STYLE, { module: 'bb', style: JAZZ_CONFIG.bass });
        dispatch(ACTIONS.SET_STYLE, { module: 'sb', style: JAZZ_CONFIG.soloist });

        expect(cb.style).toBe('jazz');
        expect(bb.style).toBe('quarter');
        expect(sb.style).toBe('bird');
    });
});