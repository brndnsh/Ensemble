# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Project Structure

This project uses vanilla JavaScript with ES Modules and requires no build step.

### Key Files

*   **`index.html`**: The main entry point defining the application structure and loading the module graph.
*   **`manual.html`**: Comprehensive user documentation and interactive examples.
*   **`main.js`**: Orchestrates the application initialization, event listeners, connects the UI with the audio engine, and registers the Service Worker.
*   **`engine.js`**: Handles all Web Audio API operations, including the scheduler loop, sound synthesis (oscillators for chords), and drum sample playback.
*   **`state.js`**: Manages the global application state (playback status, BPM, active instruments, user presets).
*   **`chords.js`**: Contains logic for parsing chord progressions. Modularized into `resolveChordRoot`, `getIntervals`, and `getFormattedChordNames` returning structured data.
*   **`accompaniment.js`**: Defines the rhythmic playback patterns for all chord styles (e.g., Funk, Reggae, Bossa Nova).
*   **`bass.js`**: Generates walking bass lines and patterns based on chord progressions and desired register.
*   **`soloist.js`**: Implements advanced algorithmic soloing logic, including phrasing, rhythmic cells, and harmonic targeting.
*   **`visualizer.js`**: Implements the `UnifiedVisualizer` class for multi-track, time-based harmonic and melodic visualization.
*   **`midi-export.js`**: Handles offline generation of Standard MIDI Files (SMF) including track assembly and timing calculations.
*   **`ui.js`**: Centralizes DOM element creation and UI manipulation. Contains helpers like `createPresetChip`, `createTrackRow`, and `createChordLabel`.
*   **`config.js`**: Stores static configuration, such as default drum presets, chord styles, and musical constants.
*   **`utils.js`**: Contains common utility functions for frequency calculation and formatting.
*   **`sw.js`**: A Service Worker that caches key assets to enable offline functionality.

## Features

### Chords
*   **Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`). Use the pipe symbol (`|`) to explicitly delimit measures.
*   **Extended Form Support**: Resizable multi-line input supports long progressions (32+ bars).
*   **Playback Styles**: Choose from various accompaniment styles like Pad, Pulse, Strum, Funk, Reggae, Double Skank, Jazz Comp, Freddie Green, Bossa Nova, and more.
*   **Smart Voicing**: Automatically calculates smooth voice leading for chords.
*   **Transposition**: Instantly transpose the entire progression to any key.

### Grooves
*   **Step Sequencer**: A multi-measure grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Multi-level Velocity**: Supports Off, Normal, and Accented states per step for realistic dynamics.
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **Presets**: Authentic genre-specific drum patterns utilizing the accent system.
*   **Duplicate Measure**: One-click tool to copy the first measure's pattern across the entire loop.

### Bassist
*   **Walking Bass Generator**: Automatically generates melodic walking bass lines using chord tones, approach notes, and chromatic enclosures. Features adaptive strategies (Scalar, Arp, Chromatic) and ensures Root landing on measure downbeats.
*   **Rhythmic Styles**: Supports Whole Note, Half Note, Arpeggio, Walking (Quarter Note), and Bossa Nova (syncopated) patterns.
*   **Register Control**: Adjustable bass register to fit different musical contexts.
*   **Advanced Articulation**: Employs velocity-sensitive accents on backbeats and percussive "Dead Notes" for realistic performance.

### Soloist
*   **Algorithmic Soloing**: Generates melodic lines over progressions using rhythmic cells and harmonic targeting.
*   **Styles**: Supports various soloing styles including Scalar, Shreddy, Bebop, Blues, and Minimal.
*   **Dual-Clock Scheduling**: Employs an unswung clock for a more laid-back, human-like melodic feel relative to the rhythm section.

### Unified Visualizer
*   **Harmonic Superimposition**: Centralized graph that overlays Bass, Soloist, and Chords in a single visual timeline.
*   **Color-Coded Intervals**: Uses a vivid harmonic color scheme (Blue: Root, Green: 3rd, Orange: 5th, Purple: 7th+) to show the function of every note in real-time.
*   **Auto-Scroll**: Automatically scrolls to keep the active chord in view during playback of long forms.
*   **Smart Octave Wrapping**: Automatically ensures notes stay within the visual range while preserving their harmonic context.

### General
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
*   **MIDI Export**: High-quality SMF export with GM program changes, chord markers, and pitch bends.
*   **PWA**: Fully installable and works offline.
*   **Sharing**: Share progressions via URL.

## Development

### Running the Project

Since there is no build step, you can run the project by serving the root directory with a local static file server.

```bash
# Example using python
python3 -m http.server 8000

# Example using npx/serve
npx serve .
```

Navigate to `http://localhost:8000` (or the port shown by your server) to view the app.

### Code Style
*   **Modules**: Uses native ES Modules (`import`/`export`).
*   **Audio**: Uses the Web Audio API directly (no external audio libraries).
*   **Styling**: Pure CSS with CSS Variables for theming.
*   **Formatting**: Standard JS formatting, typically 4 spaces indentation.

## Architecture Notes

*   **Audio Scheduling**: The `scheduler()` function in `main.js` looks ahead to schedule audio events precisely. It employs a dual-clock system: a "swung" clock for the rhythm section and an "unswung" clock for the soloist.
*   **Data-Driven Rendering**: `chords.js` parses strings into structured data objects (containing root, suffix, bass info). `ui.js` consumes this data to build DOM elements programmatically, avoiding `innerHTML` and enabling clean export logic.
*   **Centralized Mixing**: Instrumental gain balance is managed via `MIXER_GAIN_MULTIPLIERS` in `config.js`.
*   **Performance Optimization**: DOM elements for the sequencer grid and chord progression cards are cached in the global state.
*   **State Management**: State is divided into contexts (`ctx` for audio/runtime, `cb` for Chords, `gb` for Grooves, `bb` for Bassist, `sb` for Soloist) in `state.js`.
*   **Persistence**: User presets and preferences are saved to `localStorage`.

## Gemini Added Memories
- The user prioritizes performance on mobile devices over complex visual effects and prefers simplified visuals if it prevents glitches/lag.