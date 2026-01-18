# Ensemble: Technical Context & Instructions

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`, `midi`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `fills`). Core logic is modularized into high-precision scheduling (`scheduler-core.js`), visual rendering (`visualizer.js`), and decentralized synthesis (`synth-*.js`). UI logic is componentized into specialized renderers (`ui-chord-visualizer.js`, `ui-sequencer-grid.js`). UI-specific transient state and DOM caches are decoupled from the reactive state and stored in `ui-store.js`. Section-level error catching in `chords.js` ensures robust arrangement parsing.
...
*   `ui-controller.js` / `ui.js`: Bridges DOM events with back-end logic and handles complex rendering.
*   `ui-chord-visualizer.js`: Dedicated renderer for the dynamic chord chart and section blocks.
*   `ui-sequencer-grid.js`: Specialized logic for the drum sequencer interface and step recycling.
*   `types.js`: Centralized `ACTIONS` constants for the state dispatch system.
...
*   **State Access**: Read state through the exported objects (`ctx`, `arranger`, `gb`, etc.). **NEVER** modify these objects directly. Use `dispatch(ACTIONS.ACTION_TYPE, payload)` from `state.js` using constants from `types.js` to trigger updates.
*   **Precision Timing**: Use `ctx.audio.currentTime` for all audio scheduling. Visual events should be pushed to `ctx.drawQueue` for synchronization in the `requestAnimationFrame` loop. Always snap `ctx.nextNoteTime` to `ctx.unswungNextNoteTime` at measure boundaries to prevent drift accumulation.
*   **Worker Sync**: When refreshing the engine state, use `syncWorker(action, payload)` for delta-based updates or a full sync before `flushBuffers()`. Monitor **Logic Latency** via `performance.now()` in worker messages. See `WORKER_CONTRACT.md` for the message schema.
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
