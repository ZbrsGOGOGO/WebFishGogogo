# 本地小游戏实验室

本文记录 2026-09-15 六款原版游戏的自托管接入、源码和使用边界，不是上线或全站验收记录。是否已在生产生效、实际发布版本与回滚依据，应以对应发布记录和线上实测为准；不表示其他游戏、协作反馈或玩家建房已全部完成。

## 入口与实际玩法

从 `/games` 游戏大厅的本地实验室进入。用户入口是 `/games/lab/<slug>`；实际静态文件在 `/games/local-lab/<slug>/index.html`。应使用前者运行游戏：静态页脱离合法父窗口时默认暂停，不是外站嵌入或独立联网入口。

| 游戏 / 入口 | 保留的原版玩法 | 操作与设备边界 |
| --- | --- | --- |
| 云架构守关 · Server Survival<br>`/games/lab/server-survival` | Three.js 云架构模拟：建服务、连接服务、处理流量；生存、25 关五章节战役和自由实验。保留 26 类服务、教程及游戏自身的本轮成就。 | 桌面优先，需要可用的 WebGL；触屏可选取、平移和缩放。先完成原版引导，小窗可放大。 |
| 麻将奇旅 · Whatajong<br>`/games/lab/whatajong` | 麻将牌配对消除与 Roguelike 构筑；保留全部 24 轮、特殊牌、难度、商店、目标和结算，不是普通麻将桌或简化对消。 | 鼠标 / 触屏；响应式牌面，移除原强制旋转门禁。更复杂的牌局和商店仍建议放大。 |
| 六角叠叠 · Hextris<br>`/games/lab/hextris` | 旋转六边形接住彩色条块，以同色三连、连击消除；保留波形和逐步升高的难度。 | 左右方向键，或点击 / 触碰画面左右两侧；反应消除游戏。 |
| 四子连线 · c4<br>`/games/lab/connect-four` | 原 7 列 × 6 行棋盘，横竖斜四连取胜；保留深度四 minimax / alpha-beta AI、人机、同屏双人和 AI 观战。 | 鼠标 / 触屏落子；流式棋盘和对话框适配小屏。同屏双人是在一台设备轮流操作，不是网站房间。 |
| 环域突围 · Radius Raid<br>`/games/lab/radius-raid` | 几何街机生存射击，保留 13 种敌人、5 种道具、升级分布、粒子和多层背景。 | 桌面键鼠限定：WASD / 方向键移动，鼠标瞄准射击，P 暂停，F 切换画面适配。没有伪装成完整手机操控。 |
| 星际开拓 · in ASCENT<br>`/games/lab/in-ascent` | 真正的太阳系探索与基地经营：地球基地、10 种建筑、5 种资源、探索 / 采矿 / 殖民任务和交易，不是跳跃或平台动作游戏。 | 点击星球与建筑；桌面或横屏触控并放大工作稿。原界面基于 1920 × 1080，不承诺 320px 竖屏舒适可玩。 |

固定目录和中文引导的唯一注册表是 [local-games.ts](../packages/frontend/src/features/games/local-lab/local-games.ts)。未知 slug 不会转换为任意 iframe URL。列表只描述这六款接入，不替代正式联网游戏目录。

## 小窗、暂停与进度

共同外壳是 [LocalLabPage.tsx](../packages/frontend/src/features/games/local-lab/LocalLabPage.tsx)：无需登录，按“打开工作稿”才加载当前游戏，不预载其他五款。可在小窗与放大模式切换、收起、继续或明确结束本轮。父页“操作、存档与来源说明”提供修改后首选源码和重编译入口，显式在新页查看，不让说明页替换正在运行的沙箱画面。

