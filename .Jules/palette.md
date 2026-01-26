## 2024-05-22 - Sequencer Grid Accessibility
**Learning:** Custom interactive grids (like step sequencers) implemented with `div`s are completely invisible to screen readers and keyboard users. Adding `role="button"`, `tabindex="0"`, and `aria-label` along with keyboard handlers (Enter/Space) makes them fully accessible without changing the visual design.
**Action:** When encountering custom grid-based interfaces, check for semantic HTML or correct ARIA roles/attributes immediately.

## 2024-05-23 - Focus Rings in Overflow Containers
**Learning:** Standard focus rings (`outline`) are often clipped by containers with `overflow: hidden` (commonly used for rounded corners on grouped buttons). Using `outline-offset: -2px` forces the ring inside the element, ensuring visibility without altering the layout or padding.
**Action:** When styling focus states for grouped controls or stepper buttons, check for parent overflow clipping and use negative offsets if necessary.

## 2024-05-24 - Interactive Badges
**Learning:** Small interactive elements (like "badges" or "chips") implemented as `span`s with `onclick` are inaccessible. Converting them to `<button>` elements with appropriate styling (removing borders/backgrounds) provides native keyboard support and accessibility without complex ARIA retrofitting.
**Action:** Replace interactive spans with styled buttons (e.g., `.badge-btn`) to ensure accessibility.
