# Liquid Glass (MIT)
Vendored from https://github.com/rizzytoday/liquid-glass at commit 841af14fb3eb9653d24aacf4eb049c9f389db1ef, 17 September 2026.
Files: core/liquid-glass.js and LICENSE. No remote runtime dependency.
Local change: cap displacement-map cache at 64 entries to bound memory across conversation sizes.
Full SVG backdrop refraction is Chromium-only; the library falls back to blur elsewhere. Banking uses quiet edge displacement, tint, and a reduced-transparency fallback. No text or bank data is copied into its geometry map canvas.
