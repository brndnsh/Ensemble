export const songGeneratorModalHtml = `
<div id="generateSongOverlay" class="settings-overlay">
    <div class="settings-content">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
            <h2>Generate Song</h2>
            <button id="closeGenerateSongBtn" class="primary-btn" style="padding: 0.4rem 1rem; font-size: 0.9rem; background: transparent; border: 1px solid var(--border-color); color: var(--text-color);">Cancel</button>
        </div>
        
        <div class="settings-controls">
            <div class="settings-section">
                <h3>Style & Feel</h3>
                 <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Key</label>
                    <select id="genKeySelect" aria-label="Select Key for Generation" style="width: 100%;">
                        <option value="Random">🎲 Random</option>
                        <option value="C">C</option>
                        <option value="Db">D♭</option>
                        <option value="D">D</option>
                        <option value="Eb">E♭</option>
                        <option value="E">E</option>
                        <option value="F">F</option>
                        <option value="Gb">G♭</option>
                        <option value="G">G</option>
                        <option value="Ab">A♭</option>
                        <option value="A">A</option>
                        <option value="Bb">B♭</option>
                        <option value="B">B</option>
                    </select>
                </div>
                 <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Time Signature</label>
                    <select id="genTimeSigSelect" aria-label="Select Time Signature for Generation" style="width: 100%;">
                        <option value="Random">🎲 Random</option>
                        <option value="4/4">4/4 (Standard)</option>
                        <option value="3/4">3/4 (Waltz)</option>
                        <option value="6/8">6/8 (Compound)</option>
                    </select>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Structure</label>
                    <select id="genStructureSelect" aria-label="Select Song Structure" style="width: 100%;">
                        <option value="pop">Standard Pop (Verse-Chorus)</option>
                        <option value="ballad">Power Ballad</option>
                        <option value="random">🎲 Random Structure</option>
                    </select>
                </div>
            </div>

            <div class="settings-section">
                <h3>Seeding</h3>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-bottom: 1rem;">
                    <input type="checkbox" id="genSeedCheck">
                    <span>Seed from current section</span>
                </label>
                <div id="genSeedControls" style="display: none; transition: opacity 0.2s;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">Treat current section as:</label>
                    <select id="genSeedTypeSelect" aria-label="Select Seed Type" style="width: 100%;">
                        <option value="Verse">Verse</option>
                        <option value="Chorus">Chorus</option>
                    </select>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                        The generator will preserve your current chords for all sections of this type.
                    </p>
                </div>
            </div>

            <div style="margin-top: 1.5rem;">
                <button id="confirmGenerateSongBtn" class="primary-btn" style="width: 100%; padding: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                   <span>✨</span> Generate Full Song
                </button>
            </div>
        </div>
    </div>
</div>
`;
