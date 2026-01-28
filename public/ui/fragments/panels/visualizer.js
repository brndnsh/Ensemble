export const visualizerPanelHtml = `
<div class="panel dashboard-panel" id="panel-visualizer" data-id="visualizer">
    <div class="panel-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button id="vizPowerBtn" class="power-btn" aria-label="Toggle Visualizer">⏻</button>
            <h2>Visualizer</h2>
        </div>
    </div>
    
    <div class="viz-graph-area">
        <div id="unifiedVizContainer"></div>
    </div>

    <div class="viz-legend">
        <div class="legend-group">
            <span class="legend-label">Chords:</span>
            <div class="legend-item">
                <div class="legend-swatch swatch-root"></div>
                <span>Root</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-third"></div>
                <span>3rd</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-fifth"></div>
                <span>5th</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-seventh"></div>
                <span>7th+</span>
            </div>
        </div>
        
        <div class="legend-group">
            <span class="legend-label">Soloist:</span>
            <div class="legend-item">
                <div class="legend-swatch swatch-root"></div>
                <span>Target</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-fifth"></div>
                <span>Arp</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-seventh"></div>
                <span>Alt</span>
            </div>
        </div>

        <div class="legend-group">
            <span class="legend-label">Band:</span>
            <div class="legend-item">
                <div class="legend-swatch swatch-bass"></div>
                <span>Bass</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-harmony"></div>
                <span>Harmony</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch swatch-drums"></div>
                <span>Drums</span>
            </div>
        </div>
    </div>
</div>
`;
