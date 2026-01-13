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

- [ ] **Jazz "Walking" Logic**: Refine the `walking` style in `bass.js` to prioritize chromatic approach notes.

    - *Plan*: On beat 4, calculate the distance to the next chord's root. If it's a whole step or more, override the scale tone with a chromatic neighbor (half-step above or below) to "pull" the listener into the next bar.

- [ ] **Funk "Slap & Pop" Articulation**: Implement a toggle for high-velocity "pops" on syncopated octaves.

    - *Plan*: Update the bass synthesis in `engine.js` to detect velocities > 1.1. Apply a sharper ADSR envelope and a high-pass resonance boost to simulate a "pop." Use "slap" mutes (percussive thumps) for 16th-note ghosting.

- [ ] **Reggae "Riddim" Library**: Implement a collection of genre-standard patterns that adapt to song structure.

    - *Plan*: Create a `RIDDIMS` constant in `config.js`. Modify `bass.js` to select a pattern (e.g., "Stalag" or "54-46") based on `gb.genre` and `ctx.bandIntensity`. Ensure the melodic contour follows the `arranger` chord progression.

- [ ] **Neo-Soul "Behind the Beat"**: Introduce micro-timing offsets for a "human" feel.

    - *Plan*: Add a `pocketOffset` to the bass instrument state. In the scheduler, delay bass triggers by 15-30ms relative to the kick drum when in Neo-Soul mode to achieve the classic "Dilla" lag.



## Accompaniment Engine (Comping & Voicing)

- [ ] **Jazz "Rootless Voicings"**: Transition to pro-level jazz clusters.

    - *Plan*: In `chords.js`, implement a `getRootlessVoicing(chord, bassActive)` function. If the bass is playing, omit the root and 5th, focusing instead on 3, 7, and extensions (9, 13, #11).

- [ ] **Reggae "The Bubble & The Skank"**: Implement dual-keyboard rhythmic patterns.

    - *Plan*: Split the accompaniment logic into two "lanes." Lane A handles the "Skank" (staccato chords on 2 and 4). Lane B handles the "Bubble" (rhythmic 8th-note organ patterns with accents on the "and" of each beat).

- [ ] **Funk "Clav-Style" Rhythms**: Add high-syncopation percussive modes.

    - *Plan*: Implement a rhythmic generator that uses 16th-note "chucks" (percussive, non-pitched hits) interspersed with minimal 2-note voicings (tritones or 7ths) to maintain a lean, funky pocket.

- [ ] **Neo-Soul "Quartal Clusters"**: Implement modern, open harmonies.

    - *Plan*: Add support for quartal harmony (chords built in 4ths) in the voicing generator. Use "So What" style voicings for minor 7th chords to create a more atmospheric, non-functional sound.



## Verification & Research

- [ ] **Genre Stress Tests**: Expand the probabilistic test suite to verify rhythmic anchors.

    - *Plan*: Create `genre-integrity.test.js` to run 2000-measure simulations. Assert that the Reggae "One Drop" (kick on 3) is never violated and that Jazz walking bass never hits a root on beat 4 unless it's a pedal point.

- [ ] **Reference Comparison**: Fine-tune velocity and timing curves against classic records.

    - *Plan*: Document specific reference tracks (e.g., "Cantaloupe Island" for Jazz-Funk, "Redemption Song" for Reggae) and adjust the engine's default velocity maps to match their dynamic range.
