# Chat materials and optical glass research

17 September 2026. Exploration only; no UI changes or library installation. Owner has not selected a concept.

## Owner direction

Current bubbles look flat. The current Glass mode's richer finish is closer to the desired default. Optional Glass must visibly refract the actual page behind the floating conversation. Preserve AI-left/user-right alignment, draggable/resizable composer, theme colors and no expansion controls.

## Concepts

Generated with the built-in Image Generation tool using the supplied Banking screenshot as reference. Images in this directory are numbered in display order, not implementation proposals already approved. These are static visual targets, not proof of live optical rendering.

Common prompt brief: portrait 1024x1280 component crop; individual floating bubbles over the charcoal Banking goals page; violet AI, blue user; concise four-message fictional conversation; transparent outer space; no timestamps/avatars/orb in text mode; composer with waveform/send; toolbar with nine-dot grip, plus, minus and history only. Date anchor 17 September 2026.

1. option-1.png: softly sculpted satin surfaces, gentle convex illumination, opaque readable centers, quiet beveled edges and soft shadows.
2. option-2.png: smoked optical glass, curved refractive rim and visible bending of underlying progress lines, clear restrained edge highlights, dark readable centers.
3. option-3.png: more architectural rounded rectangles with a thin clear glass rim around a colored inner writing surface; less pill-shaped and less glossy.

## Source findings

- [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react): MIT; displacement, refraction modes, frosting, chromatic aberration and elasticity. README explicitly says Safari/Firefox do not show displacement. React does not remove that browser limitation.
- [rizzytoday/liquid-glass](https://github.com/rizzytoday/liquid-glass): current vendored engine. Plain JS plus React hook. SVG backdrop refraction is Chromium-only; other engines get blur. No immediate need to replace it or migrate Banking to React solely for glass.
- [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web): an alternative cross-browser method displaces the source content's own painted pixels in a lens region. It is not an arbitrary backdrop filter. Safari large-source limits and video constraints still matter.
- [PallavAg/liquid-glass-web-react](https://github.com/PallavAg/liquid-glass-web-react): MIT implementation of that approach; exports a plain DOM engine, so React is optional. Its cross-browser behavior is a documented claim, not verified in Banking. It wraps/filters the underlying content, which makes it a more substantial integration for multiple chat lenses moving across whole pages.

## Existing implementation assessment

Read advisor-glass.js, voice-companion.css, prototype styles and vendored implementation. The app already mirrors each chat surface into the parent document underneath its same-origin iframe, necessary because iframe backdrop sampling cannot see the parent page directly. Current displacement is -28, post-blur 5px, and foreground tints are approximately 78-80% opaque. These are confirmed source settings; how much each contributes to the reported visual failure remains a hypothesis until an in-browser isolation test. Merely observing filter elements in the DOM does not prove visible refraction.

## Recommended implementation sequence after selection

1. Make the approved richer colored material the default, with readable centers and subtle elevation.
2. For optional Glass, first isolate one parent-document lens over actual Banking text/progress lines. Prove visible bending while dragging, with blur/tint temporarily removed for diagnosis. Inspect clipping/filter/backdrop boundaries before adjusting strength.
3. Keep text separate from the refracted background. Add transparent edge bands and enough central tint for reading; do not distort the actual chat text.
4. Prefer the existing plain-JS engine if Chrome/Edge satisfy the required experience. If full Safari/mobile refraction is required, evaluate the Aave-style content-filter engine against real page layouts and multiple lenses before adopting it.
5. Acceptance must include actual moving page content bending at the rim, resized bubbles, chat scrolling, all themes, reduced transparency, and representative desktop/mobile performance. A generated still is not acceptance evidence.
