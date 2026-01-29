/** @jsx h */
/** @jsx h */
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { SymbolMenu } from './SymbolMenu.jsx';
import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import { formatUnicodeSymbols } from '../utils.js';
import { onSectionUpdate, onSectionDelete, onSectionDuplicate } from '../arranger-controller.js';

export function SectionCard({ section, index, totalSections }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const textareaRef = useRef(null);
    
    const { isMinor, arrangerKey } = useEnsembleState(s => ({
        isMinor: s.arranger.isMinor,
        arrangerKey: s.arranger.key
    }));

    const handleDragStart = (e) => {
        e.dataTransfer.setData('text/plain', section.id);
        e.currentTarget.classList.add('dragging');
    };

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging');
        document.querySelectorAll('.section-card').forEach(el => el.classList.remove('drag-over'));
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId !== section.id) {
            e.currentTarget.classList.add('drag-over');
        }
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== section.id) {
            const event = new CustomEvent('reorder-sections', { 
                detail: { draggedId, targetId: section.id } 
            });
            window.dispatchEvent(event);
        }
    };

    const insertSymbol = (sym) => {
        const input = textareaRef.current;
        if (!input) return;
        
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end);
        
        const newValue = before + sym + after;
        onSectionUpdate(section.id, 'value', newValue);
        
        // Restore focus and cursor position after render
        setTimeout(() => {
            input.focus();
            input.selectionStart = input.selectionEnd = start + sym.length;
        }, 0);
    };

    return (
        <div 
            class={`section-card ${section.seamless ? 'linked' : ''} ${isMenuOpen ? 'menu-active' : ''}`}
            data-id={section.id}
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            <div class="section-header">
                <div class="section-title-row">
                    <input 
                        class="section-label-input" 
                        value={section.label} 
                        onChange={(e) => onSectionUpdate(section.id, 'label', e.target.value)}
                    />
                </div>
                
                <div class="section-controls-row">
                    <div class="section-settings-row">
                        {/* Repeat Control */}
                        <div class="section-setting-item">
                            <span class="setting-label">x</span>
                            <input 
                                type="number" 
                                class="section-repeat-input" 
                                value={section.repeat || 1} 
                                min="1" 
                                max="8" 
                                onChange={(e) => onSectionUpdate(section.id, 'repeat', parseInt(e.target.value))}
                            />
                        </div>

                        {/* Key Control */}
                        <select 
                            class="section-key-select"
                            value={section.key || ''}
                            onChange={(e) => onSectionUpdate(section.id, 'key', e.target.value)}
                        >
                            <option value="">Key: Auto</option>
                            {KEY_ORDER.map(k => (
                                <option key={k} value={k}>
                                    Key: {formatUnicodeSymbols(k)}{isMinor ? 'm' : ''}
                                </option>
                            ))}
                        </select>

                        {/* Time Signature Control */}
                        <select 
                            class="section-ts-select"
                            value={section.timeSignature || ''}
                            onChange={(e) => onSectionUpdate(section.id, 'timeSignature', e.target.value)}
                        >
                            <option value="">TS: Auto</option>
                            {Object.keys(TIME_SIGNATURES).map(ts => (
                                <option key={ts} value={ts}>TS: {ts}</option>
                            ))}
                        </select>
                    </div>

                    <div class="section-actions">
                        <button 
                            class={`section-link-btn ${section.seamless ? 'active' : ''}`}
                            title={section.seamless ? 'Unlink from previous (Enable Fills)' : 'Link to previous (Seamless Transition)'}
                            onClick={() => onSectionUpdate(section.id, 'seamless', !section.seamless)}
                        >🔗</button>

                        <button 
                            class="section-move-btn" 
                            title="Move Up" 
                            onClick={() => onSectionUpdate(section.id, 'move', -1)}
                            disabled={index === 0}
                        >▴</button>

                        <button 
                            class="section-move-btn" 
                            title="Move Down" 
                            onClick={() => onSectionUpdate(section.id, 'move', 1)}
                            disabled={index === totalSections - 1}
                        >▾</button>
                        
                        <button 
                            class="section-duplicate-btn" 
                            title="Duplicate" 
                            onClick={() => onSectionDuplicate(section.id)}
                        >⎘</button>

                        <div style="position: relative; display: inline-block;">
                            <button 
                                class="section-kebab-btn" 
                                title="Insert Symbol"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen(!isMenuOpen);
                                }}
                            >⋮</button>
                            {isMenuOpen && (
                                <SymbolMenu 
                                    onSelect={insertSymbol} 
                                    onClose={() => setIsMenuOpen(false)} 
                                />
                            )}
                        </div>
                        
                        <button 
                            class="section-delete-btn" 
                            title="Delete" 
                            onClick={() => onSectionDelete(section.id)}
                        >✕</button>
                    </div>
                </div>
            </div>

            <textarea 
                ref={textareaRef}
                class="section-prog-input" 
                value={section.value} 
                placeholder="Enter chords (e.g. C Am F G)"
                onInput={(e) => onSectionUpdate(section.id, 'value', e.target.value)}
                onFocus={() => {
                    // Update legacy state for mutation logic
                    const { arranger } = require('../state.js');
                    arranger.lastInteractedSectionId = section.id;
                }}
            />
        </div>
    );
}
