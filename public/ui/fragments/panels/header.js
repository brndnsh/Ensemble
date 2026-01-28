export const headerHtml = `
<header>
    <h1>Ensemble</h1>
    
    <div class="main-controls">
        <button id="playBtn" class="primary-btn">
            <span id="playBtnText">START</span>
            <span id="playBtnTimer" class="btn-timer" style="display: none;"></span>
        </button>
        
        <div class="control-group" id="bpmControlGroup">
            <span class="control-label" id="bpm-label">BPM</span>
            <input type="number" id="bpmInput" value="100" min="40" max="240" aria-labelledby="bpm-label" aria-label="Tempo in BPM">
            <button id="tapBtn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; height: auto;" aria-label="Tap Tempo">TAP</button>
        </div>

        <button id="settingsBtn" style="padding: 0.5rem; background: transparent; border: none; font-size: 1.2rem; cursor: pointer;" aria-label="Settings">⚙️</button>
    </div>
</header>
`;
