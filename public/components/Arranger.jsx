import { h, Fragment } from 'preact';
import React from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { SectionCard } from './SectionCard.jsx';
import { onSectionUpdate } from '../arranger-controller.js';

export function Arranger() {
    const { sections, lastInteractedSectionId } = useEnsembleState(s => ({
        sections: s.arranger.sections,
        lastInteractedSectionId: s.arranger.lastInteractedSectionId
    }));

    useEffect(() => {
        if (lastInteractedSectionId) {
            const el = document.querySelector(`.section-card[data-id="${lastInteractedSectionId}"]`);
            if (el) {
                // Delay slightly to allow modal transition
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight or focus the textarea
                    const textarea = el.querySelector('textarea');
                    if (textarea) textarea.focus();
                }, 150);
            }
        }
    }, [lastInteractedSectionId]);

    useEffect(() => {
        const handleReorder = (e) => {
            const { draggedId, targetId } = e.detail;
            const draggedIdx = sections.findIndex(sec => sec.id === draggedId);
            const targetIdx = sections.findIndex(sec => sec.id === targetId);
            
            if (draggedIdx === -1 || targetIdx === -1) return;

            const newOrder = sections.map(sec => sec.id);
            newOrder.splice(draggedIdx, 1);
            newOrder.splice(targetIdx, 0, draggedId);
            
            onSectionUpdate(null, 'reorder', newOrder);
        };

        window.addEventListener('reorder-sections', handleReorder);
        return () => window.removeEventListener('reorder-sections', handleReorder);
    }, [sections]);

    if (!sections) return null;

    return (
        <Fragment>
            {sections.map((section, index) => (
                <SectionCard 
                    key={section.id} 
                    section={section} 
                    index={index} 
                    totalSections={sections.length} 
                />
            ))}
        </Fragment>
    );
}
