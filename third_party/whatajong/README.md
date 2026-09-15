# Whatajong 独立自托管原版改编

- 官方源：https://github.com/masylum/whatajong
- 固定提交：`45fe3da7a7d1e87a66ae41b72ee74cc4e0a920d5`，MIT，Copyright (c) 2025 Pao Ramon <pao.ramen@proton.me>。完整原许可在本目录 LICENSE、发行 LICENSE.txt 和 public/licenses/whatajong-MIT.txt。
- 2026-09-15 改编。保留原版麻将牌对消、整套特殊牌效果、全部 24 轮挑战/不同难度、商店/构筑、关卡结算与再开局；不是自造简版。独立 Solid/TypeScript 程序，不并入主站 React bundle；原 Electron 壳不需要。
- 发行目录：`packages/frontend/public/games/local-lab/whatajong/`；完整修改后 Web 首选源码、固定 web-only package.json/完整 package-lock.json/Vite 配置和原图形在该目录 source/。SOURCE.md 给出重编译说明；RUNTIME_LICENSES.json 和 THIRD_PARTY_NOTICES.txt 收集实际非零输出运行模块的许可证，另含使用并改编的 @solidjs/router。原主站依赖/锁未改。
- 排除全部音乐、音效、字体、字体 CSS/预加载和强制旋转图形。Brave Gates 的字体元信息指向 Din Studio（独立商业授权），不能误用仓库 MIT 覆盖；音频未有逐曲独立授权证据，全部不发行/不调用。换系统字体、静音，不买素材。
- 保留 94 个伴随 WebP 图形（牌、背景、纹理、特效）。授权依据是固定仓库明确整体 MIT 声明，未发现这些图形的相反许可或第三方品牌声明；不是逐图作者认证。逐文件 SHA-256/字节数及准确依据在 ASSET_MANIFEST.json。原缺失 texture 0 不造新素材，以 none 避免 url(undefined)。
- 移除 PostHog 初始化、事件/局数据外传；观测和音频调用保留为空适配。存储读写及 JSON 恢复 try/catch，沙盒拒绝时仅当前内存，不伪造永久保存。设置页注明静音而非无效音量控制。
- 原 @solidjs/router 0.15.1 的 MemoryRouter 适用于静态隔离小窗，保留原游戏内部路由；在随附 MIT 可读 router/lifecycle.js 捕获被 opaque origin 拒绝的原生 history 深度写。preload=false；不占用桥 nonce 的 URL hash，不跳转主站地址。
- bridge.js 先于 game.js，经典 IIFE 不使用 ESM/CORS；CSS 暂停动画配合桥的冻结计时。所有图片数据内联，CSP 允许 data/blob 图像但 connect-src 'none'、script-src 'self'，无新后台、账号/余额、付费、站内积分或排行榜接入。

## 重编译

在一个独立临时目录复制发行 source/ 全部内容，不要在主站 workspace 执行 install。Node 24.20.0 / npm 11.19.0 编译验收（固定锁依赖；不使用 Electron）：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

构建产生 web-dist/game.js、web-dist/webfish-whatajong-static-build.css、bundle-modules.json。固定 build 自动运行 source/postprocess.mjs，以随附 source/local.css 拼接生成 web-dist/game.css；JS/CSS 清除行尾空格/Tab、EOF 固定一个 LF 换行，并仅规范化 CSS 规则拼接处的 LF（不改声明/数据图像），直接复制 web-dist/game.js 与 web-dist/game.css 可字节重现，无需手工拼接。tileBody SVG 模板一处行尾空格清除，不改路径坐标。ASSET_MANIFEST.json 的 build.outputs 给出最终发行字节/哈希。game.js 为未压缩可读 IIFE。编译器固定 babel-preset-solid 1.9.3 / jsx-dom-expressions 0.39.6 与原版 Solid 1.9.4 匹配，避免最新编译器生成原运行时没有的 API。运行模块清单按 Rollup renderedLength>0 输出，不把只安装但未发行的包声称为运行依赖。

牌面按钮新增 role/可见牌类型数字与唯一编号、准确 disabled/tabindex 和键盘焦点样式；Enter/空格共用原选择，按住/重复及鼠标合成 click 不重复执行。原 isFree/动画以及已删/暂停/结束禁点均检查，受限牌不公开隐藏类型或配对答案；不改匹配/商店，也不新增作弊接口。完整适配源码在 source/src/renderer/components/game/tileInteraction.ts 与 TileComponent。

所有运行包的 MIT/Apache 文本与原 Kobalte NOTICE（含 Adobe Apache、ICU/Unicode、ECMA BSD 及其他嵌入 MIT 代码的署名）完整保留；不将这款游戏简单称为“全包只有一个 MIT 许可”。
