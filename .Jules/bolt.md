## 2024-05-23 - Audio Analyzer Allocation Optimization
**Learning:** Moving large static objects (like chord profiles) and their derived entries (Object.entries) out of tight loops in audio analysis (called ~4300 times/sec) resulted in a 43% performance improvement.
**Action:** When working with DSP or tight loops, always check for object literals or array methods (forEach, map, filter) defined inside the loop, and hoist them to module-level constants.
