## 2024-05-23 - Global State Subscription Overhead & Mutable State Traps
**Learning:** Connecting Preact components to a global event bus without equality checks caused massive re-render storms on every dispatch (even irrelevant ones). Furthermore, relying on reference equality for selectors fails when the underlying state is mutable (e.g. arrays modified in place), requiring explicit version counters to signal updates reliably.
**Action:** Always implement equality checks in custom store hooks. When using mutable state, add version/timestamp properties to signal changes to subscribers.