- [bridge.js](../packages/frontend/public/games/local-lab/bridge.js) 在游戏脚本之前加载，默认冻结。资源就绪且收到合法父窗口的明确恢复命令后才推进。
- 收起、失焦、页面隐藏、便签遮罩或另一个本地小窗取得前台会暂停；返回前台不会自行恢复，需要主动继续。画面内 Esc 由桥转换为便签遮罩操作。
- 暂停保留当前 iframe 和本轮，不另开局。桥冻结 `requestAnimationFrame`、函数计时器、`Date.now()` / 无参数 Date 构造和 `performance.now()`；恢复保留计时器剩余时长，避免将离开时间补算到游戏。CSS 关键帧动画也暂停。
- 结束本轮、刷新、离开游戏入口或切换会话会销毁本轮。加载 / 图形运行异常有局部错误和明确重试入口；重试重新创建实例，不声称已经保存旧进度。
- 不提供永久浏览器存档或云存档。原存储接口被改为内存，或在沙箱拒绝读写 / 数据恢复失败时安全降级；不能把权限拒绝当保存成功。Server Survival 的保存、战役星数、设置和游戏自身成就也仅属于当前 iframe 会话。

这里不上传成绩、不结算办公币、不进入正式每日奖励榜、不新增账号或权益授权。游戏内部的美元预算、矿产、商店和成就是各自的游戏数据，不是网站经济或网站成长收藏。全站通用活跃 / 成长规则保持原样；同屏双人、AI 对弈也不等于本站玩家建房。

## 隔离与联网边界

运行文件全部从本站静态目录加载；游戏逻辑不调用外站或本站业务接口。原联网房间、广告、遥测、分数外传、商业化、分享和不支持的文件导入导出入口已移除或禁用。源码 / 许可说明里的官方链接只有用户主动查看时才访问，不是游戏自动联网。

父页只授予 `sandbox="allow-scripts"`，不加 `allow-same-origin`、表单、弹窗、下载或顶层导航权限。子页是 opaque origin，不读取父 DOM、账号资料、Cookie 或办公币；不以放宽沙箱来提供存档。父子固定通道只交换就绪、错误、暂停、恢复和 Esc 等生命周期消息，绑定当前窗口、来源及随机 nonce，不传用户私有数据或成绩。

[Web 配置](../deploy/community.nginx.conf) 只允许这六个已审阅游戏文档被本站框架嵌入；站点外壳原有禁止嵌入规则保留。游戏文档 `connect-src 'none'`，静态脚本不需要 `unsafe-inline` 或 `unsafe-eval`；允许内联样式不等于允许内联脚本。缺失资源返回 404，不回退成 SPA HTML 冒充脚本。少数保留通用库有未用的网络方法，游戏不调用，连接 CSP 仍禁止它们联网。

这些是代码和配置边界，不是浏览器全功能验收结论。真实发行还需要检查沙箱 / CSP 加载、实际操作、失焦 / 隐藏冻结、恢复不跳时、关闭和会话切换；仅静态扫描或 VM 测试不能替代这些检查。

## 固定来源、修改源码与许可证

每款均固定到完整提交，不跟随第三方 main 自动拉取。归档上游可能仍含原联网 / 音频代码供审阅；发行适配版的实际行为以构建结果、修改后源码及静态审计为准。应继续保留原版权、无担保声明、素材依据和依赖许可证，不把整个游戏笼统归为一份仓库许可证。

