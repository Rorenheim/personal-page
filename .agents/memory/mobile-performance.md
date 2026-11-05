---
name: Mobile motion scope
description: Mobile performance constraints and the desktop behavior boundary.
---

Mobile scrolling must not start tile or content-reveal animations. Keep the mobile background animated, but optimize its rendering cost. Leave desktop/web visuals and animation behavior unchanged when doing mobile performance work.

**Why:** The user reported jittery mobile backgrounds and animations and explicitly requested these boundaries.

**How to apply:** Do not reintroduce mobile viewport-triggered tile animations as an enhancement. Gate mobile rendering optimizations by input capabilities so desktop behavior retains its original path.
