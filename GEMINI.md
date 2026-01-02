# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Project Structure

This project uses vanilla JavaScript with ES Modules and requires no build step.

### Key Files

*   **`index.html`**: The main entry point defining the application structure and loading the module graph.
*   **`main.js`**: Orchestrates the application initialization, event listeners, and connects the UI with the audio engine.
*   **`engine.js`**: Handles all Web Audio API operations, including the scheduler loop, sound synthesis (oscillators for chords), and drum sample playback.
*   **`state.js`**: Manages the global application state (playback status, BPM, active instruments, user presets).
*   **`chords.js`**: Contains logic for parsing chord progressions (Roman Numerals, Nashville Numbers, Chord Names) and calculating voicings.
*   **`bass.js`**: Generates walking bass lines and patterns based on chord progressions and desired register.
*   **`soloist.js`**: Implements advanced algorithmic soloing logic, including phrasing, rhythmic cells, and harmonic targeting.
*   **`ui.js`**: Centralizes DOM element references and UI manipulation functions (toasts, visual updates).
*   **`config.js`**: Stores static configuration, such as default drum presets, chord styles, and musical constants.
*   **`utils.js`**: Contains common utility functions for frequency calculation and formatting.
*   **`sw.js`**: A Service Worker that caches key assets to enable offline functionality.

## Features

### Chords
*   **Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`). Use the pipe symbol (`|`) to explicitly delimit measures (e.g., `I | IV | V | I`).
*   **Playback Styles**: Choose from various accompaniment styles like Pad, Pulse, Strum, Funk, Reggae, and Jazz.
*   **Smart Voicing**: Automatically calculates smooth voice leading for chords.
*   **Transposition**: Instantly transpose the entire progression to any key.

### Grooves
*   **Step Sequencer**: A 16-step grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **Presets**: Includes standard drum patterns for various genres (Rock, Hip Hop, Jazz, Latin).

### Bassist
*   **Walking Bass Generator**: Automatically generates melodic walking bass lines using chord tones and approach notes.
*   **Rhythmic Styles**: Supports Whole Note, Half Note, Arpeggio, and Walking (Quarter Note) patterns.
*   **Register Control**: Adjustable bass register to fit different musical contexts.
*   **Visualizer**: A real-time sparkline graph showing melodic contour alongside chord tone "lanes".

### Soloist
*   **Algorithmic Soloing**: Generates melodic lines over progressions using rhythmic cells and harmonic targeting.
*   **Styles**: Supports various soloing styles including Scalar, Shreddy, Bebop, Blues, and Minimal.
*   **Dual-Clock Scheduling**: Employs an unswung clock for a more laid-back, human-like melodic feel relative to the rhythm section.
*   **Visualizer**: Real-time path visualization of the generated melody.

### General
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
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

*   **Audio Scheduling**: The `scheduler()` function in `main.js` looks ahead to schedule audio events precisely. It employs a dual-clock system: a "swung" clock for the rhythm section and an "unswung" clock for the soloist, allowing for a more laid-back melodic feel. `requestAnimationFrame` handles visual synchronization.
*   **Performance Optimization**: DOM elements for the sequencer grid and chord progression cards are cached in the global state during rendering to minimize query overhead in the high-frequency animation and state-update loops.
*   **State Management**: State is divided into contexts (`ctx` for audio/runtime, `cb` for Chords, `gb` for Grooves, `bb` for Bassist, `sb` for Soloist) in `state.js`.
*   **Persistence**: User presets and preferences are saved to `localStorage`.
