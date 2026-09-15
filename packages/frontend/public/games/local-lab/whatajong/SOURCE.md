# Whatajong 原版 Web 改编来源与重编译

Copyright (c) 2025 Pao Ramon <pao.ramen@proton.me>。原 [MIT 许可](LICENSE.txt) 及无担保声明完整保留。2026-09-15 本站静音/隔离适配，原版完整玩法而非简版仿制。

固定源：https://github.com/masylum/whatajong/tree/45fe3da7a7d1e87a66ae41b72ee74cc4e0a920d5

发行的 [game.js](game.js) 为经典未压缩 IIFE；[game.css](game.css) 为生成样式加 [local.css](local.css)。完整修改后 Web 首选源码在 source/：

- [入口](source/src/renderer/index.tsx)、[内存路由与 provider 布局](source/src/renderer/components/layout.tsx)、[原核心牌/规则](source/src/renderer/lib/game.ts)、[原商店](source/src/renderer/routes/run/runShop.tsx)、[状态](source/src/renderer/state/runState.tsx)。
- [package.json](source/package.json)、[完整 package-lock.json](source/package-lock.json)、[web.vite.config.mjs](source/web.vite.config.mjs)、[tsconfig.json](source/tsconfig.json)、[tsconfig.web.json](source/tsconfig.web.json)；整个 source/ 按同样目录复制到独立临时目录后运行 `npm ci --ignore-scripts --no-audit --no-fund` 和 `npm run build`。不需要 Electron，不安装到主站，不运行包安装脚本。
- 产物在 web-dist/；固定 build 脚本自动运行 [postprocess.mjs](source/postprocess.mjs)，将生成 CSS 与 [随附 local.css](source/local.css) 顺序拼接为 game.css，并规范化 JS/CSS 行尾空格/Tab 和 EOF 为单一 LF 换行；仅 CSS 的规则拼接边界固定 LF，以消除插件偶发的连接换行差异，不修改声明或数据图像。直接使用 web-dist/game.js 与 web-dist/game.css 即可字节重现，不再手工拼接。运行时模块的 [实际清单](source/bundle-modules.json)、[版本/许可索引](RUNTIME_LICENSES.json)、[完整第三方署名/许可证](THIRD_PARTY_NOTICES.txt)，含独立随附 @solidjs/router MIT 与原 Kobalte NOTICE、嵌入 Apache/Unicode/ECMA 条款。
- 保留图形及 SHA-256：[ASSET_MANIFEST.json](ASSET_MANIFEST.json)。94 个伴随 WebP 基于固定仓库整体 MIT 声明保留，未见反向声明；并非逐图作者认证。source/src/renderer/assets/ 含所有这些原图形。

排除全部字体（包括独立商业 Brave Gates）、全部音轨/SFX、旋转门禁图片，不发行、不调用。用系统字体和静音，设置页如实说明。去除 PostHog/外传，localStorage/JSON 恢复权限或数据错误均捕获；仅当前窗口内存存档，关闭/跳页后结束，不上传到站内排行榜，不读取账号/办公币。

保留全部 24 轮、对消与特殊牌、原商店构筑、关卡目标/结算、难度与触控/键盘。采用原版已有 MemoryRouter，禁止原生 history 深度写时捕获而非抛错；游戏内部入口由内存处理，不改桥 hash。去除强制旋转门禁，让原响应式棋盘可在低调小窗使用。原 missing texture 0 改为 none 而非伪造贴图。tileBody.tsx 的 SVG 模板仅清除一处行尾空格，路径坐标与规则不变；固定源提交及图形字节未变。

牌面可访问性：[tileInteraction.ts](source/src/renderer/components/game/tileInteraction.ts) 与原 TileComponent 给可操作牌添加按钮语义、可见类型/数字和唯一编号、准确 aria-disabled/tabindex 及 focus-visible。Enter/空格、指针和辅助技术共用原 onSelect，重复/按住事件不重复执行。原 isFree、动画禁点以及已删/暂停/结束判定均生效；受限牌只报不可选与编号，不暴露隐藏底牌、配对答案或额外作弊接口。匹配、关卡和商店规则不变。

父级 [bridge.js](../bridge.js) 先加载，默认暂停，父窗明确继续后才推进；所有游戏图像为数据内联，無字体/音频外链、ESM 或 eval，connect-src 'none'。许可证/来源文字中的官方 URL 是署名说明，不是自动联网。

小窗内的版权/内存存档提示放在原 Settings 页面正常流中，不覆盖游戏 Points/Coins/Moves；说明文字不在沙盒内跳转文档。完整源码、素材和依赖许可证由父页面的操作、存档与来源说明打开。
