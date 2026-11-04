---
name: Touch browser checks
description: Reliable touch input for this environment's headless Chromium checks.
---

Use raw CDP `Input.dispatchTouchEvent` sequences for swipe and tap checks.

**Why:** Higher-level synthetic scroll and tap commands did not reliably produce input in this environment; raw touch-start/move/end sequences exercised native scrolling and navigation successfully.

**How to apply:** When testing touch behavior directly with headless Chromium, use raw input events and verify actual scroll offsets and navigation rather than treating a successful protocol response as evidence of interaction.
