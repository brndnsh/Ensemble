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

    - *Plan*: Create `tests/standards/genre-integrity.test.js` to run 2000-measure simulations. Assert that the Reggae "One Drop" (kick on 3) is never violated and that Jazz walking bass never hits a root on beat 4 unless it's a pedal point.

- [x] **Reference Comparison**: Fine-tune velocity and timing curves against classic records.

    - *Plan*: Document specific reference tracks (e.g., "Cantaloupe Island" for Jazz-Funk, "Redemption Song" for Reggae) and adjust the engine's default velocity maps to match their dynamic range.

# Procedural Genre Expansion

- [x] **Rock "Stadium" Logic**: Implement dynamic switching between "Tight" (closed hats, rimshots) and "Anthem" (open hats, heavy crash rides) modes based on intensity.
- [x] **Disco "Four-on-the-Floor" Engine**: Create a dedicated procedural engine for Disco that locks the Kick to 1-2-3-4 and modulates the offbeat Hi-Hat duration (open/closed) based on song sections.
- [x] **Hip Hop "Boom Bap" Swing**: Differentiate Hip Hop from Neo-Soul by implementing a "hard swing" (MPC 60% swing) versus the Neo-Soul "lag" (unquantized drag).

# Engine Modularization (Technical Debt Reduction)

- [x] **Phase 1: Shared Utilities & Infrastructure**
    - Move `safeDisconnect` and non-graph helpers to `utils.js`.
    - Ensure `ctx` exports all necessary `AudioNode` buses (chordsGain, drumsGain, etc.) for external use.
- [x] **Phase 2: Instrument Logic Extraction**
    - Create `public/synth-drums.js`: Extract `playDrumSound`, `killDrumNote`, and internal drum oscillators/buffers.
    - Create `public/synth-bass.js`: Extract `playBassNote`, `killBassNote`, and monophonic tracking logic.
    - Create `public/synth-soloist.js`: Extract `playSoloNote`, `killSoloistNote`, and vibrato/bend synthesis.
    - Create `public/synth-chords.js`: Extract `playNote`, `playChordScratch`, `INSTRUMENT_PRESETS`, and sustain pedal management (`heldNotes`).
- [x] **Phase 3: Engine Orchestration & Facade**
    - Refactor `engine.js` to focus strictly on the global signal chain (Saturator, Limiter, Reverb, Bus Routing).
    - Implement a Facade pattern in `engine.js` by re-exporting the `play*` functions to ensure zero breaking changes in `main.js`.
- [x] **Phase 4: Reliability & Testing**
    - Verify monophonic "Panic" logic (`killAllNotes`) works across the new distributed architecture.
    - Run the full test suite (`npm test`) to ensure no regressions in audio timing or synthesis output.

# Main Orchestration Modularization (Technical Debt Reduction)

- [x] **Phase 1: Procedural Groove Extraction**
    - Create `public/groove-engine.js`: Extract the ~300 lines of `if (gb.genreFeel === '...')` logic from `scheduleDrums`.
    - Implement a clean API for instrument-specific procedural overrides (Kick/Snare/Hat variations).
- [x] **Phase 2: Scheduling & Timing Core**
    - Create `public/scheduler-core.js`: Isolate the high-precision `scheduler()`, `advanceGlobalStep()`, and `scheduleCountIn()` logic.
    - Decouple the clock logic from UI-specific countdowns.
- [x] **Phase 3: Animation & Visual Dispatch**
    - Create `public/animation-loop.js`: Extract the `draw()` loop and `drawQueue` processing.
    - Move visual-specific state updates (like `updateDrumVis` and `updateChordVis`) here.
- [x] **Phase 4: State & URL Hydration**
    - Create `public/state-hydration.js`: Extract the complex state recovery logic from `init()` and `loadFromUrl()`.
    - Ensure all initial UI synchronization is handled in this dedicated module.
