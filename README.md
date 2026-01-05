# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Features

### 🎹 Chords
*   **Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`). Use the pipe symbol (`|`) to explicitly delimit measures (e.g., `I | IV | V | I`).
*   **Extended Form Support**: A resizable multi-line input and scrolling visualizer support long progressions (up to 32+ bars), perfect for practicing full jazz standards.
*   **Playback Styles**: Choose from various accompaniment styles like Pad, Pulse, Strum, Funk, Reggae, Double Skank, Jazz Comp, Freddie Green, Bossa Nova, and more.
*   **Smart Voicing**: Automatically calculates smooth voice leading for chords.
*   **Transposition**: Instantly transpose the entire progression to any key.

### 🥁 Grooves
*   **Step Sequencer**: A multi-measure grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Multi-level Velocity**: Steps cycle through Off, Normal, and Accented states for more dynamic and musical grooves.
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **Presets**: Includes authentic, genre-specific patterns for Rock, Funk, Jazz, Reggae, Bossa Nova, and more.
*   **Pattern Tools**: Quickly expand your loop with the "Duplicate Measure 1" feature.

### 🎸 Bassist
*   **Walking Bass Generator**: Automatically generates melodic walking bass lines that follow your chord progression.
*   **Rhythmic Styles**: Choose between Whole Note, Half Note, Arpeggio, and Walking (Quarter Note) patterns.
*   **Register Control**: Adjustable bass register (center octave) to fit different musical contexts.

### 🎷 Soloist
*   **Algorithmic Soloing**: Generates melodic lines over your progression using rhythmic cells and harmonic targeting.
*   **Diverse Styles**: Choose from Scalar, Shreddy (arpeggio sweeps), Bebop (enclosures), Blues, and Minimalist approaches.
*   **Key-Aware & Blues Logic**: Melodies strictly adhere to the parent key signature for diatonic chords and employ Major/Minor blues scales with chromatic grace note slips for authentic phrasing.

### 📊 Unified Visualizer
*   **Harmonic Context**: A centralized, high-fidelity graph that superimposes Bass and Soloist tracks on top of your chord progression.
*   **Color-Coded Analysis**: Real-time interval mapping using a vivid color scheme (Blue: Root, Green: 3rd, Orange: 5th, Purple: 7th+) helps you visualize melodic choices relative to the harmonic foundation.
*   **Piano Roll Background**: Displays the full harmonic structure across all octaves, making it easy to see targeting and tension.
*   **Rhythmic Grid**: Vertical lines for beats and measures provide a clear reference for timing and phrasing.
*   **Smart Wrapping**: Automatically shifts notes by an octave to ensure they stay visible while maintaining their functional harmonic position.
*   **Polished Interface**: Features neon glow effects, smooth legato curves, and a trailing opacity fade for a professional look.

### General
*   **MIDI Export**: Export your progression, bass line, and drum groove as a multi-track MIDI file (Format 1) with appropriate instrument assignments, chord name markers, and soloist pitch bends.
*   **Color-Coded Library**: Presets and styles are organized by genre using a compact, color-coded chip system (e.g., Purple for Jazz, Blue for Pop/Rock).
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
*   **Maximized View**: Enter a focused mode that expands the chord visualizer to fill the screen for easier reading.
*   **Count-in**: Enable a metronome count-in to help you prepare before the rhythm section kicks in.
*   **Reset to Defaults**: Quickly restore original settings, volumes, and registers from the Settings menu.
*   **PWA**: Fully installable and works offline.
*   **Documentation**: Includes a comprehensive in-app User Manual for deep dives into music theory and app features.
*   **Sharing**: Share progressions via URL.

## Usage

Since this project uses vanilla JavaScript with ES Modules, it requires no build step. You can run the project by serving the root directory with any local static file server.

### Using Python
```bash
python3 -m http.server 8000
```

### Using npx (Node.js)
```bash
npx serve .
```

Once the server is running, navigate to `http://localhost:8000` (or the port shown by your console) to view the app.

## Tech Stack

*   **JavaScript**: Vanilla ES Modules (no bundlers required).
*   **Audio**: Web Audio API (native, no external libraries).
*   **Styling**: Pure CSS with Variables.
*   **State Management**: Custom centralized state management.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
