/** @jsx h */
import { h } from 'preact';
import { memo } from 'preact/compat';
import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { getStepsPerMeasure, getStepInfo } from '../utils.js';
import { TIME_SIGNATURES } from '../config.js';
import { clearDrumPresetHighlight } from '../instrument-controller.js';
import { playback as playbackState } from '../state.js';

const Step = memo(({ instIdx, stepIdx, value, instName, stepInfo, onToggle }) => {
    const isPlaying = useEnsembleState(s => s.playback.isPlaying && s.playback.step === stepIdx);
    
    const className = [
        'step',
        value === 1 ? 'active' : '',
        value === 2 ? 'accented' : '',
        stepInfo.isGroupStart ? 'group-marker' : '',
        stepInfo.isBeatStart ? 'beat-marker' : '',
        isPlaying ? 'playing' : ''
    ].filter(Boolean).join(' ');

    const status = value === 1 ? 'active' : (value === 2 ? 'accented' : 'inactive');

    return (
        <div 
            className={className}
            data-inst-idx={instIdx}
            data-step-idx={stepIdx}
            role="button"
            tabIndex={0}
            aria-label={`${instName}, step ${stepIdx + 1}, ${status}`}
            onMouseDown={(e) => onToggle(e, instIdx, stepIdx)}
            onMouseOver={(e) => onToggle(e, instIdx, stepIdx)}
        />
    );
});

export function SequencerGrid() {
    const { instruments, measures, timeSignature } = useEnsembleState(s => ({
        instruments: s.groove.instruments,
        measures: s.groove.measures,
        timeSignature: s.arranger.timeSignature
    }));

    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState(0);
    const gridRef = useRef(null);

    const spm = getStepsPerMeasure(timeSignature);
    const totalSteps = measures * spm;
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

    useEffect(() => {
        const handleMouseUp = () => setIsDragging(false);
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const handleToggle = (e, instIdx, stepIdx) => {
        if (e.type === 'mouseover' && !isDragging) return;
        
        const inst = instruments[instIdx];
        let newType = dragType;

        if (e.type === 'mousedown') {
            if (inst.steps[stepIdx] === 0) newType = 1;
            else if (inst.steps[stepIdx] === 1) newType = 2;
            else newType = 0;
            
            setDragType(newType);
            setIsDragging(true);
        }

        if (inst.steps[stepIdx] !== newType) {
            inst.steps[stepIdx] = newType;
            clearDrumPresetHighlight();
            // Force update via bridge or local state if needed. 
            // Since we mutate inst.steps directly (legacy pattern), we trigger a dummy action to notify listeners.
            import('../state.js').then(({ dispatch }) => dispatch('STEP_TOGGLE'));
        }
    };

    const handleAudition = (inst) => {
        import('../engine.js').then(({ initAudio, playDrumSound }) => {
            initAudio();
            playDrumSound(inst.name, playbackState.audio.currentTime, 1.0);
        });
    };

    const handleMute = (inst, instIdx) => {
        inst.muted = !inst.muted;
        import('../state.js').then(({ dispatch }) => dispatch('MUTE_TOGGLE'));
    };

    return (
        <div className="sequencer-grid" id="sequencerGrid" ref={gridRef} role="grid" aria-label="Drum Sequencer">
            {instruments.map((inst, instIdx) => (
                <div key={inst.name} className="track">
                    <div className="track-header">
                        <span 
                            className={`track-symbol ${inst.muted ? 'muted' : ''}`} 
                            title={`Audition ${inst.name}`}
                            onClick={() => handleAudition(inst)}
                        >
                            {inst.symbol || inst.name.charAt(0)}
                        </span>
                        <button 
                            className={`mute-toggle ${inst.muted ? 'active' : ''}`}
                            title={inst.muted ? 'Unmute' : 'Mute'}
                            onClick={() => handleMute(inst, instIdx)}
                        >
                            M
                        </button>
                    </div>
                    <div className="steps" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
                        {Array.from({ length: totalSteps }).map((_, stepIdx) => (
                            <Step 
                                key={stepIdx}
                                instIdx={instIdx}
                                stepIdx={stepIdx}
                                value={inst.steps[stepIdx]}
                                instName={inst.name}
                                stepInfo={getStepInfo(stepIdx, ts)}
                                onToggle={handleToggle}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Label Row */}
            <div className="track label-row">
                <div className="track-header label-header"></div>
                <div className="steps" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
                    {Array.from({ length: totalSteps }).map((_, i) => {
                        const stepInfo = getStepInfo(i, ts);
                        const isBeatStart = stepInfo.isBeatStart;
                        const label = isBeatStart ? (stepInfo.beatIndex + 1) : ((i % ts.stepsPerBeat) + 1);
                        return (
                            <div key={i} className={`step-label ${isBeatStart ? 'beat-start' : ''} ${stepInfo.isGroupStart ? 'group-start' : ''}`}>
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
