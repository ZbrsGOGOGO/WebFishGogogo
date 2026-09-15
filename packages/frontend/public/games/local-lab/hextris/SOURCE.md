# Hextris 完整修改后源码（GPL-3.0-or-later）

Copyright (C) 2018 Logan Engstrom。作者另有 Garrett Finucane、Noah Moroze、Michael Yang。
本站于 2026-09-15 修改，程序无担保。完整 [GNU GPL v3 文本](LICENSE.md)，可按 GPL 第 3 版或后续版复制、修改、重新发行。

固定上游：https://github.com/Hextris/hextris/tree/3f4847dc8fd7dab3d1c87e6324b9159d92fbd396

这是正在运行程序的完整可读首选源码，不需要构建工具或付费服务；保存下列文件并保持相同相对目录即可重现。父级 [bridge.js](../bridge.js) 为单独 [MIT 授权](../../../licenses/local-lab-bridge-MIT.txt) 的本站生命周期适配，提供静态小窗暂停，不是账号或游戏后端；直接脱离父窗时默认暂停。所有游戏文件及 SHA-256 见 [ASSET_MANIFEST.json](ASSET_MANIFEST.json)。

- [index.html](index.html)、[storage.js](storage.js)、[style/style.css](style/style.css)。
- 核心：[Block.js](js/Block.js)、[Hex.js](js/Hex.js)、[Text.js](js/Text.js)、[checking.js](js/checking.js)、[comboTimer.js](js/comboTimer.js)、[initialization.js](js/initialization.js)、[input.js](js/input.js)、[main.js](js/main.js)、[math.js](js/math.js)、[render.js](js/render.js)、[save-state.js](js/save-state.js)、[update.js](js/update.js)、[view.js](js/view.js)、[wavegen.js](js/wavegen.js)。
- 图形：[帮助](images/btn_help.svg)、[暂停](images/btn_pause.svg)、[重新开始](images/btn_restart.svg)、[返回](images/btn_back.svg)。基于固定仓库整体 GPL 授权保留；未见反向声明，不声称逐图作者认证。
- 依赖：[jQuery 1.9.1 修改后可读源码](vendor/jquery-1.9.1.js)、[jQuery/Sizzle MIT](vendor/jquery-MIT.txt)、[Keypress 1.0.8 JS](vendor/keypress.js)、[Keypress 首选 CoffeeScript](vendor/keypress.coffee)、[Keypress Apache-2.0](vendor/keypress-Apache-2.0.txt)。

修改范围：移除广告、GA、分数外传、动态脚本、Cookie、未用库、商店/分享、所有字体与音频；系统字体及程序化箭头替换字体符号。localStorage 权限拒绝时捕获，不伪造永久保存。保留原规则、全部波形/升级、旋转、触控、键盘、暂停、重新开始。成绩只在本窗口内存，不提交站内榜单或办公币。jQuery 旧浏览器求值回退改为明确拒绝，游戏只使用 DOM/事件/动画方法；无 inline script、ESM、eval 或新付费依赖。

发行文本做了仅机械规范化：JS/CSS/CoffeeScript 行尾空格/Tab 清除、EOF 保留一个 LF 换行，view.js 的一处混合缩进改为 Tab。CoffeeScript 行首层级、规则、数值、素材字节不变。原固定源提交不变；ASSET_MANIFEST.json 记录规范化后实际发行字节与 SHA-256，而不是冒称原版字节。
