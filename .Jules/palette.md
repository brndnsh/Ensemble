## 2024-05-22 - Sequencer Grid Accessibility
**Learning:** Custom interactive grids (like step sequencers) implemented with `div`s are completely invisible to screen readers and keyboard users. Adding `role="button"`, `tabindex="0"`, and `aria-label` along with keyboard handlers (Enter/Space) makes them fully accessible without changing the visual design.
**Action:** When encountering custom grid-based interfaces, check for semantic HTML or correct ARIA roles/attributes immediately.
