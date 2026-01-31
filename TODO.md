# Modernization Roadmap

## High Priority
- [ ] **Decouple Tests from State Exports:** Create a centralized state mocking utility for tests to allow refactoring the `public/state.js` export signature without breaking the suite.

## Medium Priority
- [ ] **Strict State Access:**
    - Deprecate the direct export of `playback` and other state slices from `state.js`.
    - Force all logic (including controllers) to access state via a unified `getState()` or passed arguments to ensure reactivity consistency.
- [ ] **Unified Test Config:**
    - Consider moving `eslint.config.js` globals definition to a dedicated `tests/.eslintrc` if the flat config allows, to keep the root config cleaner.

## Low Priority
- [ ] **TypeScript Migration:** The project is well-typed via JSDoc, but a full move to TS would enforce the state boundaries strictly.
