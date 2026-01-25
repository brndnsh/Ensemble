## 2026-01-20 - Inline Script Extraction for CSP
**Vulnerability:** Inline scripts in auxiliary HTML files (like `manual.html`) prevent the application of strict Content Security Policies (CSP), leaving them vulnerable to XSS if other vectors (like `localStorage` poisoning) are exploited.
**Learning:** Even static documentation pages should have CSP if they interact with shared storage or context. Extracting inline logic to standalone JS files allows for `script-src 'self'` without `unsafe-inline`.
**Prevention:** Always place JavaScript in separate `.js` files and reference them via `src`. Apply the same strict CSP headers to all HTML entry points, not just the main app.
