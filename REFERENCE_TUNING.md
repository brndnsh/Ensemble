# Reference Comparison & Velocity Tuning

This document tracks specific reference recordings used to calibrate the Ensemble engine's velocity maps and micro-timing.

## Jazz-Funk
**Reference Track:** *Cantaloupe Island* - Herbie Hancock (1964)
- **Target Feel:** Straight 8ths but laid back. Solid, repetitive bass anchor.
- **Velocity Goals:**
    - **Bass:** Consistent mezzo-forte (0.7 - 0.8) on downbeats. Ghost notes on syncopations (0.3 - 0.4).
    - **Drums:** Tight hi-hats (0.5 - 0.6). Kick drum should be punchy (0.85) but not overpowering. Snare backbeats sharp (0.9).

## Reggae
**Reference Track:** *Redemption Song* (Band Version) / *One Love* - Bob Marley
- **Target Feel:** Heavy "One Drop" or "Rockers". Bass carries the melody.
- **Velocity Goals:**
    - **Bass:** Deep, sustaining notes. Velocity fairly consistent (0.8), relying on duration for expression. Low-pass filter focus.
    - **Kick:** "One Drop" on beat 3 must be heavy (0.9 - 1.0).
    - **Hi-Hat:** Crisp, short, consistent chunks (0.6).
    - **Guitar/Keys Skank:** Short, staccato, medium velocity (0.5 - 0.6).

## Neo-Soul
**Reference Track:** *Untitled (How Does It Feel)* - D'Angelo
- **Target Feel:** Drastically "behind the beat".
- **Velocity Goals:**
    - **Kick:** Soft, felt more than heard (0.6 - 0.7).
    - **Snare:** Sharp rimshot (0.8) with very soft ghost notes (0.2).
    - **Hi-Hat:** Loose, varying velocities (0.4 - 0.7).

---

## Current Calibration Log

### [Date: 2026-01-14]
- **Status:** Initial calibration completed.
- **Action:** 
    - **Funk:** Reduced Bass "One" velocity to 0.85, Ghost notes to 0.35. Tamed Hi-Hat accents to 1.0.
    - **Reggae:** Clamped Dub Bass to ~0.8. Reduced Skank velocity to ~0.5.
    - **Neo-Soul:** Applied 0.75x global velocity dampener to drums.
- **Next Steps:** Listen to output and verify against reference tracks.