- Server Survival：[原仓库](https://github.com/pshenok/server-survival)，`01796362d3b7bfa6c85efab5e2685f4d955dc137`。原作者 Kostyantyn Pshenychnyy，MIT。[上游源码与适配说明](../third_party/server-survival/README.md)、[主许可](../packages/frontend/public/licenses/server-survival-MIT.txt)、[Three r128 MIT](../packages/frontend/public/licenses/server-survival-three-r128-MIT.txt)、[Tailwind MIT](../packages/frontend/public/licenses/server-survival-tailwind-MIT.txt)、[产物哈希](../packages/frontend/public/games/local-lab/server-survival/provenance.json)。原场景 / 图标由代码生成，Three r128 单独本地发行，不替换主站 Three。五个原 MP3 和营销 GIF 不发行；不假定整体 MIT 足以证明这些音轨的独立来源。
- Whatajong：[原仓库](https://github.com/masylum/whatajong)，`45fe3da7a7d1e87a66ae41b72ee74cc4e0a920d5`。原作者 Pao Ramon，MIT。[适配说明](../third_party/whatajong/README.md)、[完整修改后 Web 源码及重编译](../packages/frontend/public/games/local-lab/whatajong/SOURCE.md)、[主许可](../packages/frontend/public/licenses/whatajong-MIT.txt)、[实际运行依赖索引](../packages/frontend/public/games/local-lab/whatajong/RUNTIME_LICENSES.json)、[完整第三方署名](../packages/frontend/public/games/local-lab/whatajong/THIRD_PARTY_NOTICES.txt)、[素材清单](../packages/frontend/public/games/local-lab/whatajong/ASSET_MANIFEST.json)。保留 94 个伴随 WebP 的依据是固定仓库整体 MIT 声明且未见相反许可，不是逐图作者认证。商业字体 Brave Gates、全部字体和音频均排除。依赖署名还含 Kobalte 嵌入的 Apache、Unicode、ECMA 等文本，不能只留主 MIT。
- Hextris：[原仓库](https://github.com/Hextris/hextris)，`3f4847dc8fd7dab3d1c87e6324b9159d92fbd396`。作者 Logan Engstrom、Garrett Finucane、Noah Moroze、Michael Yang，GPL-3.0-or-later。[适配说明](../third_party/hextris/README.md)、[完整修改后首选源码](../packages/frontend/public/games/local-lab/hextris/SOURCE.md)、[GPL 文本](../packages/frontend/public/licenses/hextris-GPL-3.0.txt)、[jQuery / Sizzle MIT](../packages/frontend/public/games/local-lab/hextris/vendor/jquery-MIT.txt)、[Keypress Apache-2.0](../packages/frontend/public/games/local-lab/hextris/vendor/keypress-Apache-2.0.txt)。作为独立程序发行可读源码和依赖来源，不并入主站 React bundle。保留四个按钮 SVG 的依据为固定仓库整体授权，未声称逐图作者认证；字体、音频、广告和外传已排除。
- c4：[原仓库](https://github.com/kenrick95/c4)，`35b1d25fcc05961b91153fd6c2c09f01f1c32cc9`。原作者 Kenrick，MIT。[原 TypeScript / core 与适配说明](../third_party/connect-four/README.md)、[主许可](../packages/frontend/public/licenses/c4-MIT.txt)、[产物哈希](../packages/frontend/public/games/local-lab/connect-four/provenance.json)。保留代码绘制的 Canvas 棋盘和原 SVG logo，无字体 / 音频资产；原 WebSocket 模块不进入执行 bundle。胜者名字转义、对话框显式关闭和小屏布局是本站安全 / UI 适配，不改 AI 或四连规则。
- Radius Raid：[原仓库](https://github.com/jackrugile/radius-raid)，`016cb866b6078672e37a1691bd9fe555364dbf58`。原作者 Jack Rugile，MIT。[来源与改动](../third_party/radius-raid/README.md)、[完整修改后源码](../packages/frontend/public/games/local-lab/radius-raid/)、[主许可](../packages/frontend/public/licenses/radius-raid-MIT.txt)。图形和像素字母由代码生成；音轨、Howler、外部站点按钮和原 Storage prototype 辅助代码不发行。保留无音频的链式调用适配，明确统计只存本轮；默认适配窗口，M 静音切换改为如实说明 F 画面适配。
- in ASCENT：[原仓库](https://github.com/foumart/JS.13kGames.2021_inAscent)，`a49ce66e81c0fd4e8c77ba511bbaa7ac09446b7c`。原作者 Noncho Savov，MIT。[来源与改动](../third_party/in-ascent/README.md)、[完整修改后源码](../packages/frontend/public/games/local-lab/in-ascent/)、[主许可](../packages/frontend/public/licenses/in-ascent-MIT.txt)。星球 / 星图 / 地形由代码生成，Unicode 图形使用系统 emoji，不发行 Twemoji 字体。音效和商业化 / PWA 加载器排除，原免费起始建筑状态保留；动态点击改为 CSP 安全的数据事件。交易检查实际支付库存防止扣负数，触控兼容与失焦输入清理不重置资源或时间。

公共 [bridge.js](../packages/frontend/public/games/local-lab/bridge.js) 为本站原创生命周期适配，单独以 [MIT](../packages/frontend/public/licenses/local-lab-bridge-MIT.txt) 授权，与 GPL 程序兼容；不改变六款核心各自的许可。

Radius Raid 约 132 KB、in ASCENT 约 74 KB 的可读发行源码体积均不包含公共 bridge，不是压缩下载、FPS 或 GPU 实测。in ASCENT 仍有原大型 Canvas 缓冲，按 RGBA 尺寸约 89 MiB，只是缓冲计算而非进程 / 显存测量；不能因为下载小就承诺低 GPU 成本。

## 重新编译两款策略 bundle

Server Survival 和 c4 的完整原源码、适配器及 [机械构建脚本](../scripts/build-local-lab-strategy.mjs) 已随仓库保留。普通前端构建只复制 `public/` 发行物，不在每次构建时安装第三方工具或拉取上游。需要修改这两款时，先检查工作树，编辑对应归档适配输入后重新生成；不要手改压缩产物代替可重建源码。

在仓库根目录使用独立临时工具目录，固定 `esbuild 0.25.12` 和 `tailwindcss 3.4.17`；不改主站 package / lock，不运行安装脚本：

```sh
set -eu
LOCAL_LAB_BUILD_TOOLS="$(mktemp -d /tmp/webfish-local-lab-build.XXXXXX)"
npm install --prefix "$LOCAL_LAB_BUILD_TOOLS" --ignore-scripts --save-exact --no-audit --no-fund esbuild@0.25.12 tailwindcss@3.4.17
LOCAL_LAB_BUILD_TOOLS="$LOCAL_LAB_BUILD_TOOLS" node scripts/build-local-lab-strategy.mjs
```

保留该临时目录的完整锁文件作为私有构建证据，后续重现优先使用该固定锁 `npm ci --ignore-scripts`，不将临时依赖目录提交主仓。首次安装是明确的工具下载步骤；构建脚本本身不下载，验证工具版本和本地 Three r128 哈希，并输出两款 `game.js`、本地样式 / 适配入口及 `provenance.json`。Three 必须使用已核验的本地 vendor，不用主站新版引擎偷偷替换。

Whatajong 不使用上述两款策略脚本：其 [SOURCE.md](../packages/frontend/public/games/local-lab/whatajong/SOURCE.md) 提供独立 Web 源码、固定 package / 完整 lock / Vite 配置。将完整 `source/` 复制到独立临时目录，执行 `npm ci --ignore-scripts --no-audit --no-fund` 与 `npm run build`，不使用 Electron 或主站 workspace 安装。产物 `web-dist/game.js` 是可读 IIFE，生成 CSS 后按“生成 CSS → local.css”的顺序组成发行 `game.css`，同步实际模块 / 许可索引；不要丢掉第三方署名。Hextris、Radius Raid、in ASCENT 的发行文件就是可读首选源码，不需要编译工具。

## 修改后的核验

至少运行本地实验室回归、前端类型检查和 community 构建，核对原玩法、许可、静态能力与产物清单：

```sh
npm run test --workspace @stealth-reader/frontend -- src/features/games/local-lab
npm run typecheck --workspace @stealth-reader/frontend
VITE_SITE_MODE=community npm run build --workspace @stealth-reader/frontend
git diff --check
```

再用真实浏览器测试六款入口、实际原版操作、匿名 / 会话切换、小窗 / 放大、失焦 / 隐藏、继续 / 结束，以及失败重试。不同设备须分别验收；桌面测试不能证明触控或小屏已完整通过。发布仍沿用项目已验证的备份、Web-only 切换与线上验收流程，不因静态游戏接入而新增迁移、重建数据库或改动奖励规则。本文不替代发布报告。
