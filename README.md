# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chords") with a drum sequencer ("Grooves") in a unified, responsive interface.

## Features

### 🎹 Chords
*   **Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`).
*   **Playback Styles**: Choose from various accompaniment styles like Pad, Pulse, Strum, Funk, Reggae, and Jazz.
*   **Smart Voicing**: Automatically calculates smooth voice leading for chords.
*   **Transposition**: Instantly transpose the entire progression to any key.

### 🥁 Grooves
*   **Step Sequencer**: A 16-step grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **Presets**: Includes standard drum patterns for various genres (Rock, Hip Hop, Jazz, Latin).

### 🎸 Bassist
*   **Walking Bass Generator**: Automatically generates melodic walking bass lines that follow your chord progression.
*   **Rhythmic Styles**: Choose between Whole Note, Half Note, and Walking (Quarter Note) patterns.
*   **Melodic Visualizer**: Real-time visualization of the bass line contour and chord tones.
*   **Register Control**: Adjustable bass register (center octave) to fit different musical contexts.

### 🎷 Soloist
*   **Algorithmic Soloing**: Generates melodic lines over your progression using rhythmic cells and harmonic targeting.
*   **Key-Aware & Blues Logic**: Melodies strictly adhere to the parent key signature for diatonic chords and employ Major/Minor blues scales with chromatic grace note slips for authentic phrasing.
*   **Melodic Visualizer**: Real-time visualization of the soloist's melodic path.

### General
*   **Mixer**: Adjust individual levels for Master, Chords, Bass, and Drums.
*   **Reset to Defaults**: Quickly restore original settings, volumes, and registers from the Settings menu.
*   **PWA**: Fully installable and works offline.
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
