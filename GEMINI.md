# Ensemble: Technical Context & Instructions

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`, `midi`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `fills`). Core logic is modularized into high-precision scheduling (`scheduler-core.js`), visual rendering (`visualizer.js`), and decentralized synthesis (`synth-*.js`). UI-specific transient state and DOM caches are decoupled from the reactive state and stored in `ui-store.js`.
*   **Core Logic**: Orchestrated by `main.js` (entry/init), `scheduler-core.js` (timing/scheduling), and `conductor.js` (global dynamics/intensity management). Includes the **Smart Grooves** system, a multi-module architecture where `gb.genreFeel` and `ctx.bandIntensity` drive procedural behaviors across drums (`scheduler-core.js`, `fills.js`), piano (`accompaniment.js`), bass (`bass.js`), and soloist (`soloist.js`), coordinated by `conductor.js`.
*   **MIDI Bridge**: Real-time Web MIDI connectivity managed by `midi-controller.js`. Synchronizes Web Audio's `currentTime` with MIDI's `performance.now()` timeline. Includes velocity normalization (compression curve) to map Ensemble's expressive 0.0–1.5 internal range to MIDI's 0–127 standard. Supports per-track channel mapping, octave offsets, and automatic browser audio muting.
*   **Audio Engine**: Built on the **Web Audio API**. Synthesis logic is decentralized into instrument-specific synthesis modules (`synth-bass.js`, `synth-soloist.js`, etc.) and orchestrated by `engine.js`. Includes performance resilience features like **Emergency Lookahead** for high-load scenarios.

## Key Files & Responsibilities

*   `main.js`: Main entry point and application initialization.
*   `scheduler-core.js`: High-precision lookahead scheduler for all audio events and MIDI messages.
*   `state.js`: Single source of truth for global, arranger, instrument, and MIDI states.
*   `midi-controller.js`: Manages MIDI port access, message transmission, and velocity normalization.
*   `ui-store.js`: Non-reactive storage for transient UI state (DOM caches, card offsets).
*   `conductor.js`: The "brain" that adjusts band intensity, complexity, and mixing parameters based on song form.
*   `engine.js`: Low-level Web Audio operations and synthesis orchestration.
*   `soloist.js` / `bass.js`: Algorithmic engines for lead and bass lines with "Expressive Musicality" logic. Includes advanced **Melodic Devices** (Enclosures, Quartal Harmony, Call and Response).
*   `visualizer.js`: Unified class-based harmonic monitor and track renderer.
*   `arranger-controller.js`: Manages song structure, transpositions, and chord progression logic.
*   `ui-controller.js` / `ui.js`: Bridges DOM events with back-end logic and handles complex rendering.

## Building and Running

Ensemble is designed for a zero-dependency development workflow, but uses a bundled build process for production performance.

*   **Development Server**: Serve the root directory using any static file server. No build step required; uses native ES Modules.
    ```bash
    # Python
    python3 -m http.server 8000
    # Node.js
    npx serve .
    ```
*   **Production Build**: The deployment scripts (`deploy-prod.sh`, `deploy-test.sh`) handle bundling, minification, and cache-busting using `esbuild`.
    *   **Bundle**: `main.js`, `logic-worker.js`, and `styles.css` are bundled to reduce network requests.
    *   **Cache Busting**: Filenames are hashed (e.g., `main.a1b2c.js`) based on the git commit.
    *   **Dry Run**: Use `-whatif` to test the build without deploying: `./scripts/deploy-prod.sh -whatif`
*   **Testing**: Automated unit tests are located in the `tests/` directory and use Vitest. Run `npm test` to execute them. Covers `chords.js`, `utils.js`, `arranger-controller.js`, `soloist.js`, etc. Includes integration tests for **performance resilience (congestion)** and **harmonic continuity**.
*   **PWA**: Service worker (`sw.js`) and manifest (`manifest.json`) are configured for offline use. The asset list in `sw.js` is dynamically generated during the production build.

## Development Conventions

*   **Vanilla JS**: No external frameworks or libraries (except for PWA polyfills if needed).
*   **ES Modules**: Use `import`/`export` for all logic. Maintain a flat or shallow directory structure.
*   **Styling**: Use CSS variables defined in `:root` (Solarized theme). Avoid hardcoded hex values in component styles.
*   **Modular CSS**: Styles are split into domain-specific files in `public/css/` (e.g., `layout.css`, `controls.css`) and aggregated in `styles.css`. Add new styles to the appropriate module.
*   **State Access**: Read state through the exported objects (`ctx`, `arranger`, `gb`, etc.). **NEVER** modify these objects directly. Use `dispatch(action, payload)` from `state.js` to trigger updates.
*   **Precision Timing**: Use `ctx.audio.currentTime` for all audio scheduling. Visual events should be pushed to `ctx.drawQueue` for synchronization in the `requestAnimationFrame` loop. Always snap `ctx.nextNoteTime` to `ctx.unswungNextNoteTime` at measure boundaries to prevent drift accumulation.
*   **Worker Sync**: When refreshing the engine state, use `syncWorker(action, payload)` for delta-based updates or a full sync before `flushBuffers()`. Monitor **Logic Latency** via `performance.now()` in worker messages.
*   **Atomic Transitions**: When implementing state changes that affect rhythmic feel (swing, subdivisions), perform the update at the *start* of the scheduling loop for Step 0. This prevents lookahead logic from queuing notes using stale state.
*   **Mobile First**: Prioritize performance and touch-target sizes for mobile devices. Prefer simplified visuals over complex effects if they cause lag on low-end hardware.

## Gemini Specific Instructions

*   When modifying musical logic, refer to `config.js` for constants regarding scales, intervals, and drum presets.
*   Ensure all new features respect the `bandIntensity` and `complexity` signals from the conductor.
*   Always maintain JSDoc comments in `state.js` when updating the state schema.
*   **Intensity Mapping**: Link features to `ctx.bandIntensity` for dynamic response (e.g., filter cutoffs, pattern density).
*   **Buffer Integrity**: During a `flush` operation (e.g., genre switch), explicitly clear the client-side instrument buffers (`cb.buffer`, `bb.buffer`, `sb.buffer`) to prevent stale patterns from playing.
*   **Atomic Commits**: STRICTLY avoid "kitchen sink" commits. Break tasks into granular steps:
    1.  **Refactor**: Clean up or restructure code *without* changing behavior. Commit.
    2.  **Implementation**: Add the new feature or fix the bug. Commit.
    3.  **Verification**: Add tests or update documentation. Commit.
    *   *Example*: Do not combine "Setup ESLint" (tooling) with "Fix Bass Logic" (bugfix). These must be separate commits.
*   **Branch Management**: Do NOT delete feature branches until the user has confirmed the implementation works as expected in the UI or through integration tests. Always verify behavior before merging and deleting.

## Roadmap & Future Goals

The project has completed the **v2.29 Codebase Health & Standards Audit**, achieving high architectural modularity, performance resilience, and production-grade linting.

1.  **Soloist Engine (v2.0)**: COMPLETED implementation of advanced melodic devices (Enclosures, Quartal Harmony) and tension-building logic.
2.  **Bass Engine (v2.1)**: COMPLETED chromatic walking logic, "Slap & Pop" synthesis for Funk, and micro-timing (Dilla feel) for Neo-Soul.
3.  **Accompaniment Engine**: COMPLETED "Expressive Phrasing" for Rock/Pop/Acoustic and conversational "Call & Response" logic.
4.  **Authenticity Verification**: COMPLETED expansion of the probabilistic testing suite with integration tests for congestion, continuity, and velocity normalization.
5.  **Standards & Linting (v2.29)**: COMPLETED project-wide ESLint configuration and resolved all engine regressions. Verified 374 tests passing.
6.  **Latin/Bossa Percussion**: Expand procedural percussion synthesis (Shakers/Agogo/Guiro) for Latin styles to complement the existing Bossa kit.
7.  **Reference-Driven Tuning**: Calibrating velocity maps and timing offsets against classic genre recordings to achieve a "pro-level" musical feel.
