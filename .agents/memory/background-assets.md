---
name: Background assets
description: Which background image files exist and which pages/sections use them.
---

## Available files (in /backgrounds/)
- background1.png — main hero / home dashboard (warm sunset landscape)
- background2.png — gallery page, resource packs section
- accounts.png — accounts page hero
- gallary.png — NOTE: filename is a typo ("gallary", not "gallery") — not currently used in pages
- mod.png — mods section, modpacks section
- shader.png — shaders section

## Critical: background3.png does NOT exist
Any import of `background3.png` will cause a build error. The previous HomePage.tsx had this bug; it was fixed to use bg1/bg2.

**Why:** The file was referenced in old code but never added to the repo.

**How to apply:** When adding new pages that need a background, only use the six files listed above.
