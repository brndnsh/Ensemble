# Size Reduction & Optimization TODO

- [x] **Compact Drum Pattern Storage**: Convert `DRUM_PRESETS` arrays to strings (e.g., `"2010"`) and parse on load to save source bytes.
- [x] **UI Selection Helper**: Replace manual `document.getElementById` calls in `ui.js` with a loop-based binder.
- [ ] **CSS Audit**: Refactor `styles.css` to reduce redundancy and optimize theme-specific rules.
- [/] **Module Decomposition**: Split `main.js` into smaller modules (e.g., `history.js`, `form-analysis.js`) to improve maintainability and potentially load speed. (Started with `form-analysis.js`)
