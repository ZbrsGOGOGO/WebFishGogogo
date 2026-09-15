/**
 * Rebuild the two original, pinned MIT strategy games without changing the
 * application's dependencies. Supply a private tools directory containing
 * esbuild 0.25.12 and tailwindcss 3.4.17 (installed with --ignore-scripts).
 * No download/install occurs in this script. The generated public files are
 * committed release artifacts; the normal frontend build only copies them.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const tools = process.env.LOCAL_LAB_BUILD_TOOLS;
if (!tools || !path.isAbsolute(tools)) {
  throw new Error('LOCAL_LAB_BUILD_TOOLS must be an absolute private build-tools directory');
}
const esbuildPackage = JSON.parse(await fs.readFile(path.join(tools, 'node_modules/esbuild/package.json'), 'utf8'));
const tailwindPackage = JSON.parse(await fs.readFile(path.join(tools, 'node_modules/tailwindcss/package.json'), 'utf8'));
if (esbuildPackage.version !== '0.25.12' || tailwindPackage.version !== '3.4.17') {
  throw new Error('Use the audited esbuild 0.25.12 / tailwindcss 3.4.17 toolchain');
}
const { build } = await import(pathToFileURL(path.join(tools, 'node_modules/esbuild/lib/main.js')).href);
const serverRoot = path.join(root, 'third_party/server-survival/upstream');
const c4Root = path.join(root, 'third_party/connect-four/upstream');
const serverOut = path.join(root, 'packages/frontend/public/games/local-lab/server-survival');
const c4Out = path.join(root, 'packages/frontend/public/games/local-lab/connect-four');
await fs.mkdir(serverOut, { recursive: true });
await fs.mkdir(c4Out, { recursive: true });

const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'none'; media-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'";
const securityMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n<meta name="referrer" content="no-referrer" />`;
const read = (file) => fs.readFile(file, 'utf8');
// Removing unsupported markup can leave whitespace-only lines. Keep the
// generated HTML mechanically clean while preserving markup and visible copy.
const normalizeGeneratedHtml = (html) => html.replace(/[\t ]+$/gm, '').replace(/\n+$/, '') + '\n';
const replaceRequired = (code, before, after, label) => {
  if (!code.includes(before)) throw new Error(`Pinned upstream changed: ${label}`);
  return code.replace(before, after);
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// These modules are local adapter inputs, not modifications to upstream.
const silentSound = `export class SoundService {
  constructor() { this.ctx = null; this.musicMuted = true; this.sfxMuted = true; }
  init() {} playMenuBGM() {} playGameBGM() {} switchBGM() {}
  playMenuHover() {} playMenuClick() {} _persistPrefs() {}
  toggleMusic() { return true; } toggleSfx() { return true; }
  playTone() {} playPlace() {} playConnect() {} playDelete() {}
  playSuccess() {} playFail() {} playFraudBlocked() {} playGameOver() {}
}`;

function adaptServer(code, relativePath) {
  if (relativePath === 'src/services/SoundService.js') return silentSound;
  code = code.replace(/new Audio\((?:"[^"]+"|'[^']+')\)\.play\(\);?/g, '/* audio deliberately disabled in the local lab */');
  if (code.includes('localStorage')) {
    code = `const labSessionStorage = window.labSessionStorage;\n${code.replace(/\blocalStorage\b/g, 'labSessionStorage')}`;
  }
  if (relativePath === 'src/i18n.js') {
    code = replaceRequired(code, "labSessionStorage.getItem('game_locale') || 'en'", "labSessionStorage.getItem('game_locale') || 'zh'", 'default Chinese locale');
  }
  if (relativePath === 'src/ui/toolbar.js') {
    code = replaceRequired(code, "onclick=\"setTool('${tool}')\"", 'data-lab-tool="${tool}"', 'palette event');
  }
  if (relativePath === 'src/ui/campaign-ui.js') {
    code = replaceRequired(code, 'onclick="openCampaignBriefing(${lvl.id})"', 'data-lab-level="${lvl.id}"', 'campaign entry event');
    code = replaceRequired(code, 'onmousemove="showCampaignLevelTooltip(event, ${lvl.id})" onmouseleave="hideCampaignLevelTooltip()"', 'data-lab-tooltip="${lvl.id}"', 'campaign tooltip events');
    code = replaceRequired(code, 'list.innerHTML = html;', `list.innerHTML = html;
    list.querySelectorAll('[data-lab-level]').forEach(el => el.addEventListener('click', () => openCampaignBriefing(Number(el.dataset.labLevel))));
    list.querySelectorAll('[data-lab-tooltip]').forEach(el => {
      el.addEventListener('mousemove', event => showCampaignLevelTooltip(event, Number(el.dataset.labTooltip)));
      el.addEventListener('mouseleave', hideCampaignLevelTooltip);
    });`, 'campaign explicit listeners');
  }
  if (relativePath === 'src/core/hints.js') {
    code = replaceRequired(code, "onclick=\"this.parentElement.parentElement.remove(); STATE.hints.dismissedHints.add('${hint.id}')\"", 'data-lab-dismiss-hint', 'hint dismissal attribute');
    code = replaceRequired(code, 'warningsContainer.appendChild(warning);', `warning.querySelector('[data-lab-dismiss-hint]')?.addEventListener('click', () => {
    warning.remove(); STATE.hints.dismissedHints.add(hint.id);
  });
  warningsContainer.appendChild(warning);`, 'hint dismissal listener');
  }
  // The opaque-origin sandbox cannot use history/clipboard/downloads. Do not
  // decode a query parameter or restore architecture across this boundary.
  if (relativePath === 'src/ui/share.js') {
    code = code.replace(/function consumeSharedArchParam\(\) \{[\s\S]*?\n\}/, 'function consumeSharedArchParam() { return null; }');
  }
  return code;
}

