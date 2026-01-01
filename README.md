# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a chord visualizer ("Chord Buddy") with a drum sequencer ("Groove Buddy") in a unified, responsive interface.

## Features

### 🎹 Chord Buddy
*   **Progression Builder**: Input progressions using Roman Numerals (`I V vi IV`), Nashville Numbers (`1 5 6- 4`), or Chord Names (`C G Am F`).
*   **Playback Styles**: Choose from various accompaniment styles like Pad, Pulse, Strum, Funk, Reggae, and Jazz.
*   **Smart Voicing**: Automatically calculates smooth voice leading for chords.
*   **Transposition**: Instantly transpose the entire progression to any key.

### 🥁 Groove Buddy
*   **Step Sequencer**: A 16-step grid for programming drum patterns (Kick, Snare, HiHat, Open Hat).
*   **Swing Control**: Adjustable swing amount and subdivision (8th/16th).
*   **Presets**: Includes standard drum patterns for various genres (Rock, Hip Hop, Jazz, Latin).

### General
*   **Mixer**: Adjust individual levels for Master, Chords, and Drums.
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
