# Musical Authenticity & Genre Refinements

- [x] **Funk "Syncopated Ghosting"**: Implement procedural 16th-note snare ghosting and dynamic hi-hat "barks" for the Funk groove, moving away from static 2-bar loops.
- [x] **Bossa Nova Snare Variation**: Add a set of authentic Clave-based variations for the Bossa rimshot that evolve over time to prevent the "drum machine" effect.
- [x] **Reggae "Style Switching"**: Implement "One Drop", "Rockers", and "Steppers" variations for the Reggae genre that swap based on `ctx.bandIntensity`.
- [x] **Neo-Soul "Quantization Mismatch"**: Introduce micro-timing offsets that differ between instruments (e.g., straight hi-hats vs. swung kick/snare) to achieve a deeper "Dilla" feel.
- [x] **Jazz Soloist "Enclosures"**: Enhance the `bird` soloist style with enclosure patterns (surrounding target chord tones with chromatic neighbors) and more aggressive syncopation.
- [x] **Conversational Comping**: Update the `accompaniment` engine to listen to the `soloist` (via `sb.busySteps`) and reduce its own density during lead phrases, "filling" only during the soloist's rests.

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



# Future Instrument-Specific Stylistic Refinements



## Bass Engine (Authentic Phrasing)

- [x] **Jazz "Walking" Logic**: Refine the `walking` style in `bass.js` to prioritize chromatic approach notes.
- [x] **Funk "Slap & Pop" Articulation**: Implement a toggle for high-velocity "pops" on syncopated octaves.
- [x] **Reggae "Riddim" Library**: Implement a collection of genre-standard patterns that adapt to song structure.
- [x] **Neo-Soul "Behind the Beat"**: Introduce micro-timing offsets for a "human" feel.

## Accompaniment Engine (Comping & Voicing)

- [x] **Jazz "Rootless Voicings"**: Transition to pro-level jazz clusters.
- [x] **Reggae "The Bubble & The Skank"**: Implement dual-keyboard rhythmic patterns.
- [x] **Funk "Clav-Style" Rhythms**: Add high-syncopation percussive modes.
- [x] **Neo-Soul "Quartal Clusters"**: Implement modern, open harmonies.



## Verification & Research

- [x] **Genre Stress Tests**: Expand the probabilistic test suite to verify rhythmic anchors.

    - *Plan*: Create `genre-integrity.test.js` to run 2000-measure simulations. Assert that the Reggae "One Drop" (kick on 3) is never violated and that Jazz walking bass never hits a root on beat 4 unless it's a pedal point.

- [x] **Reference Comparison**: Fine-tune velocity and timing curves against classic records.

    - *Plan*: Document specific reference tracks (e.g., "Cantaloupe Island" for Jazz-Funk, "Redemption Song" for Reggae) and adjust the engine's default velocity maps to match their dynamic range.

# Procedural Genre Expansion

- [x] **Rock "Stadium" Logic**: Implement dynamic switching between "Tight" (closed hats, rimshots) and "Anthem" (open hats, heavy crash rides) modes based on intensity.
- [x] **Disco "Four-on-the-Floor" Engine**: Create a dedicated procedural engine for Disco that locks the Kick to 1-2-3-4 and modulates the offbeat Hi-Hat duration (open/closed) based on song sections.
- [ ] **Hip Hop "Boom Bap" Swing**: Differentiate Hip Hop from Neo-Soul by implementing a "hard swing" (MPC 60% swing) versus the Neo-Soul "lag" (unquantized drag).
