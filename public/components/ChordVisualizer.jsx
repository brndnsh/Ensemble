import { h, Fragment } from 'preact';
import { useMemo, useEffect, useRef } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { TIME_SIGNATURES } from '../config.js';

function ChordCard({ chord, isActive, totalMeasures, isMaximized }) {
    const notation = useEnsembleState(s => s.arranger.notation || 'roman');
    const disp = chord.display ? chord.display[notation] : null;
    
    const cardRef = useRef(null);

    useEffect(() => {
        if (!cardRef.current) return;
        const card = cardRef.current;
        const charCount = disp ? (disp.root.length + disp.suffix.length + (disp.bass ? disp.bass.length + 1 : 0)) : (chord.absName?.length || 0);
        
        let scale = 1.0;
        if (isMaximized) {
            if (totalMeasures > 24) scale *= 0.9;
            if (totalMeasures > 32) scale *= 0.8;
            if (totalMeasures > 48) scale *= 0.7;
        }
        if (charCount > 7) scale *= 0.9;
        if (charCount > 10) scale *= 0.8;
        
        // Note: measure chord count scaling is harder without measure context here, 
        // but we can pass it if needed.
        
        if (scale < 1.0) {
            card.style.setProperty('--font-scale', scale.toFixed(2));
        } else {
            card.style.removeProperty('--font-scale');
        }
    }, [disp, chord.absName, isMaximized, totalMeasures]);

    const handleClick = (e) => {
        e.stopPropagation();
        if (window.previewChord) window.previewChord(chord.globalIndex);
    };

    const classNames = [
        'chord-card',
        chord.isMinor ? 'minor' : '',
        (chord.quality === 'aug' || chord.quality === 'augmaj7') ? 'aug' : '',
        isActive ? 'active' : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={classNames} ref={cardRef} onClick={handleClick}>
            {disp ? (
                <Fragment>
                    <span className="root">{formatUnicodeSymbols(disp.root)}</span>
                    <span className="suffix">{formatUnicodeSymbols(disp.suffix)}</span>
                    {disp.bass && <span className="bass-note">/{formatUnicodeSymbols(disp.bass)}</span>}
                </Fragment>
            ) : (
                formatUnicodeSymbols(chord.absName) || '...'
            )}
        </div>
    );
}

export function ChordVisualizer() {
    const { progression, timeSignature, lastActiveChordIndex, sectionsState } = useEnsembleState(s => ({
        progression: s.arranger.progression,
        timeSignature: s.arranger.timeSignature,
        lastActiveChordIndex: s.chords.lastActiveChordIndex,
        sectionsState: s.arranger.sections
    }));

    const isMaximized = document.body.classList.contains('chord-maximized');
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

    const groupedSections = useMemo(() => {
        const sections = [];
        let currentSection = null;
        let currentMeasure = null;
        let currentMeasureBeats = 0;

        progression.forEach((chord, i) => {
            if (!currentSection || currentSection.id !== chord.sectionId) {
                currentSection = { id: chord.sectionId, label: chord.sectionLabel, measures: [] };
                sections.push(currentSection);
                currentMeasure = null;
            }

            if (!currentMeasure || currentMeasureBeats >= ts.beats) {
                currentMeasure = { chords: [] };
                currentSection.measures.push(currentMeasure);
                currentMeasureBeats = 0;
            }

            currentMeasure.chords.push({ ...chord, globalIndex: i });
            currentMeasureBeats += chord.beats;
        });
        return sections;
    }, [progression, ts]);

    const totalMeasures = useMemo(() => 
        groupedSections.reduce((acc, s) => acc + s.measures.length, 0), 
    [groupedSections]);

    useEffect(() => {
        // Sync attributes to the parent container
        const container = document.getElementById('chordVisualizer');
        if (!container) return;
        
        container.dataset.totalMeasures = totalMeasures;

        if (isMaximized) return;
        
        const activeCard = container.querySelector('.chord-card.active');
        if (!activeCard) return;

        const containerRect = container.getBoundingClientRect();
        const cardRect = activeCard.getBoundingClientRect();
        const scrollThreshold = containerRect.top + (containerRect.height * 0.7);
        
        if (cardRect.bottom > scrollThreshold || cardRect.top < containerRect.top) {
            const targetScrollTop = container.scrollTop + (cardRect.top - containerRect.top) - (containerRect.height * 0.2);
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        }
    }, [lastActiveChordIndex, isMaximized, totalMeasures]);

    return (
        <Fragment>
            {groupedSections.map((section, sIdx) => {
                const sectionData = sectionsState.find(s => s.id === section.id);
                const isSeamless = sectionData && sectionData.seamless;
                
                return (
                    <div 
                        key={section.id} 
                        className={`section-block ${isSeamless ? 'seamless' : ''}`}
                        onClick={() => {
                            const detail = { detail: { sectionId: section.id } };
                            document.dispatchEvent(new CustomEvent('open-editor', detail));
                        }}
                    >
                        {!isSeamless && (
                            <div className="section-block-header">
                                {formatUnicodeSymbols(section.label)}
                            </div>
                        )}
                        <div className="section-block-content">
                            {section.measures.map((measure, mIdx) => (
                                <div key={mIdx} className="measure-box">
                                    {isSeamless && mIdx === 0 && (
                                        <div className="key-label">{formatUnicodeSymbols(section.label)}</div>
                                    )}
                                    {measure.chords.map(chord => (
                                        <ChordCard 
                                            key={chord.globalIndex}
                                            chord={chord}
                                            isActive={chord.globalIndex === lastActiveChordIndex}
                                            totalMeasures={totalMeasures}
                                            isMaximized={isMaximized}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </Fragment>
    );
}
