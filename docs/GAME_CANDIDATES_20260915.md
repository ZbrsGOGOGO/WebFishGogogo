# 小游戏候选评估 · 2026-09-15

状态：仅候选评估，未接入、未上线。依据前面的“完成后看看，先不做”，本次先记录新增足球房间意向和改造建议，尚未实施。本文不增加大厅计数、不恢复暂停的掌心 AI 工作，也不构成发布记录。

核验方式为官方 GitHub 源码、配置、目录和许可文本的只读检查；未执行这些候选源码，未安装依赖，未复制游戏代码到本站，未操作真实玩家或生产。玩法完整性、手机/GPU表现及网络安全仍须后续实测，不能冒充已验收。

## 固定来源与候选优先级

- [sausi-7/games](https://github.com/sausi-7/games/tree/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465)，固定 `c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465`，[MIT](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/LICENSE)。源码为 AI 生成游戏探索集合，主许可声明不等于每段音乐、图片或品牌权利的独立作者认证；不得整包搬入或把 README 的数量、分类和“完整可玩”营销文字当验收结论。
- [kunjgit/GameZone](https://github.com/kunjgit/GameZone/tree/ac4ce207868a6dfef11073435234311d91dfac99)，固定 `ac4ce207868a6dfef11073435234311d91dfac99`，[根 Apache-2.0](https://github.com/kunjgit/GameZone/blob/ac4ce207868a6dfef11073435234311d91dfac99/LICENSE)。下列三个游戏子目录均未见独立 LICENSE/NOTICE/COPYING，且保留不同原作者或第三方来源；不能把根许可视为全部素材、移植代码和音乐的充分授权凭证。

| 优先级 | 候选与实际源码 | 当前实际玩法/技术 | 接入前必须处理 |
| --- | --- | --- | --- |
| 优先评估联机 | [Football](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/sports/football/index.html) | 纯 Canvas/JS，一个玩家对 AI；默认60秒进球赛，人物/球/球场均纯绘制，无房间或网络同步 | 静音排除来源未证实的两段 MP3；保留 MIT/版权；重新做服务器权威同步、失焦输入和重复踢球保护，品牌名称须审阅 |
| 优先单机 | [Line Trap](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/puzzle/line-trap/index.html) | 约7KB、纯 Canvas；指针画线，线存在2秒，挡住8个敌人保护核心；是短局，不是多关卡战役 | 核对画布容器/DPR/触控，暂停时冻结 Date/RAF；修复遍历中多次 splice 的碰撞删除风险、按帧移动与资源释放 |
| 次优单机 | [Stack Tower 3D](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/3d/stack-tower/index.html) | Three `0.152.2`，移动块落下后裁切重叠；[配置目标为10层](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/3d/stack-tower/config.json)，不是无限楼层 | 原 Three r152 系列需固定合法离线版本及完整许可，不换引擎冒称原版；移除无来源 MP3；重玩恢复 baseSpeed、取消旧延时、释放 geometry/material/renderer/RAF，适配占位 Next |
| 备选，先核资产 | [Swipe Assassin](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/arcade/swipe-assassin/index.html) | 6×6格、三敌固定单关，滑动从背后击杀；不是键盘版完整多关游戏，Next 只弹占位提示 | [角色 PNG、Outfit字体及音频配置](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/arcade/swipe-assassin/config.json)未注明独立来源，不能原样打包；需许可核验/明确替换，再补键盘、生命周期和如实关卡说明 |
| 待许可，玩法优先 | [Packabunchas/game.js](https://github.com/kunjgit/GameZone/blob/ac4ce207868a6dfef11073435234311d91dfac99/Games/Packabunchas/game.js) | Mattia Fortunati 的 js13k 拼块救援，五模式，拖放和旋转；纯 Canvas/JS，比普通拼图更有策略 | 先核原作者授权及嵌入的 ZzFX/ZzFXM 版本、版权/许可和曲目数据；处理 opaque iframe 不可用 localStorage、默认音频、全屏能力和大竖屏画布 |
| 待许可，低调解谜 | [Short_Circuit/shortcircuit.js](https://github.com/kunjgit/GameZone/blob/ac4ce207868a6dfef11073435234311d91dfac99/Games/Short_Circuit/shortcircuit.js) | Vincent Le Quang 的纯 Canvas 电路推箱；13张地图中含标题场景，不能宣称13个独立可玩关卡；目录两 PNG 在所查运行源码中未引用 | 先核原作者许可，不发行未使用/未核素材；默认合成声须静音，400px选项弹层须窄屏适配，Esc/菜单焦点与父小窗退出冲突须解决 |
| 待许可，后备 | [Cable_Maze/main.js](https://github.com/kunjgit/GameZone/blob/ac4ce207868a6dfef11073435234311d91dfac99/Games/Cable_Maze/main.js) | LAN线缆迷宫，4阶段，限制时间和线长，后两阶段反向输入；只有方向键 | [原 rezaxdi/cablemaze](https://github.com/rezaxdi/cablemaze)许可链尚需完整核验；超时/最终阶段须严格锁输入，进度条 width 必须带 px，补触控、重玩与暂停时钟 |

以上与本站 [现有大厅定义](../packages/frontend/src/features/games/rooms/CommunityGamesPage.tsx)和[六款本地精选](../packages/frontend/src/features/games/local-lab/local-games.ts)进行入口对比，未发现同一候选原版已经接入；现有21+6共27个入口并不是27款彼此完全不同的玩法。叠塔不是工位塔防、Line Trap不是纸上突围，不能按名字相似错误去重或重复导入。最终新增数量须依据实际路由和体验核验。

## 足球：确切来源、保留原体验与房间提议

[用户引用站](https://sausi-7.github.io/games/#play=football)经[registry](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/registry.json)指向 `games/sports/football/index.html`。本次实际抓取的线上 HTML 与固定提交原文件字节哈希相同：`ff4357e415176d817b26f36c84bac8ddf3859d53d87e73512cb2ce96f287d08c`，不是另找一款同名足球替代。

现有源码是960×540逻辑画布、系统字体、纯绘制人物与场地；键盘方向键/A、D移动，向上/W跳跃，空格踢球，手机已有四按钮。HTML为29,677字节，[配置](https://github.com/sausi-7/games/blob/c97ef8bec4a4ce3154b4345a79aeda3ea2a6a465/games/sports/football/config.json)677字节；含两 MP3 共604,631字节，去掉音频约30KB。字节数不是性能或手机实测。代码具备开局、进球、结算和重玩；进球停1.5秒，平局现显示失败。只 fetch 本地配置，没有 WebSocket、账号、联网房间或服务端判球；Next 只是向父页发消息，不是完整下一关实现。

建议首期（均为提议，尚未实现）：

- 1–2席：一人对 AI、两人红蓝1v1，先保留原人物/场景/球运动，再考虑4人2v2，不直接强塞4–8人改变手感。
- 房间列表可直接加入；房主可选密码，无邀请码。默认60秒，可选120/180秒；平局明确显示平局，时间/比分由服务器裁决。
- 使用固定步长的服务器权威物理、AI、进球和倒计时；客户端仅传验证过的操作序号/输入，用插值及必要的预测纠正显示。不可让客户端上报位置、比分或胜负作为权威。
- 断线短暂等待后 AI 接替原席，重连接管原状态，不重置比分、时间、球或角色；加入/重连仍须检查账号会话、房间身份、密码尝试和限流。API重启的临时房恢复须另立范围，不能承诺现有基础设施已支持。
- 原源码的人类踢球未沿用 AI 的冷却判定、键盘 repeat 可重复踢球，且没有 blur 清输入；按客户端帧率截断 dt 的计时也不适合联机。必须补真实延迟、重复/乱序输入、收起、切号、双窗口、断线/注销回归。
- 首期不接办公币、正式排行或网站成就。静态单机继续沿用现有 `sandbox=allow-scripts`、opaque来源和 `connect-src 'none'`；真房间应独立设计本站认证游戏连接与页面，不得为方便而给全部实验室开放外联或传入账号令牌。

## 统一接入前门槛

1. 逐款固定源码与资源清单，保留真实作者、主许可、第三方版权及修改说明；素材无授权证据先不发包。Sausi的 MIT 要保留许可及版权，README所谓“署名不必”不能覆盖许可证条件。Three r152官方[MIT文本](https://github.com/mrdoob/three.js/blob/r152/LICENSE)供核对；实际离线库仍须锁定原版本/字节和随附声明。
2. GameZone三款先回溯原作者及引用库，不把根 Apache-2.0等同整包授权。Packabunchas中的实际 ZzFX/ZzFXM 版本和数据应比对[ZzFX官方来源](https://github.com/KilledByAPixel/ZzFX)、[ZzFXM官方来源](https://github.com/keithclark/ZzFXM)；这不是对嵌入版本已许可完毕的声明。
3. GameZone页面中的 FontAwesome CDN和外站主页按钮默认排除；若保留离线图标/字体，须分别核验对应版本的代码、图标和字体许可。所查源码未见 telemetry，不等于运行安全认证、全部依赖扫描或零外链保证。
4. 单机改成本站自托管实际原版而非外站 iframe；CSS/脚本/配置适配现有静态 CSP，不用 inline/eval/外站 CDN。opaque iframe 的 localStorage失败必须安全降级为本轮内存，不伪造存档；默认静音，暂停/继续/结束和资源释放必须真实生效。
5. 实施须另有授权并按具体范围验收：320/390/桌面布局与实际键鼠/触控、原规则/关卡、长局、重玩、失焦/隐藏、会话切换、内存/GPU释放、许可和静态资源审计。未经这些检查，不称“完整多关”“手机完全支持”或“已上线”。

现有已接入六款的事实与重编译流程见 [LOCAL_GAME_LAB.md](LOCAL_GAME_LAB.md)；本文仅提供下一批选择依据，不替代来源归档、实现任务或发布报告。
