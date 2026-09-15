# Connect Four — pinned original offline port

Original project: [kenrick95/c4](https://github.com/kenrick95/c4), pinned to **35b1d25fcc05961b91153fd6c2c09f01f1c32cc9**. [Original MIT license](upstream/LICENSE), copyright (c) Kenrick, is retained and served at `/licenses/c4-MIT.txt`.

This ships the original 7-column/6-row Canvas game and depth-four minimax/alpha-beta AI, with human-vs-AI, same-device human-vs-human and AI-vs-AI spectator modes. The board, dropping animation and win/draw/reset rules are not rewritten into a miniature imitation. There is no website leaderboard, currency or reward integration. Refresh/close ends the current local match; no account or cloud save is implied.

## Source, materials and dependencies

`upstream/` contains the reviewed browser/core TypeScript runtime, original Canvas/SVG logo, licenses and dependency metadata from the pinned revision, with LF/single-final-newline/trailing-whitespace normalization. Original documentation is available at the source link. There are no bundled audio tracks, external textures, fonts, models, ads or tracking scripts. Original Canvas drawing and the 410-byte logo are first-party repository code/material under its MIT declaration.

The original upstream monorepo requests Node 24/Yarn 4 and Vite/TypeScript development tools; its browser game's only production dependency is the included `@kenrick95/c4` core workspace. This port resolves that core directly and bundles it with a privately installed **esbuild 0.25.12**. No upstream Yarn/Vite, server dependencies or change to the website's package/lock files is needed. [The rebuild script](../../scripts/build-local-lab-strategy.mjs) downloads nothing; use its documented private toolchain and `LOCAL_LAB_BUILD_TOOLS`.

Upstream online mode defaults to `wss://c4-server.fly.dev/` and is **not** a website room service. The online module, mode selector, `matchId` autoselection, clipboard/share UI and upstream network endpoints are excluded from the executable offline bundle. Same-device two-player mode is not advertised as an online room. Server-side multiplayer would require a separate explicitly authorized protocol/security integration.

## Adapter and security boundary

The adapter keeps the original Canvas logic and changes only hosting/UI boundaries: classic IIFE, relative local assets, fluid board scale that fits 320px, readable 44px controls/dialog scrolling, Chinese interface text, and HTML escaping of player names before the original winner-message markup. No user-provided name can become an image/event handler in that dialog. Submit-button clicks and non-IME Enter close the original native dialog explicitly; the sandbox can forbid forms before its `submit` event, so this port does not rely on that event or grant `allow-forms`.

Artifacts and exact hashes are recorded in `packages/frontend/public/games/local-lab/connect-four/provenance.json`. The parent loads `/games/local-lab/bridge.js` first, keeps the child in an opaque-origin `allow-scripts` sandbox, and controls the original timers/rAF/time through its explicit pause/resume lifecycle. The child has a `connect-src 'none'` CSP; no cookie, storage, parent DOM, account balance or reward API is accessed. Pure CSS animations also freeze during pause. Programmatic VM/DOM regression tests execute a complete original same-device match and check winner-name escaping; they are not real-browser match completion. Release verification must additionally play human-vs-AI and verify the common parent's freeze/close behavior in a real browser.
