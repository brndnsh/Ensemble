# Musical Authenticity & Genre Refinements

- [x] **Funk "Syncopated Ghosting"**: Implement procedural 16th-note snare ghosting and dynamic hi-hat "barks" for the Funk groove, moving away from static 2-bar loops.
- [x] **Bossa Nova Snare Variation**: Add a set of authentic Clave-based variations for the Bossa rimshot that evolve over time to prevent the "drum machine" effect.
- [x] **Reggae "Style Switching"**: Implement "One Drop", "Rockers", and "Steppers" variations for the Reggae genre that swap based on `ctx.bandIntensity`.
- [x] **Neo-Soul "Quantization Mismatch"**: Introduce micro-timing offsets that differ between instruments (e.g., straight hi-hats vs. swung kick/snare) to achieve a deeper "Dilla" feel.
- [ ] **Jazz Soloist "Enclosures"**: Enhance the `bird` soloist style with enclosure patterns (surrounding target chord tones with chromatic neighbors) and more aggressive syncopation.
- [ ] **Conversational Comping**: Update the `accompaniment` engine to listen to the `soloist` (via `sb.busySteps`) and reduce its own density during lead phrases, "filling" only during the soloist's rests.

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

# Architectural & Stability Improvements

- [x] **Automated Testing Suite**: Implement a unit testing framework (e.g., Vitest) to verify musical logic in `chords.js`, `utils.js`, and `arranger-controller.js`.
- [x] **State Management Refactor**: Decouple modules by replacing direct global state mutation with an event-driven system or formal state transitions to prevent race conditions.
- [x] **Audio Lifecycle Hardening**: Refine `killAllNotes` and "Panic" logic in `engine.js` to use rapid 5-10ms exponential ramps instead of immediate disconnections to eliminate DC offset clicks.
- [x] **Chord Theory Robustness**: Harden the chord parsing regex and logic in `chords.js` to better support polychords and complex jazz extensions (e.g., 11ths, 13ths with alterations).