# Size Reduction & Optimization TODO

- [x] **Compact Drum Pattern Storage**: Convert `DRUM_PRESETS` arrays to strings (e.g., `"2010"`) and parse on load to save source bytes.
- [x] **UI Selection Helper**: Replace manual `document.getElementById` calls in `ui.js` with a loop-based binder.
- [x] **CSS Audit**: Refactor `styles.css` to reduce redundancy and optimize theme-specific rules. (Consolidated icons and utility classes)
- [x] **Module Decomposition**: Split `main.js` into smaller modules (`history.js`, `form-analysis.js`, `pwa.js`, `conductor.js`, `persistence.js`, `instrument-controller.js`, `arranger-controller.js`, `ui-controller.js`).

# Smart Groove Refinements (Pro-Level)

- [x] **Timbre Shifting**: Dynamically swap drum samples/articulations (e.g., Sidestick vs. full Snare, Closed vs. Open Hats) based on `ctx.bandIntensity` thresholds.
- [x] **Intelligent Pocket**: Link micro-timing to intensity/form. Play slightly "ahead" during climaxes and "behind" (laid back) during cool-downs or Neo-Soul grooves.
- [x] **Intensity-Aware Mixing**: Automate reverb and compression. Dry out the mix as it gets denser/louder to maintain clarity; add space during sparse, low-energy sections.
- [x] **Harmonic Anticipation**: Implement "Ghost Kicks" or Hi-Hat "Barks" on the final 16th note of a section to setup major transitions.