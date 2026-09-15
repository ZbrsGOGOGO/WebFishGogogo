# Radius Raid — self-hosted source provenance

- Original author: Jack Rugile.
- Canonical repository: https://github.com/jackrugile/radius-raid
- Exact source revision: `016cb866b6078672e37a1691bd9fe555364dbf58` (main).
- License: original MIT, copyright 2014 Jack Rugile; preserved verbatim in `LICENSE`, `packages/frontend/public/licenses/radius-raid-MIT.txt`, and the game directory `LICENSE.txt`.
- Complete adapted, readable source: `packages/frontend/public/games/local-lab/radius-raid/`. These classic JavaScript files are the actual shipped game, not an external embed or a simplified reimplementation. No build step is required.

## What is retained

The upstream `js/{util,ease,definitions,text,hero,enemy,bullet,explosion,powerup,particle,particleemitter,textpop,levelpop,button,game}.js` are copied from the pinned source. Enemy definitions (13), escalating level distributions, powerup definitions (5), combat, particles, canvas pixel lettering and layered backgrounds are retained. The game's original credits remain visible.

The renderer generates graphics and a numeric pixel-letter alphabet directly on canvas. No sprite, downloaded font, screenshot or favicon is shipped. Upstream uses procedural source graphics rather than a separate asset pack; the copied game source is covered by the repository MIT license.

## Site adaptations and deliberate exclusions

- The HTML/style become separate local files with explicit classic script ordering; `js/boot.js` creates the upstream `$` object without inline script. The site-owned `../bridge.js` loads first.
- Default fit-to-window is enabled; the original 800×600 game / 1600×1200 world and original F fit toggle remain.
- A separate Chinese HTML toolbar adds keyboard/screen-reader-accessible “开始波次” and “返回菜单” controls alongside the original Canvas PLAY/menu. Start is enabled only in the menu and repeats the original reset/play action; its handler also rejects live/paused/gameover/stats/credits states to prevent accidental wave resets. Explicit return ends the current wave but preserves the iframe's session statistics. Only a user-triggered start focuses the named, tab-accessible combat canvas. The unscaled toolbar reserves viewport space instead of covering the HUD, without changing the 800×600 combat coordinates or rules.
- All upstream MP3/WebM sounds, `howler.min.js` and its audio engine are excluded. Their separate asset provenance is not used as justification to distribute them. `js/audio.js` is a new silent chainable adapter preserving `play(...).rate(...)` calls without producing sound.
- `js/storage.js` is wholly replaced by a new in-memory adapter. The upstream Stack Overflow-derived `Storage.prototype` helper is not distributed. Browser storage is never touched; statistics last only in the open iframe, survive pause/resume, and clear when the window closes. Reset wording is corrected accordingly.
- M sound toggling is removed and the in-game instruction row accurately shows F fit instead. This edition is always silent.
- The external JS13K button returns to the local menu instead of opening another website.
- No new network, analytics, service worker, payment, account, economic or leaderboard integration is added.

## Embedding and limits

Keyboard/mouse desktop game: WASD/arrows move, mouse aims/fires, P pauses, F changes fit. The parent's sandboxed window can pause/resume the same round; Esc/blur/hidden handling belongs to the shared bridge. Small-window scaling retains the upstream game, not redesigned touch controls. Do not claim mobile play, persistent saves or shared scores.

The game files are approximately 130 KB of uncompressed readable text, excluding the shared bridge (see static tests for a regression ceiling). This is a transfer-size observation, not an FPS/GPU/RAM measurement. Original rendering and real-time rules are not throttled or replaced.
