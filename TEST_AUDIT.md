# Test Suite Audit Report
**Date:** January 20, 2026
**Scope:** Thorough review of `tests/` directory for redundancies and blind spots.

## 1. Overview
The project uses `vitest` with `happy-dom` for a fast, component-agnostic testing environment. The suite is well-organized into `unit` (logic/synthesis), `system` (controller orchestration), `integration` (long-running constraints), and `standards` (musical correctness).

## 2. Redundancies
*   **Bass Logic vs. Genre Integrity:**
    *   **Status:** **RESOLVED.**
    *   **Action:** `genre-integrity.test.js` was refactored to focus on long-term stability and numeric validity across 1000+ measures. Music theory rules are now strictly owned by engine unit tests.

## 3. Blind Spots
### A. Visualizer & Canvas
*   **Status:** **RESOLVED.**
    *   **Action:** Created `tests/unit/visualizer.test.js` covering initialization, track management, note truncation, and render-loop draw call verification.

### B. Audio Context Integration
*   **Status:** **PENDING.** (Requires real browser environment or advanced Vitest browser mode).

### C. Worker Latency & Race Conditions
*   **Status:** **RESOLVED.**
    *   **Action:** Added latency simulation tests to `worker-sync.test.js` to ensure the asynchronous message bridge remains stable under delay.

### D. UI Interactions
*   **Status:** **PARTIAL.** (Basic song creation covered in smoke tests).
*   **Details:** `tests/ui/system-smoke.test.js` verifies the "happy path" of creating a song. It does not cover complex user interactions like:
    *   Editing a specific chord in the middle of a progression.
    *   Changing time signatures mid-playback.
    *   Drag-and-drop operations on the sequencer grid.

## 4. Strengths
*   **Standards Tests:** `tests/standards/` (e.g., `autumn-leaves.test.js`) are excellent. They effectively treat the system as a "black box" musician and grade it on musical output. This is a high-value pattern.
*   **Synthesis vs. Logic Separation:** The separation between `drums-logic` (pattern generation) and `drums-synthesis` (audio graph creation) is clean and correct.

## 5. Actionable Plan
1.  **Refactor Integrity Tests:** Simplify `genre-integrity.test.js` to focus on stability/crashes, removing duplicate rule checks found in logic tests.
2.  **Add Visualizer Tests:** Create `tests/unit/visualizer.test.js` mocking the Canvas API to verify draw calls.
3.  **Simulate Worker Lag:** Add a test case in `worker-sync.test.js` or `scheduler-core.test.js` that simulates delayed worker responses.
