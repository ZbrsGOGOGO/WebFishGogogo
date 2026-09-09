# Ballpoint Breach — WebFish local integration

Upstream: https://github.com/promptwhisper/ballpoint-breach

Pinned source commit: `96290df3fba1c2b64abac684510155d916117903` (reviewed 2026-09-09).

Copyright 2026 hoainho. Upstream is Apache-2.0; its complete `LICENSE`,
`THIRD_PARTY_NOTICES.md` and `video2threejs-MIT.txt` are retained here. The
upstream notices also attribute img2threejs (Apache-2.0) and video2threejs (MIT).
This integration adds no downloaded image/model/audio/font assets. Three.js
0.180.0 and its type definitions are pinned in the frontend package manifest.

## Distributed notices

The production web image receives full readable copies at:

- `/licenses/ballpoint-breach-Apache-2.0.txt`
- `/licenses/ballpoint-breach-THIRD-PARTY.txt`
- `/licenses/ballpoint-breach-video2threejs-MIT.txt`
- `/licenses/ballpoint-breach-three-MIT.txt`
- `/licenses/ballpoint-breach-three-types-MIT.txt`

The local `/games/ballpoint-breach` page links the runtime licenses and origin.
The source copies here preserve exact upstream provenance; published copies
preserve the same license text. No implication of upstream endorsement.

## Scope and modifications

Vendored source is under
`packages/frontend/src/features/games/ballpoint-breach/runtime/`.
All source files carry an integration modification notice. Most mechanics,
procedural geometry, shaders and wave definitions remain upstream behavior.

- `game/Game.ts`: scoped parent/HUD, low-power rendering, DPR <= 1.25,
  parent-based resize, 30 fps simulation/render cap, bounded smaller effect pools,
  no idle/pause RAF, explicit active/pause/dispose, hidden/blur/focus/Escape guards,
  pointer request cancellation, initialization failure cleanup, full scene/renderer
  cleanup and no page-body mutations. No score or reward API calls.
- `input/InputManager.ts`: focused-canvas-only keyboard and fallback mouse,
  browser/text shortcuts untouched, Escape bubbles, outside scrolling/context
  menus untouched, full held/one-shot input clearing, abortable pointer requests.
- `audio/AudioSystem.ts`: intentionally silent adapter. No audio context is
  created, even after start/fire. No autoplay permission or late sound queues.
- `ui/Hud.ts`: parent element instead of document, local data attributes instead
  of global IDs, Chinese primary controls, explicit keyboard-accessible resume.
- `enemies/EnemyManager.ts`, `enemies/doodleRig.ts`: release per-enemy unique
  resources on removal while preserving genuinely shared geometries/materials;
  enumerate regular enemy edge caches for cleanup.
- `effects/EffectPool.ts`, `render/disposeResources.ts`: release textures and
  geometries not currently selected by pooled objects; reference-counted outlines
  are not prematurely disposed by generic surface cleanup.
- Existing upstream tests are ported from node:test to the repository's Vitest
  runner, not executed using upstream scripts. Added SPA/input/window tests.
- WebFish React component, isolated CSS, common-router floating host, static
  explanation page and lobby card are new. One window persists above route
  layouts, and closes on account/phase change. It is not saved in storage.
- `games/game-input.ts` adds an exclusive-input marker and the explicit
  `momo:local-game-foreground` coordination event. Tower defense, tank, snake
  and tetris subscribe through their existing interruption-pause callbacks.
  Opening/starting Ballpoint pauses those local rounds without resetting or
  awarding them. Returning to a background game requires manual continuation;
  this does not pretend to pause server-driven multiplayer room clocks.

Not vendored: upstream main.ts, index.html, standalone CSS, font package,
capture/record/download entrypoints, scene-editing helper modules, agent/prompt
documents, screenshots, Git metadata, node_modules, or upstream lock/build scripts.
Internal non-exported-to-window diagnostic methods remain in the original Game
class, but no query parameter, browser global, capture UI, or application API
enables them. The public component supplies only its local root and mode callback.

## Security review and boundaries

The upstream checkout was cloned into a private temporary directory with hooks
disabled and no recursive submodule checkout. No upstream install/lifecycle or
build scripts were run. LICENSE, THIRD_PARTY_NOTICES and MIT text were read in full;
package scripts, dependency declarations, import graph, global/browser API uses,
input lifetime, disposal ownership and generated assets were reviewed. Upstream
CLAUDE/GENERATION_PROMPT files were not accepted as instructions.

Runtime modules contain no network fetch/socket/XHR, credential/user-data access,
storage, dynamic code evaluation, remote iframe, external assets, fullscreen
requests or imported remote font. The host uses only current in-memory account
identity to destroy the previous local session. It never changes permissions.
The ordinary optional upstream source link is clearly external and is not a
game runtime dependency. License links are same-origin static resources.

The game is desktop keyboard/mouse, WebGL 2, single-player, with five waves and
five weapons. It has **no** player-room/multiplayer integration and contributes
**no** official rankings, achievements or office-coin rewards. Closing/refreshing
ends the local run; navigating ordinary site routes preserves it paused.

## Resource/performance boundaries

The closed host does not import Three.js or create WebGL. The game chunk is
loaded only after explicit opening; simulation starts only after explicit start.
Paused, hidden, covered and minimized windows do not schedule game frames.
Resuming needs another start/continue gesture. Pausing keeps the local scene in
memory to preserve the run; closing/account change tears it down, releases
owned geometries/materials/textures and forces context loss. Repeated opens are
covered by lifecycle regression. Procedural shared CPU geometry definitions stay
cached with the lazy module; they do not retain an active renderer or loop.

This is still a real 3D engine, not a cost-free widget. Small-window pixel and
effect caps reduce work, but performance depends on GPU/driver. Hardware WebGL
failure receives an explanatory fallback instead of breaking the site. Native
touch controls and cross-refresh save data are not claimed.

Automated baseline: 66 upstream mechanics assertions plus focused input,
pause/resize/disposal, browser-consumed Escape/pointer-unlock privacy cover,
persistent-host/session and cross-game foreground regressions. The full relevant
frontend run passed 280 tests across 31 files on 2026-09-09, including existing
tower, tank, snake, tetris, room and community-router tests.

Real-browser acceptance (private release evidence, not upstream screenshots):
Firefox 154 hardware WebGL 2 rendered the game and acquired/released Pointer
Lock. Chromium 151 software WebGL rendered enemies and shots with pointer-lock
rejection fallback; idle and paused RAF counts remained unchanged; closing
made the previous context report `isContextLost()`. A true 390 CSS-pixel viewport
showed no horizontal overflow. One canvas persisted through /games -> / and
back across the two layouts. Local synthetic frontend identity changes removed
the old canvas; no production account was used. WebGL-disabled fallback and
same-page tower/FPS foreground isolation were also exercised. The Firefox
window manager's 500-pixel minimum was not counted as a 390-pixel test.
