import { h } from 'preact';
import React from 'preact/compat';

export function SymbolMenu({ onSelect, onClose }) {
    const symbols = ['|', 'maj7', 'm7', '7', 'ø', 'o', 'aug', 'aug7', 'sus4', 'sus2', '#', 'b', ',', '-'];

    return (
        <div class="symbol-dropdown" onClick={(e) => e.stopPropagation()}>
            {symbols.map(sym => (
                <button 
                    key={sym}
                    class="symbol-btn" 
                    onClick={() => {
                        onSelect(sym);
                        onClose();
                    }}
                >
                    {sym}
                </button>
            ))}
        </div>
    );
}
