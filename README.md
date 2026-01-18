# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a generative "Virtual Band" with a sophisticated chord visualizer and drum sequencer in a unified, responsive interface.

## Key Features

*   🖋️ **Advanced Arranger**: Build complex song structures using Roman Numerals, Nashville Numbers, or Absolute chord names. Features include song templates, drag-and-drop reordering, and a specialized symbol palette.
*   🎸 **Generative Virtual Band**: Intelligent **Bassist** and **Soloist** engines that utilize "Expressive Musicality" logic to generate human-like, intensity-aware accompaniment in real-time. Features advanced **Melodic Devices** (Enclosures, Quartal Harmony, Call & Response) and a **Smart Genres** system that coordinates all instruments for a cohesive feel.
*   🥁 **Smart Drum Machine**: A multi-level velocity step sequencer with built-in genre presets and adjustable swing/humanization. Integrated with a procedural fill engine.
*   📊 **Unified Visualizer**: A multi-track harmonic monitor that superimposes instrumental performance over chord data, with real-time interval analysis and retractable UI.
*   🎹 **Pro Accompaniment**: Highly optimized voicing engine with adjustable density, styles (Pad, Funk, Reggae), and intelligent relative key transposition.
*   📁 **Workflow Tools**: Real-time Web MIDI output for DAW integration, MIDI file export, auto-save persistence, URL-based sharing, and a comprehensive user library for custom presets.
*   📱 **PWA Ready**: Fully responsive, installable, and works offline with native Solarized theme support.

## Usage

Ensemble uses vanilla JavaScript with ES Modules and requires no build step. Serve the project root directory with any local static file server:

### Using Python
```bash
python3 -m http.server 8000
```

### Using Node.js
```bash
npx serve .
```

Navigate to `http://localhost:8000` to start playing.

## Testing

Automated unit tests are located in the `tests/` directory and use Vitest.

```bash
npm test
```

## Deployment

Ensemble includes scripts for automated deployment to remote servers using `esbuild` for minification and `rsync` for efficient, clean file transfer.

### Prerequisites

- `esbuild` (installed via `npm install`)
- `rsync` (available on local and remote machines)
- SSH access with the `root` user to the target servers (`ensembletest` and `ensemble`).

### Commands

To deploy to the test environment:
```bash
npm run deploy:test
```

To deploy to the production environment:
```bash
npm run deploy:prod
```

**Dry Run:**
You can test the build process without uploading by using the `-whatif` flag directly with the script:
```bash
./scripts/deploy-prod.sh -whatif
```

The scripts will create a `dist/` folder, bundle and minify JavaScript and CSS using `esbuild`, apply cache-busting hashes, sync assets, and upload the contents to `/var/www/html/` on the target server. Old files on the server will be automatically removed.

## Tech Stack

*   **Engine**: Vanilla JavaScript (ES Modules) & Web Audio API. Modularized core for high-precision scheduling and synthesis.
*   **Background Processing**: Web Workers (`logic-worker.js`) for glitch-free algorithmic generation.
*   **UI**: Pure CSS (Solarized variables) with no external frameworks.
*   **State**: Centralized reactive state with JSDoc typing.

## License

MIT License. See [LICENSE](LICENSE) for details.