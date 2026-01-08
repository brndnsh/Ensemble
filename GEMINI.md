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

### Arranger (Song Structure)
*   **Modular Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`).
*   **Drag-and-Drop Reordering**: Native drag-and-drop support for intuitively rearranging song sections.
*   **Song Templates**: One-click scaffolding for common song structures (Pop, Jazz, Blues).
*   **Musical Mutation**: Algorithmic evolution of progressions via functional chord substitutions and extension injection.
*   **Relative Key Toggle**: Intelligent `maj/min` toggle that rewrites Roman/NNS notation while preserving pitches and informing generative modes.
*   **Symbol Palette**: Integrated kebab menu (`⋮`) for cursor-accurate insertion of musical symbols (`ø`, `maj7`, `|`).
*   **Section Management**: Named sections (Intro, Verse, Chorus) with duplication and deletion tools.
*   **Auto-Save**: Automatic persistence of the arrangement state to `localStorage`.
*   **Smart Layout**: Measure-based grid (4 per row) for structural clarity.

### Accompanist (Virtual Band)
*   **Tabbed Dashboard**: Unified control for Chords, Bass, Soloist, and Grooves.
*   **Integrated Power Buttons**: Mini-toggle indicators in the tab bar for quick mixing.
*   **Smart Voicing & Register**: Fine-grained interpretation settings (density, octaves).
*   **Hotkeys**: Rapid tab switching using keys `1`-`4` (Chords, Grooves, Bass, Soloist).

### Grooves
*   **Step Sequencer**: Focused 16-step horizontal grid for pattern programming.
*   **Velocity System**: Cycle through Off, Standard, and Accented states.
*   **Swing & Subdivision**: Advanced rhythmic feel control.

### Bassist & Soloist
*   **Algorithmic Performance**: Generative lines that react to Arranger data.
*   **Mode-Aware Logic**: Algorithms adapt scale selection and phrasing based on the `isMinor` state (e.g., using Aeolian vs Ionian).
*   **Soloist Styles**: Scalar, Shreddy, Blues, Minimal (Gilmour), Bird (Bebop), and Neo-Soul.
*   **Bassist Styles**: Whole, Half, Arp, Walking, Funk, Neo-Soul, and Bossa Nova.
*   **Slash Chord Support**: Bassist prioritizes specified bass notes (e.g., C/G).
*   **Intensity Mapping**: Energy builds dynamically toward the end of musical sections.
*   **Micro-Timing**: Authentic "behind the beat" feel for Neo-Soul and sophisticated bebop phrasing.

### Unified Visualizer
*   **Dedicated Live Monitor**: Full-width harmonic graph superimposing all tracks.
*   **Color-Coded Analysis**: Vivid interval mapping (Blue: Root, Green: 3rd, Orange: 5th, Purple: 7th+).
*   **Active Tracking**: Real-time position pulse on Arranger cards.

### General
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
*   **MIDI Export**: High-quality SMF export with GM program changes, chord markers, pitch bends, and mode-aware Key Signature metadata.
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

*   **State Separation**: State is divided into `arranger` (structural data) and performance contexts (`cb` for Chords, `gb` for Grooves, `bb` for Bassist, `sb` for Soloist).
*   **Audio Scheduling**: The `scheduler()` in `main.js` syncs performance engines with the flattened `arranger.progression`.
*   **Off-Main-Thread Logic**: Algorithmic generation for the Bassist and Soloist is handled in `logic-worker.js` via `worker-client.js`. This prevents UI or complex rendering tasks from causing audio stutters by moving heavy musical calculations to a background worker.
*   **Data-Driven UI**: `ui.js` programmatically builds the section list and sequencer grid from state.
*   **Auto-Persistence**: The `saveCurrentState()` function ensures every arrangement change is captured.

## Gemini Added Memories
- The user prioritizes performance on mobile devices over complex visual effects and prefers simplified visuals if it prevents glitches/lag.