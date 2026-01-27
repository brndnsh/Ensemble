## 2026-01-20 - Inline Script Extraction for CSP
**Vulnerability:** Inline scripts in auxiliary HTML files (like `manual.html`) prevent the application of strict Content Security Policies (CSP), leaving them vulnerable to XSS if other vectors (like `localStorage` poisoning) are exploited.
**Learning:** Even static documentation pages should have CSP if they interact with shared storage or context. Extracting inline logic to standalone JS files allows for `script-src 'self'` without `unsafe-inline`.
**Prevention:** Always place JavaScript in separate `.js` files and reference them via `src`. Apply the same strict CSP headers to all HTML entry points, not just the main app.

## 2026-05-22 - Referrer Policy Enforcement
**Vulnerability:** Default browser behavior or permissive referrer policies can leak sensitive URL parameters (like arrangement data encoded in query strings) to third-party domains via the `Referer` header.
**Learning:** Client-side applications often store state in the URL. Explicitly setting `Referrer-Policy: strict-origin-when-cross-origin` ensures that cross-origin requests (e.g., external links) only receive the origin, protecting user data privacy.
**Prevention:** Add `<meta name="referrer" content="strict-origin-when-cross-origin">` to all HTML entry points (`index.html`, `manual.html`) to enforce this policy at the client level.

## 2026-10-27 - DOM Injection via innerHTML
**Vulnerability:** Usage of `innerHTML` with dynamically formatted strings (like chord symbols) creates a potential XSS vector if input sanitization logic (e.g., regex checks) is bypassed or flawed in the future.
**Learning:** Relying on input validation alone is "defense in hope". Secure-by-design requires using APIs that automatically handle escaping, such as `textContent` or `document.createElement`.
**Prevention:** Replaced `innerHTML` usages in `ui-chord-visualizer.js` and `ui-controller.js` with safer DOM manipulation methods. Added `escapeHTML` utility for cases where HTML structure is required.
