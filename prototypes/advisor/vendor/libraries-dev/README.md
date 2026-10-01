# Libraries.dev source attribution

MIT source by Jakub Antalik from https://github.com/Jakubantalik/Libraries.dev at commit `a96a017bda137a630ad116cd1e6b81ba96499b81` (retrieved 16 September 2026).

- `thinking-orbs`: unmodified pure canvas engine, presets and types; license in `thinking-orbs/LICENSE`.
- `border-beam`: unmodified CSS generator, pulse driver and types; license in `border-beam/LICENSE`.

Banking's adapter is in `../../overview-effects/` (its original implementation location). It uses the actual preset geometry and generated Pulse Inner / Colorful styling without adding a React runtime. CSS and JavaScript are generated ahead of time and served locally. The adapter activates in the shared embedded advisor on all Banking pages and pauses offscreen, on hidden tabs, and for reduced motion.

Regenerate CSS/config with `node scripts/Build-OverviewEffects.mjs`, then bundle using the pinned esbuild command in that script. Sources are retained here to make regeneration independent of upstream changes.
