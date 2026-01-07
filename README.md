# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Features

### 🖋️ Arranger (Song Structure)
*   **Modular Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`).
*   **Section Management**: Organize your song into named sections (Intro, Verse, Chorus). Reorder, duplicate, or delete sections to build complex forms.
*   **Auto-Save**: Your arrangement is automatically persisted to local storage. Refreshing the page won't lose your work.
*   **User Library**: Save your custom progressions as named presets for quick access.
*   **Smart Layout**: Chords are displayed in measures (4 per row on desktop) for clear structural visualization.
*   **Transposition**: Instantly transpose the entire progression to any key while preserving your custom chord voicings.

### 🎸 Accompanist (Performance)
*   **Virtual Band**: Manage your ensemble through a tabbed interface for **Chords**, **Bass**, **Soloist**, and **Grooves**.
*   **Mini-Mixer**: Toggle individual band members directly from the tab bar using mini-power buttons.
*   **Performance Styles**: Choose from various accompaniment styles like Pad, Funk, Reggae, Jazz Comp, and more.
*   **Voicing Control**: Fine-tune chord density (Thin to Rich) and register (octave) directly within the Accompanist settings.
*   **Navigation Hotkeys**: Use keys `1`-`4` to quickly switch between instrument settings.

### 🥁 Grooves (Drum Machine)
*   **Step Sequencer**: A focused 16-step horizontal grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Multi-level Velocity**: Steps cycle through Off, Normal, and Accented states for more dynamic and musical grooves.
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **User Patterns**: Save your custom drum patterns to your local library.
*   **Genre Presets**: Includes authentic patterns for Rock, Funk, Jazz, Reggae, Bossa Nova, and more, color-coded by genre.

### 🎸 Bassist
*   **Walking Bass Generator**: Automatically generates melodic walking bass lines that follow your arranger data. The engine uses sophisticated targeting logic to land on the Root at measure boundaries.
*   **Rhythmic Styles**: Choose between Whole Note, Half Note, Arpeggio, Walking (Quarter Note), and Bossa Nova patterns.

### 🎸 Soloist
*   **Algorithmic Improvisation**: Generates melodic lines in real-time, thinking in phrases and rhythmic cells rather than random notes.
*   **Soloing Styles**: Choose from Scalar, Shreddy, Blues, Minimal, and Neo-Soul.
*   **Dual-Clock System**: Capable of playing "straight" or "laid back" lines even over swinging drums for a more human feel.

### 📊 Unified Visualizer
*   **Dedicated Live View**: A full-width, high-fidelity graph at the bottom of the page that superimposes Bass and Soloist tracks on top of your chord progression.
*   **Harmonic Analysis**: Real-time interval mapping using a vivid color scheme (Blue: Root, Green: 3rd, Orange: 5th, Purple: 7th+) helps you visualize melodic choices.
*   **Active Chord Pulse**: A subtle pulse effect on Arranger cards helps you track the song's position during playback.

### General
*   **MIDI Export**: Export your progression, bass line, and drum groove as a multi-track MIDI file (Format 1) with appropriate instrument assignments, chord name markers, and soloist pitch bends.
*   **Solarized Themes**: Native support for **Solarized Dark** and **Solarized Light** themes, with an "Auto" mode that syncs with your system preferences.
*   **Color-Coded Library**: Presets and styles are organized by genre using a compact, color-coded chip system (e.g., Purple for Jazz, Blue for Pop/Rock).
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
*   **Maximized View**: Enter a focused mode that expands the chord visualizer to fill the screen for easier reading.
*   **Practice Tools**: Includes a metronome count-in and an optional permanent **Metronome Click** to keep you in time during playback.
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
*   **Background Processing**: Uses Web Workers (`logic-worker.js`) to offload algorithmic generation (Bass/Soloist) from the main thread, ensuring glitch-free audio performance.
*   **State Management**: Custom centralized state management.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
