# Ensemble: Technical Context & Instructions

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `fills`).
*   **Core Logic**: Orchestrated by `main.js` (scheduling/timing) and `conductor.js` (global dynamics/intensity management). Includes the **Smart Grooves** system, a multi-module architecture where `gb.genreFeel` and `ctx.bandIntensity` drive procedural behaviors across drums (`main.js`, `fills.js`), piano (`accompaniment.js`), bass (`bass.js`), and soloist (`soloist.js`).
*   **Audio Engine**: Built on the **Web Audio API**. Synthesis logic is decentralized within individual engine files and orchestrated by `engine.js`.
*   **State Management**: Centralized reactive state defined in `state.js` with comprehensive JSDoc typing.
*   **Performance**: Off-main-thread musical calculations are handled by `logic-worker.js` via `worker-client.js` to ensure jitter-free audio and UI responsiveness.
*   **UI/UX**: Vanilla CSS using Solarized color variables. Responsive design focused on mobile practice sessions.

## Key Files & Responsibilities

*   `main.js`: Main entry point, high-precision scheduler, and visual animation loop.
*   `state.js`: Single source of truth for global, arranger, and instrument states.
*   `conductor.js`: The "brain" that adjusts band intensity, complexity, and mixing parameters based on song form.
*   `engine.js`: Low-level Web Audio operations and sound synthesis.
*   `soloist.js` / `bass.js`: Algorithmic engines for lead and bass lines with "Expressive Musicality" logic.
*   `arranger-controller.js`: Manages song structure, transpositions, and chord progression logic.
*   `ui-controller.js` / `ui.js`: Bridges DOM events with back-end logic and handles complex rendering (e.g., chord visualizer).

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
*   **State Access**: Always prefer accessing state through the `ctx`, `arranger`, and instrument-specific objects (`gb`, `cb`, `bb`, `sb`) imported from `state.js`.
*   **Precision Timing**: Use `ctx.audio.currentTime` for all audio scheduling. Visual events should be pushed to `ctx.drawQueue` for synchronization in the `requestAnimationFrame` loop.
*   **Mobile First**: Prioritize performance and touch-target sizes for mobile devices. Prefer simplified visuals over complex effects if they cause lag on low-end hardware.

## Gemini Specific Instructions

*   When modifying musical logic, refer to `config.js` for constants regarding scales, intervals, and drum presets.
*   Ensure all new features respect the `bandIntensity` and `complexity` signals from the conductor.
*   Always maintain JSDoc comments in `state.js` when updating the state schema.