const serverPlugin = {
  name: 'server-survival-reviewed-local-adapter',
  setup(builder) {
    builder.onLoad({ filter: /\.js$/ }, async ({ path: inputPath }) => {
      if (!inputPath.startsWith(serverRoot + path.sep)) return;
      return { contents: adaptServer(await read(inputPath), path.relative(serverRoot, inputPath).split(path.sep).join('/')), loader: 'js' };
    });
  },
};
await build({
  entryPoints: [path.join(serverRoot, 'src/main.js')], outfile: path.join(serverOut, 'game.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  minify: true, charset: 'utf8', legalComments: 'none', plugins: [serverPlugin],
  banner: { js: '/*! Server Survival — Kostyantyn Pshenychnyy, MIT. Upstream 01796362d3b7bfa6c85efab5e2685f4d955dc137. Local offline adapter; see /licenses/server-survival-MIT.txt. */' },
});

let serverHtml = await read(path.join(serverRoot, 'index.html'));
serverHtml = serverHtml.replace('lang="en"', 'lang="zh-CN"');
serverHtml = serverHtml.replace(/<script\b[\s\S]*?<\/script>/g, '');
serverHtml = serverHtml.replace(/<meta\b[^>]*(?:property="og:|name="twitter:)[^>]*>/g, '');
serverHtml = serverHtml.replace('user-scalable=no', 'user-scalable=yes');
serverHtml = serverHtml.replace('<head>', `<head>\n${securityMeta}\n<script src="../bridge.js"></script>`);
serverHtml = serverHtml.replace('<!-- Time Control Panel (Top Center) -->\n    <div', '<!-- Time Control Panel (Top Center) -->\n    <div id="lab-time-controls"');
serverHtml = serverHtml.replace('<link rel="stylesheet" href="style.css" />', '<link rel="stylesheet" href="utility.css" />\n<link rel="stylesheet" href="style.css" />\n<link rel="stylesheet" href="adaptation.css" />');

// Strip unsupported/external affordances, rather than hiding a broken feature.
for (const id of ['btn-share', 'tool-music', 'tool-sfx', 'menu-music-btn', 'menu-sfx-btn', 'upload-btn', 'btn-download-save', 'btn-share-png', 'btn-share-link']) {
  const pattern = new RegExp(`<button\\b(?=[^>]*\\bid="${id}")[^>]*>[\\s\\S]*?<\\/button>`, 'g');
  serverHtml = serverHtml.replace(pattern, '');
}
serverHtml = serverHtml.replace(/<input\b[^>]*id="upload-file-input"[^>]*>/g, '');
// Original wording implied persistence. This adapter stores a save only until
// this iframe is closed/reloaded. Switching accounts remounts the iframe.
serverHtml = serverHtml.replace(/(<button\b[^>]*)(data-i18n="save_browser")/g, '$1data-lab-session-save');
serverHtml = serverHtml.replace('data-i18n="save_browser"', 'data-lab-session-save');
serverHtml = serverHtml.replace('data-i18n="continue_game"', 'data-lab-session-load');

const handlerBodies = [];
serverHtml = serverHtml.replace(/\son([a-z]+)="([^"]*)"/g, (_match, eventType, body) => {
  const index = handlerBodies.push({ eventType, body }) - 1;
  return ` data-lab-${eventType}="${index}"`;
});
const handlerCode = `(() => {
  const actions = [${handlerBodies.map(({ body }) => `function(event) { ${body} }`).join(',\n')}];
  ${[...new Set(handlerBodies.map(({ eventType }) => eventType))].map(eventType => `document.addEventListener('${eventType}', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-lab-${eventType}]') : null;
    if (!target) return;
    const action = actions[Number(target.getAttribute('data-lab-${eventType}'))];
    if (action) action.call(target, event);
  });`).join('\n')}
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-lab-tool]') : null;
    if (button) window.setTool(button.getAttribute('data-lab-tool'));
  });
})();`;
await fs.writeFile(path.join(serverOut, 'actions.js'), handlerCode);
serverHtml = serverHtml.replace('</body>', '<script src="bootstrap.js"></script>\n<script src="three-r128.min.js"></script>\n<script src="game.js"></script>\n<script src="actions.js"></script>\n</body>');
await fs.writeFile(path.join(serverOut, 'index.html'), normalizeGeneratedHtml(serverHtml));
await fs.writeFile(path.join(serverOut, 'bootstrap.js'), await read(path.join(root, 'third_party/server-survival/adapters/bootstrap.js')));
await fs.writeFile(path.join(serverOut, 'adaptation.css'), await read(path.join(root, 'third_party/server-survival/adapters/adaptation.css')));
await fs.writeFile(path.join(serverOut, 'style.css'), await read(path.join(serverRoot, 'style.css')));
const threeSource = await fs.readFile(path.join(root, 'third_party/server-survival/vendor/three-r128.min.js'));
if (digest(threeSource) !== '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2') throw new Error('Three r128 vendored source digest mismatch');
await fs.writeFile(path.join(serverOut, 'three-r128.min.js'), threeSource);

