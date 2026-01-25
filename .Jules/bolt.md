## 2024-05-22 - [Optimized calculateChromagram]
**Learning:** `calculateChromagram` was calculating pitch energy for the full 24-96 MIDI range even when `minMidi`/`maxMidi` options were provided, wasting ~40-70% of CPU cycles in trigonometry.
**Action:** Always check loop bounds in signal processing functions. Use early returns to skip unnecessary computations.
