# in ASCENT — self-hosted source provenance

- Original author: Noncho Savov / FoumartGames.
- Canonical repository: https://github.com/foumart/JS.13kGames.2021_inAscent
- Exact source revision: `a49ce66e81c0fd4e8c77ba511bbaa7ac09446b7c` (master).
- License: original MIT, copyright 2016 Noncho Savov; preserved verbatim in `LICENSE`, `packages/frontend/public/licenses/in-ascent-MIT.txt`, and the game directory `LICENSE.txt`.
- Complete adapted, readable source: `packages/frontend/public/games/local-lab/in-ascent/`. These classic JavaScript files are the actual shipped game. No build step, external engine or npm dependency is required.

## What is retained

The upstream `src/scripts/{Planet,Star,TweenFX,app,main,surface}.js` are copied from the pinned source. The game retains its terrestrial/solar system and moon views, Earth base, ten building definitions, five resource types, exploration/mining/colonization missions, resource depot offers, tutorial, time controls and original canvas/DOM renderer. This is a solar-exploration and base-management game, not a shooter.

Stars, planetary bodies, surface geometry and minimap shape arrays are code-generated under the source MIT license. The remaining characters are Unicode text displayed using available system emoji fonts; no emoji bitmap/font package is shipped.

## Site adaptations and deliberate exclusions

- Mechanical formatting: `surface.js` has trailing spaces/tabs removed and one final newline. This whitespace cleanup does not alter game rules or runtime behavior.
- Local HTML/CSS and explicit classic script ordering replace the upstream build template; site-owned `../bridge.js` loads first. No inline script or inline HTML event-handler attribute is required.
- Upstream dynamic `onclick` templates become `data-game-event` / JSON detail attributes handled by the new external `js/actions.js` delegate. Fixed game-local events preserve menu, building, mission, deal and tutorial close behavior under strict script CSP, without evaluating strings as code.
- The upstream remote Twemoji `@font-face` and `src/assets/Twemoji.ttf` are excluded completely. The repository has no accompanying notice establishing redistribution of that font. We do not assume the source MIT license covers a separately sourced font. System emoji fallback removes both font download and that asset-licensing uncertainty.
- All `SoundFX.js` and commented audio hooks are excluded. This edition is always silent.
- `resources/loader.js`, Web Monetization metadata/checks, PWA/service-worker resources, manifest, icon and screenshots are not shipped. The two starting-building expressions previously referencing loader state use their original free-edition branch (0); construction costs and resource requirements remain unchanged. No entitlement or free prebuilt-building grant is introduced.
- Unsupported-font-readiness handling safely uses the available system-font promise if present.
- Touch capability also checks `maxTouchPoints`, supporting modern iPad desktop UAs. Mouse/trackpad input remains available on touch-capable devices; each gesture uses its actual event coordinates rather than assuming every event is a touch. Blur/hidden clears only active drag callbacks and inertia, never resources, simulation time, selected base or round progress.
- The original resource-depot trade guard checked the receiving resource instead of the payment resource. It now checks actual payment inventory and validates positive finite offer quantities, preventing negative stock. Offer quantities, random selection and exchange effects are unchanged; this fixes a local game bug, not the website economy.
- The source had no implemented browser save (only TODO comments); progress stays in memory. No storage, network, tracking, account, payment, office-coin or server leaderboard integration is introduced.

## Embedding and limits

Desktop and landscape-touch interaction are retained from upstream. Expand the window for the 1920×1080 canonical interface; do not claim a comfortable 320 px portrait interface. Mouse/touch selects planets and buildings; the tutorial explains time control and missions. The parent pauses/resumes the same iframe round; closing/navigation discards its unsaved progress.

The source transfer is approximately 74 KB uncompressed readable text excluding the shared bridge, not the original competition zip-size claim. Canvas backing buffers are still the upstream 3840×3840 star map, 3840×1080 background and two 1920×1080 views: about 89 MiB if represented as raw RGBA. This is only a buffer-size calculation, not measured process/GPU memory, and it is not an assurance of low GPU cost. Original animation/time/resource rules are not artificially frame-throttled.
