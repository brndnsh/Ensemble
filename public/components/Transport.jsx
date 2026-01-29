import { h } from 'preact';
import React from 'preact/compat';
import { useEnsembleState } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { dispatch } from '../state.js';
import { setBpm } from '../app-controller.js';
import { togglePlay } from '../scheduler-core.js';
import { playback } from '../state.js'; // Direct access for viz, audio
import { handleTap } from '../instrument-controller.js';

export function Transport() {
    const { isPlaying, bpm } = useEnsembleState(state => ({
        isPlaying: state.playback.isPlaying,
        bpm: state.playback.bpm
    }));

    const onTogglePlay = () => {
        // Pass playback.viz as required by legacy togglePlay
        togglePlay(playback.viz);
    };

    const onBpmInput = (e) => {
        setBpm(e.target.value, playback.viz);
    };

    const onTap = (e) => {
        handleTap((val) => setBpm(val, playback.viz));
        
        // Visual feedback
        const btn = e.currentTarget;
        btn.classList.add('handle-tap');
        setTimeout(() => btn.classList.remove('handle-tap'), 100);
    };

    const openSettings = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
    };

    return (
        <div class="main-controls">
            <button 
                id="playBtn" 
                class={`primary-btn ${isPlaying ? 'playing' : ''}`}
                onClick={onTogglePlay}
            >
                <span id="playBtnText">{isPlaying ? 'STOP' : 'START'}</span>
                <span id="playBtnTimer" class="btn-timer" style="display: none;"></span>
            </button>
            
            <div class="control-group" id="bpmControlGroup">
                <span class="control-label" id="bpm-label">BPM</span>
                <input 
                    type="number" 
                    id="bpmInput" 
                    value={bpm} 
                    min="40" 
                    max="240" 
                    aria-labelledby="bpm-label" 
                    aria-label="Tempo in BPM"
                    onInput={onBpmInput}
                />
                <button 
                    id="tapBtn" 
                    style="padding: 0.2rem 0.5rem; font-size: 0.8rem; height: auto;" 
                    aria-label="Tap Tempo"
                    onClick={onTap}
                >
                    TAP
                </button>
            </div>

            <button 
                id="settingsBtn" 
                style="padding: 0.5rem; background: transparent; border: none; font-size: 1.2rem; cursor: pointer;" 
                aria-label="Settings"
                onClick={openSettings}
            >
                ⚙️
            </button>
        </div>
    );
}
