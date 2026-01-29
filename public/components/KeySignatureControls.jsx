import { h } from 'preact';
import { useEnsembleState, useDispatch } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { transposeKey, switchToRelativeKey, updateGroupingUI, validateAndAnalyze } from '../arranger-controller.js';
import { saveCurrentState } from '../persistence.js';
import { loadDrumPreset } from '../instrument-controller.js';
import { formatUnicodeSymbols } from '../utils.js';

export function KeySignatureControls() {
    const dispatch = useDispatch();
    const { 
        arrangerKey, 
        timeSignature, 
        isMinor, 
        grouping,
        lastDrumPreset 
    } = useEnsembleState(s => ({
        arrangerKey: s.arranger.key,
        timeSignature: s.arranger.timeSignature,
        isMinor: s.arranger.isMinor,
        grouping: s.arranger.grouping,
        lastDrumPreset: s.groove.lastDrumPreset
    }));

    const handleKeyChange = (e) => {
        const newKey = e.target.value;
        import('../state.js').then(({ arranger }) => {
            arranger.key = newKey;
            validateAndAnalyze();
            saveCurrentState();
            // Trigger a re-render via bridge if needed, 
            // though bridge usually handles direct mutations if they trigger bridge updates
            dispatch('KEY_CHANGE'); 
        });
    };

    const handleTimeSigChange = (e) => {
        const newTS = e.target.value;
        import('../state.js').then(({ arranger, groove }) => {
            arranger.timeSignature = newTS;
            arranger.grouping = null;
            if (lastDrumPreset) loadDrumPreset(lastDrumPreset);
            validateAndAnalyze();
            saveCurrentState();
            dispatch('TIME_SIG_CHANGE');
        });
    };

    const toggleGrouping = () => {
        const event = new CustomEvent('toggle-grouping');
        window.dispatchEvent(event);
        // The actual logic is in arranger-controller.js which we'll keep for now 
        // but we can move it to state if we want full purity.
        // For now, arranger-controller has a listener for groupingLabel click.
        document.getElementById('groupingLabel')?.click();
    };

    const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const timeSignatures = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8', '7/4', '12/8'];

    return (
        <div class="key-controls">
            <button 
                id="maximizeChordBtn" 
                title="Maximize" 
                class="header-btn" 
                aria-label="Maximize Chords"
                onClick={() => {
                    const isMax = document.body.classList.toggle('chord-maximized');
                    const btn = document.getElementById('maximizeChordBtn');
                    if (btn) {
                        btn.textContent = isMax ? '✕' : '⛶';
                        btn.title = isMax ? 'Exit Maximize' : 'Maximize';
                    }
                }}
            >⛶</button>

            <div class="time-sig-group">
                <select 
                    id="timeSigSelect" 
                    value={timeSignature} 
                    onChange={handleTimeSigChange}
                    aria-label="Time Signature"
                >
                    {timeSignatures.map(ts => (
                        <option key={ts} value={ts}>{ts}</option>
                    ))}
                </select>
                <div id="groupingToggle" style={{ display: (['5/4', '7/8', '7/4'].includes(timeSignature)) ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }}>
                    <button 
                        id="groupingLabel" 
                        type="button" 
                        class="badge-btn" 
                        title="Click to toggle grouping" 
                        aria-label="Toggle rhythmic grouping"
                        onClick={toggleGrouping}
                    >
                        {grouping ? grouping.join('+') : '3+2'}
                    </button>
                </div>
            </div>

            <select 
                id="keySelect" 
                value={arrangerKey} 
                onChange={handleKeyChange}
                aria-label="Select Key"
            >
                {keys.map(k => (
                    <option key={k} value={k}>
                        {formatUnicodeSymbols(k)}{isMinor ? 'm' : ''}
                    </option>
                ))}
            </select>

            <button 
                id="relKeyBtn" 
                title="Relative Key (Major/Minor)" 
                class="header-btn rel-key-btn" 
                aria-label="Relative Key Toggle"
                onClick={() => {
                    switchToRelativeKey();
                    dispatch('REL_KEY_TOGGLE');
                }}
            >
                {isMinor ? 'min' : 'maj'}
            </button>

            <button 
                id="transDownBtn" 
                title="Transpose Down" 
                class="header-btn" 
                aria-label="Transpose Down"
                onClick={() => {
                    transposeKey(-1);
                    dispatch('TRANSPOSE');
                }}
            >♭</button>

            <button 
                id="transUpBtn" 
                title="Transpose Up" 
                class="header-btn" 
                aria-label="Transpose Up"
                onClick={() => {
                    transposeKey(1);
                    dispatch('TRANSPOSE');
                }}
            >♯</button>
        </div>
    );
}