const twConfig = path.join(root, 'third_party/server-survival/adapters/tailwind.config.cjs');
execFileSync(process.execPath, [path.join(tools, 'node_modules/tailwindcss/lib/cli.js'), '-c', twConfig, '-i', path.join(root, 'third_party/server-survival/adapters/utility.input.css'), '-o', path.join(serverOut, 'utility.css'), '--minify'], { cwd: root, stdio: 'inherit' });

function adaptC4(code, relativePath) {
  if (relativePath === 'browser/src/game/index.ts') return code.replace("export * from './game-online-2p'", '/* Online upstream server deliberately excluded from this offline build. */');
  if (relativePath === 'browser/src/app.ts') {
    code = code.replace(/  const searchParams = new URLSearchParams\(location.search\)\n  const connectionMatchId = searchParams.get\('matchId'\)/, '  const connectionMatchId = null');
    code = replaceRequired(code, "let chosenMode: string = connectionMatchId ? 'online-human' : 'offline-ai'", "let chosenMode: string = 'offline-ai'", 'offline-only initial mode');
    code = code.replace(/    if \(connectionMatchId\) \{[\s\S]*?\} else if \(chosenMode === 'offline-human'\) \{/, "    if (chosenMode === 'offline-human') {");
    code = code.replace(/ else if \(chosenMode === 'online-human'\) \{[\s\S]*?\} else if \(chosenMode === 'ai-vs-ai'\)/g, " else if (chosenMode === 'ai-vs-ai')");
  }
  if (relativePath === 'browser/src/board/index.ts') {
    code = replaceRequired(code, `if (window.innerWidth < 640) {
      BoardBase.SCALE = 0.5
    } else {
      BoardBase.SCALE = 1.0
    }`, 'BoardBase.SCALE = Math.min(1, Math.max(0.25, (window.innerWidth - 16) / 640))', 'fluid board dimensions');
  }
  if (relativePath === 'browser/src/game/game-local.ts') {
    code = `const escapeLabel = (label: string) => label.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))\n${code}`;
    code = replaceRequired(code, 'message += `${winnerPlayer.label} ${winnerPlayer.boardPiece} won`', 'message += `${escapeLabel(winnerPlayer.label)} ${winnerPlayer.boardPiece} won`', 'escape local player name in winner markup');
  }
  // Translate the original interface text without altering turns/AI/rules.
  code = code.replaceAll("First player's name:", '红方名字：').replaceAll("Second player's name:", '蓝方名字：').replaceAll("Player's name:", '玩家名字：');
  code = code.replaceAll('Wating for move', '等待落子').replaceAll('Dropping ', '正在落子：').replaceAll('Game over', '本局结束');
  code = code.replaceAll('<h1>Thank you for playing.</h1>', '<h1>本局结束</h1>').replaceAll("It's a draw", '双方平局').replaceAll(' won', ' 获胜');
  code = code.replaceAll('.<br />After dismissing this message, click the board to reset game.', '。<br />关闭提示后，点击棋盘开始新的一局。');
  code = code.replaceAll('AI Player 1', 'AI 红方').replaceAll('AI Player 2', 'AI 蓝方').replaceAll('AI Player', '电脑').replaceAll('Player 1', '红方').replaceAll('Player 2', '蓝方');
  return code;
}
const c4Plugin = {
  name: 'connect-four-reviewed-offline-adapter',
  setup(builder) {
    builder.onResolve({ filter: /^@kenrick95\/c4$/ }, () => ({ path: path.join(c4Root, 'core/src/lib.ts') }));
    builder.onLoad({ filter: /\.ts$/ }, async ({ path: inputPath }) => {
      if (!inputPath.startsWith(c4Root + path.sep)) return;
      return { contents: adaptC4(await read(inputPath), path.relative(c4Root, inputPath).split(path.sep).join('/')), loader: 'ts' };
    });
  },
};
await build({
  entryPoints: [path.join(c4Root, 'browser/src/app.ts')], outfile: path.join(c4Out, 'game.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true,
  charset: 'utf8', legalComments: 'none', plugins: [c4Plugin],
  banner: { js: '/*! Connect Four — Kenrick, MIT. Upstream 35b1d25fcc05961b91153fd6c2c09f01f1c32cc9. Original offline game; see /licenses/c4-MIT.txt. */' },
});
let c4Html = await read(path.join(c4Root, 'browser/index.html'));
c4Html = c4Html.replace(/^\uFEFF/, '').replace('lang="en"', 'lang="zh-CN"');
c4Html = c4Html.replace(/<link rel="canonical"[^>]*>/g, '').replace(/<meta property="og:url"[^>]*>/g, '');
c4Html = c4Html.replace(/<li>(?:(?!<li>)[\s\S])*?value="online-human"[\s\S]*?<\/li>/, '');
c4Html = c4Html.replace(/<p>\s*For a more detailed explanation[\s\S]*?<\/p>/, '');
c4Html = c4Html.replace(/<footer class="footer">[\s\S]*?<\/footer>/, '<footer class="footer">原版 Connect Four · Kenrick · MIT<br />仅本小窗会话；人机、同屏双人和 AI 观战，不含联网房间或本站排行榜。</footer>');
c4Html = c4Html.replaceAll('href="/logo.svg"', 'href="logo.svg"').replaceAll('src="/logo.svg"', 'src="logo.svg"');
c4Html = c4Html.replace('<head>', `<head>\n${securityMeta}\n<script src="../bridge.js"></script>\n<link rel="stylesheet" href="game.css" />\n<link rel="stylesheet" href="adaptation.css" />`);
c4Html = c4Html.replaceAll('or with other human offline or online!', 'or with another player on this device.');
c4Html = c4Html.replace('Offline: Human player vs AI player', '人机练习：与原版 AI 对弈').replace('Offline: Human player vs human player', '同屏双人：轮流在这台设备落子').replace('Spectator: AI player vs AI player', 'AI 观战：观察双方对弈');
c4Html = c4Html.replace('How to play?', '游戏规则').replace('Game Settings', '开始一局').replace('Playing Mode:', '玩法：').replace('Start game', '开始对弈').replace('End game', '返回玩法').replace('Thank you for playing.', '本局结束');
c4Html = c4Html.replace('Connect Four is a two-player game.', '双方轮流落子，在 7 列、6 行的棋盘上率先连成四子的一方获胜。');
c4Html = c4Html.replace(/Taking turn, each player drops[\s\S]*?that column\./, '点击任意一列，棋子会落在该列最低的空位。每次只能放入一枚棋子，不能落在已满的一列。');
c4Html = c4Html.replace(/The first player to form[\s\S]*?the game is a draw\./, '横向、纵向或斜向连续四子均为胜利；棋盘填满仍无人获胜，则为平局。人机模式使用原版 AI；同屏双人模式由两人在这台设备上轮流操作。');
c4Html = c4Html.replaceAll("Player's name:", '玩家名字：').replaceAll('Player 1', '红方').replaceAll('Player 2', '蓝方');
c4Html = c4Html.replaceAll('c4 - Connect Four', '四子连线 · Connect Four').replace('>OK<', '>确定<');
c4Html = c4Html.replace(/(class="game-settings-player-[12]-name-input")/g, '$1 maxlength="40"');
c4Html = c4Html.replace('<script type="module" src="./src/app.ts"></script>', '<script src="bootstrap.js"></script>\n<script src="game.js"></script>');
await fs.writeFile(path.join(c4Out, 'index.html'), normalizeGeneratedHtml(c4Html));
await fs.writeFile(path.join(c4Out, 'bootstrap.js'), await read(path.join(root, 'third_party/connect-four/adapters/bootstrap.js')));
await fs.writeFile(path.join(c4Out, 'adaptation.css'), await read(path.join(root, 'third_party/connect-four/adapters/adaptation.css')));
await fs.writeFile(path.join(c4Out, 'logo.svg'), await read(path.join(c4Root, 'browser/public/logo.svg')));

for (const [output, sourceSha, sourceUrl] of [
  [serverOut, '01796362d3b7bfa6c85efab5e2685f4d955dc137', 'https://github.com/pshenok/server-survival'],
  [c4Out, '35b1d25fcc05961b91153fd6c2c09f01f1c32cc9', 'https://github.com/kenrick95/c4'],
]) {
  const artifacts = {};
  for (const file of (await fs.readdir(output)).filter(file => file !== 'provenance.json').sort()) {
    const bytes = await fs.readFile(path.join(output, file));
    artifacts[file] = { bytes: bytes.length, sha256: digest(bytes) };
  }
  await fs.writeFile(path.join(output, 'provenance.json'), `${JSON.stringify({ sourceUrl, sourceSha, license: 'MIT', toolchain: { esbuild: '0.25.12', tailwindcss: '3.4.17' }, network: 'none', persistence: 'iframe-session-only', audio: 'disabled', artifacts }, null, 2)}\n`);
}
console.log('Rebuilt pinned Server Survival + Connect Four as offline classic-script artifacts.');
