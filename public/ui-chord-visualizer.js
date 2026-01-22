import { arranger, cb } from './state.js';
import { formatUnicodeSymbols } from './utils.js';
import { TIME_SIGNATURES } from './config.js';
import { UIStore } from './ui-store.js';

/**
 * Handles the rendering and updating of the Chord Visualizer UI.
 */
export function renderChordVisualizer(ui) {
    if (!ui.chordVisualizer) return;
    
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const sections = [];
    let currentSection = null;
    let currentMeasure = null;
    let currentMeasureBeats = 0;

    arranger.progression.forEach((chord, i) => {
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

    const totalMeasures = sections.reduce((acc, s) => acc + s.measures.length, 0);
    ui.chordVisualizer.dataset.totalMeasures = totalMeasures;

    const isMaximized = document.body.classList.contains('chord-maximized');

    // DOM RECYCLING STRATEGY
    const existingCards = Array.from(ui.chordVisualizer.querySelectorAll('.chord-card'));
    const progressionChanged = existingCards.length !== arranger.progression.length;
    const existingBlocks = ui.chordVisualizer.querySelectorAll('.section-block');
    const structureChanged = existingBlocks.length !== sections.length;

    if (!progressionChanged && !structureChanged) {
        let cardIndex = 0;
        sections.forEach((section, sIdx) => {
            const block = existingBlocks[sIdx];
            const header = block.querySelector('.section-block-header');
            if (header.textContent !== formatUnicodeSymbols(section.label)) {
                header.textContent = formatUnicodeSymbols(section.label);
            }

            section.measures.forEach(measure => {
                measure.chords.forEach(chord => {
                    const card = existingCards[cardIndex];
                    const isMinor = chord.isMinor;
                    const isActive = chord.globalIndex === cb.lastActiveChordIndex;
                    
                    if (card.classList.contains('minor') !== isMinor) card.classList.toggle('minor', isMinor);
                    if (card.classList.contains('active') !== isActive) card.classList.toggle('active', isActive);

                    const notation = arranger.notation || 'roman';
                    const disp = chord.display ? chord.display[notation] : null;
                    const html = `<span class="root">${formatUnicodeSymbols(disp.root)}</span><span class="suffix">${formatUnicodeSymbols(disp.suffix)}</span>${disp.bass ? `<span class="bass-note">/${formatUnicodeSymbols(disp.bass)}</span>` : ''}`;
                    
                    if (card.innerHTML !== html) {
                        card.innerHTML = html;
                        const charCount = disp.root.length + disp.suffix.length + (disp.bass ? disp.bass.length + 1 : 0);
                        applyDynamicFontSize(card, charCount, measure.chords.length, totalMeasures, isMaximized);
                    }
                    
                    card.onclick = (e) => {
                        e.stopPropagation();
                        if (window.previewChord) window.previewChord(chord.globalIndex);
                    };

                    cardIndex++;
                });
            });
        });

        UIStore.cachedCards = existingCards;
        if (!isMaximized) autoScrollToActive(ui.chordVisualizer);
        return;
    }

    ui.chordVisualizer.innerHTML = '';
    const newCards = [];
    let activeBlockContent = null;
    let pendingKeyLabel = null;

    sections.forEach((section) => {
        const sectionData = arranger.sections.find(s => s.id === section.id);
        const isSeamless = sectionData && sectionData.seamless;
        let content;

        if (isSeamless && activeBlockContent) {
            content = activeBlockContent;
            pendingKeyLabel = section.label; 
        } else {
            const block = document.createElement('div');
            block.className = 'section-block';
            block.onclick = () => {
                const detail = { detail: { sectionId: section.id } };
                document.dispatchEvent(new CustomEvent('open-editor', detail));
            };

            const header = document.createElement('div');
            header.className = 'section-block-header';
            header.textContent = formatUnicodeSymbols(section.label);
            block.appendChild(header);

            content = document.createElement('div');
            content.className = 'section-block-content';
            block.appendChild(content);
            ui.chordVisualizer.appendChild(block);
            activeBlockContent = content;
            pendingKeyLabel = null;
        }

        section.measures.forEach((measure, mIdx) => {
            const mBox = document.createElement('div');
            mBox.className = 'measure-box';

            if (pendingKeyLabel && mIdx === 0) {
                const label = document.createElement('div');
                label.className = 'key-label';
                label.textContent = formatUnicodeSymbols(pendingKeyLabel);
                mBox.appendChild(label);
                mBox.classList.add('has-key-label');
                pendingKeyLabel = null;
            }

            measure.chords.forEach(chord => {
                const card = document.createElement('div');
                card.className = 'chord-card';
                if (chord.isMinor) card.classList.add('minor');
                if (chord.quality === 'aug' || chord.quality === 'augmaj7') card.classList.add('aug');
                if (chord.globalIndex === cb.lastActiveChordIndex) card.classList.add('active');

                const notation = arranger.notation || 'roman';
                const disp = chord.display ? chord.display[notation] : null;
                
                if (disp) {
                    card.innerHTML = `<span class="root">${formatUnicodeSymbols(disp.root)}</span><span class="suffix">${formatUnicodeSymbols(disp.suffix)}</span>`;
                    if (disp.bass) {
                        card.innerHTML += `<span class="bass-note">/${formatUnicodeSymbols(disp.bass)}</span>`;
                    }
                    const charCount = disp.root.length + disp.suffix.length + (disp.bass ? disp.bass.length + 1 : 0);
                    applyDynamicFontSize(card, charCount, measure.chords.length, totalMeasures, isMaximized);
                } else {
                    card.textContent = formatUnicodeSymbols(chord.absName) || '...';
                    applyDynamicFontSize(card, card.textContent.length, measure.chords.length, totalMeasures, isMaximized);
                }

                card.onclick = (e) => {
                    e.stopPropagation();
                    if (window.previewChord) window.previewChord(chord.globalIndex);
                };

                mBox.appendChild(card);
                newCards.push(card);
            });
            content.appendChild(mBox);
        });
    });

    UIStore.cachedCards = newCards;
    if (!isMaximized) autoScrollToActive(ui.chordVisualizer);
}

/**
 * Ensures the active chord card is visible, scrolling proactively
 * so the musician can see the upcoming measures.
 */
function autoScrollToActive(container) {
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
}

/**
 * Adjusts font size based on the number of chords in a measure, length of name,
 * and the total song density to ensure a single-page fit in maximized view.
 */
function applyDynamicFontSize(card, charCount, chordsInMeasure, totalMeasures, isMaximized) {
    let scale = 1.0;
    
    // 1. Density Scale (Song Length)
    if (isMaximized) {
        // Less aggressive scaling for maximized view
        if (totalMeasures > 24) scale *= 0.9;
        if (totalMeasures > 32) scale *= 0.8;
        if (totalMeasures > 48) scale *= 0.7;
    }

    // 2. Chord Name Scale
    if (charCount > 7) scale *= 0.9;
    if (charCount > 10) scale *= 0.8;
    
    // 3. Measure Density Scale
    if (chordsInMeasure > 2) scale *= 0.9;
    if (chordsInMeasure > 3) scale *= 0.8;

    if (scale < 1.0) {
        card.style.setProperty('--font-scale', scale.toFixed(2));
    } else {
        card.style.removeProperty('--font-scale');
    }
}