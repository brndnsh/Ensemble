# Modernization Roadmap

## High Priority
- [x] **Standardize Action Pattern:** Refactor `togglePlay` and `setBpm` to be triggered via `dispatch(ACTIONS.TOGGLE_PLAY)` and `dispatch(ACTIONS.SET_BPM)`.
    - Create a "Middleware" or "Effect Listener" in `state.js` that listens for these actions and calls the audio engine logic.
    - Remove direct imports of `scheduler-core.js` and `app-controller.js` from `Transport.jsx` and other UI components.

## Medium Priority
- [ ] **Strict State Access:**
    - Deprecate the direct export of `playback` and other state slices from `state.js`.
    - Force all logic (including controllers) to access state via a unified `getState()` or passed arguments to ensure reactivity consistency.
- [ ] **Unified Test Config:**
    - Consider moving `eslint.config.js` globals definition to a dedicated `tests/.eslintrc` if the flat config allows, to keep the root config cleaner.

## Low Priority
- [ ] **TypeScript Migration:** The project is well-typed via JSDoc, but a full move to TS would enforce the state boundaries strictly.
