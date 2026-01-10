# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Project Structure

This project uses vanilla JavaScript with ES Modules and requires no build step.

### Key Files

*   **`index.html`**: The main entry point defining the application structure and loading the module graph.
*   **`manual.html`**: Comprehensive user documentation and interactive examples.
*   **`main.js`**: Orchestrates the application initialization, event listeners, connects the UI with the audio engine, and registers the Service Worker.
*   **`engine.js`**: Handles all Web Audio API operations, including the scheduler loop, sound synthesis (oscillators for chords), and drum sample playback. Now includes `getVisualTime()` for synchronized visuals.
*   **`state.js`**: Manages the global application state (playback status, BPM, active instruments, user presets). **Contains JSDoc type definitions for the entire state schema.**
*   **`chords.js`**: Core logic for parsing chord symbols, optimizing voicings (`getBestInversion`), generating random progressions, and handling intelligent relative key transformations.
*   **`accompaniment.js`**: Defines the rhythmic playback patterns for all chord styles (e.g., Funk, Reggae, Bossa Nova).
*   **`bass.js`**: Generates walking bass lines and patterns based on chord progressions and desired register.
*   **`soloist.js`**: Implements "Expressive Musicality" logic for the algorithmic soloist, featuring phrasing ("breath"), motif retention, dynamic velocity arcs, and micro-timing.
*   **`visualizer.js`**: Implements the `UnifiedVisualizer` class for multi-track, time-based harmonic and melodic visualization.
*   **`midi-export.js`**: Handles offline generation of Standard MIDI Files (SMF) including track assembly and timing calculations.
*   **`ui.js`**: Centralizes DOM element creation and UI manipulation. Implements singleton patterns for reusable UI components like the symbol menu.
*   **`config.js`**: Stores static configuration, such as default drum presets, chord styles, and musical constants.
*   **`utils.js`**: Contains common utility functions for frequency calculation and formatting.
*   **`sw.js`**: A Service Worker that caches key assets to enable offline functionality.

## Architecture Notes

*   **State Separation**: State is divided into `arranger` (structural data) and performance contexts (`cb` for Chords, `gb` for Grooves, `bb` for Bassist, `sb` for Soloist).
*   **State Schema**: `state.js` is the single source of truth for the application state structure. It includes comprehensive JSDoc typedefs (`GlobalContext`, `ArrangerState`, `ChordState`, etc.) which should be consulted when modifying state properties.
*   **Audio Scheduling**: The `scheduler()` in `main.js` syncs performance engines with the flattened `arranger.progression`.
*   **Off-Main-Thread Logic**: Algorithmic generation for the Bassist and Soloist is handled in `logic-worker.js` via `worker-client.js`. This prevents UI or complex rendering tasks from causing audio stutters by moving heavy musical calculations to a background worker.
*   **Data-Driven UI**: `ui.js` programmatically builds the section list and sequencer grid from state.
*   **Visual Synchronization**: Visual events are synchronized using `getVisualTime()` in `engine.js`, which interpolates between the AudioContext time and `performance.now()` while compensating for output latency to ensuring smooth, jitter-free animations.
*   **Singleton UI Patterns**: Heavy UI components like the symbol insertion menu are implemented as singletons in `ui.js` (`getSymbolMenu`) to minimize DOM node creation and event listener overhead.
*   **Auto-Persistence**: The `saveCurrentState()` function ensures every arrangement change is captured.
*   **Update Mechanism**: Service Worker updates are handled via a manual 'SKIP_WAITING' message triggered by the user from a banner.

## Gemini Added Memories
- The user prioritizes performance on mobile devices over complex visual effects and prefers simplified visuals if it prevents glitches/lag.