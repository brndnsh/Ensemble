# Ensemble: Technical Context & Instructions

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `fills`). Core logic is modularized into high-precision scheduling (`scheduler-core.js`), visual rendering (`visualizer.js`), and decentralized synthesis (`synth-*.js`).
*   **Core Logic**: Orchestrated by `main.js` (entry/init), `scheduler-core.js` (timing/scheduling), and `conductor.js` (global dynamics/intensity management). Includes the **Smart Grooves** system, a multi-module architecture where `gb.genreFeel` and `ctx.bandIntensity` drive procedural behaviors across drums (`scheduler-core.js`, `fills.js`), piano (`accompaniment.js`), bass (`bass.js`), and soloist (`soloist.js`).
*   **Audio Engine**: Built on the **Web Audio API**. Synthesis logic is decentralized into instrument-specific synthesis modules (`synth-bass.js`, `synth-soloist.js`, etc.) and orchestrated by `engine.js`.

## Key Files & Responsibilities

*   `main.js`: Main entry point and application initialization.
*   `scheduler-core.js`: High-precision lookahead scheduler for all audio events.
*   `state.js`: Single source of truth for global, arranger, and instrument states.
*   `conductor.js`: The "brain" that adjusts band intensity, complexity, and mixing parameters based on song form.
*   `engine.js`: Low-level Web Audio operations and synthesis orchestration.
*   `soloist.js` / `bass.js`: Algorithmic engines for lead and bass lines with "Expressive Musicality" logic. Includes advanced **Melodic Devices** (Enclosures, Quartal Harmony, Call and Response).
*   `visualizer.js`: Unified class-based harmonic monitor and track renderer.
*   `arranger-controller.js`: Manages song structure, transpositions, and chord progression logic.
*   `ui-controller.js` / `ui.js`: Bridges DOM events with back-end logic and handles complex rendering.

## Building and Running

Ensemble is a zero-dependency project and requires no build step.

*   **Development Server**: Serve the root directory using any static file server.
    ```bash
    # Python
    python3 -m http.server 8000
    # Node.js
    npx serve .
    ```
*   **Testing**: Automated unit tests are available using Vitest. Run `npm test` to execute them. Covers `chords.js`, `utils.js`, `arranger-controller.js`, `soloist.js`, etc.
*   **PWA**: Service worker (`sw.js`) and manifest (`manifest.json`) are configured for offline use and installation.

## Development Conventions

*   **Vanilla JS**: No external frameworks or libraries (except for PWA polyfills if needed).
*   **ES Modules**: Use `import`/`export` for all logic. Maintain a flat or shallow directory structure.
*   **Styling**: Use CSS variables defined in `:root` (Solarized theme). Avoid hardcoded hex values in component styles.
*   **State Access**: Read state through the exported objects (`ctx`, `arranger`, `gb`, etc.). **NEVER** modify these objects directly. Use `dispatch(action, payload)` from `state.js` to trigger updates.
*   **Precision Timing**: Use `ctx.audio.currentTime` for all audio scheduling. Visual events should be pushed to `ctx.drawQueue` for synchronization in the `requestAnimationFrame` loop. Always snap `ctx.nextNoteTime` to `ctx.unswungNextNoteTime` at measure boundaries to prevent drift accumulation.
*   **Atomic Transitions**: When implementing state changes that affect rhythmic feel (swing, subdivisions), perform the update at the *start* of the scheduling loop for Step 0. This prevents lookahead logic from queuing notes using stale state.
*   **Mobile First**: Prioritize performance and touch-target sizes for mobile devices. Prefer simplified visuals over complex effects if they cause lag on low-end hardware.

## Gemini Specific Instructions

*   When modifying musical logic, refer to `config.js` for constants regarding scales, intervals, and drum presets.
*   Ensure all new features respect the `bandIntensity` and `complexity` signals from the conductor.
*   Always maintain JSDoc comments in `state.js` when updating the state schema.
*   **Worker Sync**: When refreshing the engine state, ensure `syncWorker()` (or `dispatch`) is called **before** `flushBuffers()` so the worker uses the latest state. Call `restoreGains()` **after** `flushBuffers()` to prevent audio bus silence.
*   **Buffer Integrity**: During a `flush` operation (e.g., genre switch), explicitly clear the client-side instrument buffers (`cb.buffer`, `bb.buffer`, `sb.buffer`) to prevent stale patterns from playing.

## Roadmap & Future Goals

The project is currently transitioning from static loop-based accompaniment to "Smart Grooves"—generative, intensity-aware engines. **Rock (Stadium), Disco (Four-on-the-Floor), and Hip Hop (Boom Bap)** are now implemented. Future work focuses on:

1.  **Soloist Engine (v1.99)**: COMPLETED implementation of advanced melodic devices including Bebop enclosures, quartal harmony (Neo-Soul), and rhythmic call-and-response logic.
2.  **Bass Engine**: Implementing chromatic walking logic for Jazz, "Slap & Pop" synthesis for Funk, and micro-timing (Dilla feel) for Neo-Soul.
3.  **Accompaniment Engine**: Transitioning to rootless jazz voicings, implementing Reggae "Bubble/Skank" dual-lane logic.
4.  **Authenticity Verification**: Expanding the probabilistic testing suite (`*.test.js`) to ensure genre-specific rhythmic and harmonic anchors are maintained over long durations.
5.  **Latin/Bossa Percussion**: Expand procedural percussion (shakers/agogo) for Latin styles.
6.  **Reference-Driven Tuning**: Calibrating velocity maps and timing offsets against classic genre recordings to achieve a "pro-level" musical feel.
