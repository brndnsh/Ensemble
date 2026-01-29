# UI Refactoring Plan: Component-Based Architecture (Preact)

## Goal
Transition the Ensemble UI from imperative DOM manipulation (`ui-controller.js`, `ui.js`) to a declarative, component-based architecture using Preact. This will improve maintainability, facilitate AI-assisted development, and decouple the view layer from the core audio engine.

## Principles
*   **Atomic Changes:** Migrate one component/section at a time.
*   **Hybrid Operation:** The app must function correctly with both new components and legacy DOM manipulation running side-by-side during the transition.
*   **Unidirectional Data:** Components render based on state; User actions dispatch events; State updates trigger re-renders.
*   **Performance:** Maintain the strict "Mobile First" performance budget.

## Phase 1: Foundation & Proof of Concept (Current)
- [ ] **Tooling Setup**: Install Preact and configure `esbuild` for JSX support.
- [ ] **State Bridge**: Create a hook/utility to subscribe Preact components to the existing `state.js`.
- [ ] **POC Component**: Migrate the "Style Selector" (Genre/Style chips) to a Preact component.
- [ ] **Mount Point**: Create a root entry point to mount components into the existing HTML structure.
- [ ] **Verification**: Ensure style switching works seamlessly between the component and the legacy engine.

## Phase 2: Core Controls
- [ ] **Transport Controls**: Play/Stop, BPM, Metronome (high frequency updates).
- [ ] **Mixer Panel**: Volume sliders and mute toggles.
- [ ] **Settings Modal**: Complex form state management.

## Phase 3: The Arranger (Complex)
- [ ] **Section List**: Drag-and-drop reordering, editing (replacing `renderSections`).
- [ ] **Chord Input**: The complex text input and symbol insertion logic.

## Phase 4: Visualization & Grid
- [ ] **Sequencer Grid**: The drum grid (highly performance sensitive).
- [ ] **Chord Visualizer**: The scrolling chord display.

## Phase 5: Cleanup
- [ ] **Deprecate Legacy**: Remove `ui-controller.js` logic as it is replaced.
- [ ] **HTML Cleanup**: Remove empty containers from `index.html` as they are taken over by the root component.
- [ ] **CSS Refactor**: Move towards component-scoped styles (optional/later).
