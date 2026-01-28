export const editorModalHtml = `
<div id="editorOverlay" class="settings-overlay">
    <div class="settings-content editor-modal">
        <div class="modal-header">
            <h2>Arrangement Editor</h2>
            <button id="closeEditorBtn" class="primary-btn">Done</button>
        </div>
        
        <div class="editor-scroll-area">
            <div id="sectionList" class="section-list"></div>
        </div>

        <div class="modal-footer">
            <div class="footer-primary-actions">
                <button id="addSectionBtn" class="primary-btn footer-main-btn" title="Add Section">
                    <span>➕ Add Section</span>
                </button>
                <button id="arrangerActionTrigger" aria-label="Arranger Actions Menu" class="action-trigger-btn" title="Arranger Actions" style="justify-content: center; padding: 0.75rem 1rem;">
                    <span style="font-size: 1.2rem;">⋮</span>
                </button>
            </div>
            
            <div class="arranger-action-container">
                                    <div id="arrangerActionMenu" class="action-menu-content">
                        <button id="templatesBtn" title="Song Templates">📋 <span>Templates</span></button>
                        <button id="analyzeAudioBtn" title="Analyze Audio / Harmonize Melody">👂 <span>Analyze / Harmonize</span></button>
                        <button id="randomizeBtn" title="Randomize Progression" aria-label="Randomize Progression">🎲 <span>Random</span></button>
                        <button id="mutateBtn" title="Mutate Progression" aria-label="Mutate Progression">✨ <span>Mutate</span></button>
                        <button id="undoBtn" title="Undo Last Change" aria-label="Undo Last Change">↩️ <span>Undo</span></button>
                        <button id="clearProgBtn" title="Clear Progression" aria-label="Clear Progression">🗑️ <span>Clear</span></button>
                        <button id="shareBtn" title="Share Progression" aria-label="Share Progression">🔗 <span>Share</span></button>
                    </div>
            </div>
        </div>
    </div>
</div>
`;
