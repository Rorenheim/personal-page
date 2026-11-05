---
name: Touch browser checks
description: Reliable input and rendering checks in this environment's headless Chromium.
---

Use raw CDP `Input.dispatchTouchEvent` sequences for swipe and tap checks.

**Why:** Higher-level synthetic scroll and tap commands did not reliably produce input in this environment; raw touch-start/move/end sequences exercised native scrolling and navigation successfully.

**How to apply:** When testing touch behavior directly with headless Chromium, use raw input events and verify actual scroll offsets and navigation rather than treating a successful protocol response as evidence of interaction.

Do not treat software-rendered headless WebGL timing as a mobile-device FPS benchmark.

**Why:** Visible game and background rendering can temporarily stall together in the headless environment without an application error. Fixed short timing windows can therefore fail even when rendering subsequently progresses correctly.

**How to apply:** Verify frame progress and offscreen suspension explicitly. Use real-device profiling for claims about user-perceived smoothness.
