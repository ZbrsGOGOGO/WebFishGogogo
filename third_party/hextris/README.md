# Hextris 独立自托管原版改编

- 官方源：https://github.com/Hextris/hextris
- 固定源提交：`3f4847dc8fd7dab3d1c87e6324b9159d92fbd396`。
- 原作者：Logan Engstrom、Garrett Finucane、Noah Moroze、Michael Yang。原 README 声明 Copyright (C) 2018 Logan Engstrom、GPL-3.0-or-later、无担保；完整许可在本目录 LICENSE.md 和发行目录 LICENSE.md。
- 修改日期：2026-09-15。保留六边形旋转、三连消除、连击、全部原波形/难度增长、触控与键盘、暂停/重新开始；不是重写的简化仿制品。
- 完整可读、非混淆修改后首选源码随发行提供：`packages/frontend/public/games/local-lab/hextris/` 的 index.html、storage.js、14 个 js/*.js、style/style.css、4 个 images/btn_*.svg；不需编译。SOURCE.md 列出可直接下载的相对链接。这里是独立 GPL 程序，与主站通过暂停桥消息协作，不并入 React 应用 bundle。
- 删除：AdSense、两处 GA、`http://54.183.184.126/` 分数上传、`http://hextris.io/a.js` 动态广告、visited Cookie、社交/商店按钮及品牌图片；原非必要 Hammer、js-cookie、JSONfn、SweetAlert、rrssb 不发行。JSONfn 的函数反序列化改为 JSON，禁止 eval。
- 所有原字体/字体 CSS/音频排除。Canvas 正文用系统字体，箭头用原绘制坐标生成三角形而非 FontAwesome。保留的 4 个按钮 SVG 基于此固定仓库整体 GPL 许可声明，未见相反许可或第三方品牌；不是对每张图单独作者认证。
- 沙盒 localStorage getter/read/write 均 try/catch；明确不提供永久存档、不外传，不对接账号/站内排行榜/办公币。父窗桥先加载、默认暂停，暂停 CSS 配合冻结时钟。

## 必要第三方

- jQuery 1.9.1 + 随附 Sizzle，MIT。官方发行源 https://code.jquery.com/jquery-1.9.1.js；完整许可来自 https://github.com/jquery/jquery/blob/1.9.1/MIT-LICENSE.txt。发行的是可读源码（非原 minified）；移除 legacy new Function JSON fallback 和 globalEval 路径，标记修改日期。通用库中未使用的 Ajax 方法仍存在，但游戏不调用，child CSP connect-src 'none'、script-src 'self' 提供额外限制。
- Keypress 1.0.8，Apache-2.0。官方源 https://github.com/dmauro/Keypress/tree/1.0.8，锁定 `bf614b749cf5340293e5c2b61c2afe869034e690`。同时发行原可读 JS、首选 CoffeeScript 和完整 Apache 文本；不改其键盘处理。
- SVG、源码及依赖哈希见发行目录 ASSET_MANIFEST.json。许可证文件和来源页面中的 URL 为说明链接，不是游戏自动发出的网络请求。
