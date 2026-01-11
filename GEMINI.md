# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Project Structure

This project uses a modular ES architecture with domain-specific controllers.

### Core Controllers

*   **`app-controller.js`**: Orchestrates global application state transitions (Play/Stop, BPM changes).
*   **`arranger-controller.js`**: Manages song structure, transposition, and section editing.
*   **`instrument-controller.js`**: Handles instrument-specific state (Volume, Power, Presets, Measures).
*   **`ui-controller.js`**: Centralizes DOM event listeners and bridges the UI with backend controllers.

### Musical Engines & Logic

*   **`main.js`**: The orchestrator. Manages the high-precision audio scheduler and the visual animation loop.
*   **`engine.js`**: Low-level Web Audio API operations, sound synthesis, and `getVisualTime()` synchronization.
*   **`chords.js`**: Chord parsing, voicing optimization (`getBestInversion`), and notation formatting.
*   **`accompaniment.js`**: Rhythmic patterns for chord styles.
*   **`bass.js`**: Algorithmic walking bass and pattern generation.
*   **`soloist.js`**: "Expressive Musicality" logic for the algorithmic soloist (phrasing, motifs, micro-timing).
*   **`logic-worker.js`**: Background worker for off-main-thread musical calculations.

### Data & UI Support

*   **`state.js`**: The single source of truth for the application state schema (with comprehensive JSDoc).
*   **`ui.js`**: Centralized DOM rendering logic and hierarchical layout management.
*   **`config.js`**: Static musical constants, drum presets, and versioning.
*   **`persistence.js`**: Handles `localStorage` synchronization.
*   **`history.js`**: Implements Undo/Redo functionality for arranger changes.
*   **`utils.js`**: Shared math and formatting utilities.
*   **`sw.js`**: Service Worker for offline PWA functionality.

## Architecture Notes

*   **Modular Decoupling**: Logic is separated into controllers to prevent monolithic file growth and improve maintainability.
*   **Firefox Stability**: Audio synthesis utilizes explicit `BiquadFilterNode` value initialization and a 2ms scheduling buffer to ensure pop-free performance in Firefox.
*   **Visual Synchronization**: Visual events are interpolated using `getVisualTime()` to ensure jitter-free animations that stay in sync with the Web Audio clock.
*   **Worker Dispatch**: Algorithmic notes are calculated in a background worker to prevent UI lag from causing audio dropouts.
*   **Mastering Chain**: A dedicated mastering chain with saturation and limiting provides analog-style warmth and peak protection.

## Gemini Added Memories
- The user prioritizes performance on mobile devices over complex visual effects and prefers simplified visuals if it prevents glitches/lag.
