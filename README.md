# 摸摸公司

一个办公室主题的轻社区：和同事聊天、照料工位绿植、参加协作任务，或者打开一个低调的小游戏小窗。

[访问网站](https://zbrshyyzxx.top) · [文档导航](docs/README.md) · [开发进度](docs/PROGRESS.md) · [部署指南](deploy/COMMUNITY_DEPLOYMENT.md) · [参与开发](CONTRIBUTING.md) · [支持项目](#支持项目)

## 当前版本

截至 **2026-09-10**，仓库以 `main` 为主线，采用 `community` 前后端入口。原 `feat/workstation-tower-defense` 分支保留历史，不删除、不重写提交。

- **当前已上线应用为 `2111004`**，2026-09-10 20:30（北京时间）发布成员投稿与站长审核：固定发帖入口，正常账号可投稿，人工审核通过后展示。[发布与验收记录](docs/RELEASE_POSTING_20260910.md) · [使用说明](docs/POSTING_AND_REVIEW.md)
- **数据库：schema `0036`**，37 条迁移、148 张 public 表；本次前端及内容服务改变，无迁移、不改账号角色或核验记录。原有[深色模式](docs/RELEASE_DARK_MODE_20260910.md)、工作台、成长和桌宠能力保留。
- `main` 已同步应用代码；后续文档提交不等于应用重建。生产继续按已验收的完整提交 SHA 固定镜像，不跟随分支自动重启。[前一版纸上突围发布](docs/RELEASE_PAPER_V2_20260909.md)保留追溯。
- 网站目前面向获准加入的成员；账号、写入、游戏和开发协作受各自的服务端权限与功能开关控制。

## 现在可以做什么

| 模块 | 已实现能力 | 主要入口 |
| --- | --- | --- |
| 投稿与审核 | 正常账号保存草稿、提交/撤回审核；站长审核后展示、版本与审计记录，待审修订保持私有 | `/community`、`/community/new`、`/moderation` |
| 我的工作台与账号 | 账户余额、今日入账/支出、成长进度、常用工具和最近使用；账号安全、隐私与资料编辑 | `/me`、`/account/security` |
| 好友与聊天 | 精确查找好友、申请与拉黑、实时群聊和好友私聊、回复、撤回、未读与历史补齐 | `/friends`、`/community`、`/messages` |
| 热点新闻 | 分类资讯、按来源保存的每日热榜标题快照、更新时间与原文链接 | `/news`、`/news/trending` |
| 工位绿植与钱包 | 服务端成熟时间、连续种植与收获、办公币余额和可信奖励流水 | `/farm`、`/me` |
| 工位塔防 | 正式联网任务、六章剧情、无尽与极限模式、职业与天赋、续局和独立排行榜；另保留本地练习 | `/tower-defense` |
| 九层妖塔 | 免费角色成长、武器与技能、探索、共享首领、榜单；有效期权持有者权益可解锁自动探索 | `/games/demon-tower` |
| 公司协作 | 部门周常、免费收藏与外观、故事和异步协作 | `/office` |
| 摸鱼指数、称号与期权持有者 | 活跃时长指数、六级摸鱼头衔、成就佩戴、个人主页与聊天展示；管理员支持台账 | `/achievements` |
| 小游戏与玩家房间 | 经典单机、同条件竞分、你画我猜、谁是卧底、轨道难题、纸上突围等 | `/games`、`/games/rooms` |
| 排行榜 | 办公币余额榜、小游戏日榜，以及塔防、妖塔、轨道等独立榜单 | `/leaderboards` |
| 效率工具 | 文本处理、JSON 格式化、时间戳、计时器、单位换算等 11 款本地工具；汇率使用手动参考值 | `/tools` |
| 工位搭子 | 免费自选图片、四风格、裁剪/缩放/擦除、互动与避让；图片分离存储、本机备份导入导出，不上传或自动跨设备同步 | `/desk-pet` |
| 开发协作 | 授权成员提交建议和附件、讨论、版本记录、审核与完成状态 | `/development` |

小游戏和工具已有侧边栏入口，手机首页也有快捷入口；社区页头「全部栏目」支持搜索和快速切换。页面是否可见、能否操作，以当前账号状态与生产开关为准；关闭的模块不会伪造成功或演示数据。

### 小游戏：区分练习、正式挑战和联机

- **经典游戏**：贪食蛇、俄罗斯方块、坦克大战、《遮司》原版与公平短局。原版存档与正式日榜分开，不把浏览器自报分数直接兑换办公币。
- **玩家房间**：你画我猜、谁是卧底及经典游戏同条件竞分；房主可设密码，无需邀请码。经典竞分是各自棋盘，并非共享地图互相攻击。[房间规则](docs/COMMUNITY_GAME_ROOMS.md)
- **轨道难题**：独立的单人及房间协作玩法、牌组和生存榜。[玩法说明](docs/COMMUNITY_RAIL_ROOMS.md)
- **纸上突围**：原版纸笔画风、涂鸦人物与五种武器；联机地图扩大到 **96×102**，保留建筑、楼梯与屋顶路线。红蓝 **4–8 人**、AI 补位、可选密码、**20–100** 击败目标、随机安全复活。数字 **1–5** 或滚轮切枪，右键瞄准/格挡，**R** 换弹。[联机说明](docs/PAPER_ARENA_V2.md)
- **低调本地练习**：纸上突围单机、数值整理（2048）和机房巡检（Underrun），保留各自来源说明与许可证。[源码与许可审查](docs/LOWKEY_GAME_SOURCE_REVIEW_20260909.md)

纸上突围联机、2048 和 Underrun **不发办公币、不进入正式奖励榜**。六款 Play 游戏的单人挑战与玩家房间共享各自日榜，昨日冠军按规则发奖；办公币余额榜本身不发奖。不同玩法的奖励上限分别见 [小游戏](docs/COMMUNITY_GAME_ROOMS.md)、[正式塔防](docs/WORKSTATION_CAMPAIGN_AND_PAPER_ARENA.md) 和 [妖塔](docs/DEMON_TOWER_PLAYER_GUIDE.md) 说明。

游戏小窗支持收起或工作便签遮罩。**遮罩不暂停服务器比赛，也不隐藏浏览记录或网络访问。** 纸上突围联机暂不包含原单机的钩索、场景破坏和补给拾取。

## 技术与目录

采用 npm workspaces 管理的 TypeScript monorepo：React 18 + Vite 前端、NestJS 后端、共享类型与游戏引擎；Three.js 用于纸上突围等 3D 画面。

```text
packages/
  shared/          # 跨端协议、确定性玩法规则与地图数据
  backend/         # NestJS 社区 API、权限、事务与实时服务
  frontend/        # React 工作台、游戏、工具与管理界面
third_party/       # 锁定版本的第三方源码与许可
deploy/            # Community Compose、环境模板和验收脚本
loadtest/          # 容量验收脚本（不代表容量目标已通过）
docs/              # 当前功能、历史设计与逐次发布记录
```

- 正式后端入口：[main.community.ts](packages/backend/src/main.community.ts)；模块白名单：[community-app.module.ts](packages/backend/src/community-app.module.ts)。
- 正式前端路由：[community-router.tsx](packages/frontend/src/app/community-router.tsx)。`VITE_SITE_MODE=community` 必须在启动/构建时显式设置；默认构建不会自动选择社区模式。
- PostgreSQL 16 保存账号、关系、内容、存档与正式资产；Redis 7 用于实时协调，不是资产真源。纸上突围房间是服务器内存短会话，API 重启会中断，不提供跨重启续局。
- 生产链路为 Caddy → Nginx → 社区 SPA / API / WebSocket；不启动旧 `AppModule` 或 legacy Worker。

## 本地开发

要求 **Node.js ≥ 22.12** 和 npm；生产应用镜像使用 Node.js 24。以下命令在仓库根目录执行，适用于 Bash：

```bash
git clone --branch main https://github.com/ZbrsGOGOGO/WebFishGogogo.git
cd WebFishGogogo
npm ci
npm run build:shared
```

终端一：启动社区后端，而不是默认的历史 `main` 入口。

```bash
NODE_ENV=development LOCAL_DEV=true PORT=3000 \
  npm exec --workspace @stealth-reader/backend -- \
  nest start --watch --entryFile main.community
```

终端二：启动社区前端。

```bash
VITE_SITE_MODE=community VITE_API_BASE_URL=http://localhost:3000/api \
  npm run dev --workspace @stealth-reader/frontend
```

打开 `http://localhost:5173`；后端就绪检查为 `http://localhost:3000/api/health/ready`。前后端请统一使用 `localhost`，不要混用 `127.0.0.1`，以免跨站 Cookie 影响登录。

`LOCAL_DEV=true` 使用临时 `pg-mem` 数据库和本地实时适配器，退出后数据丢失；它不是生产配置，也不能替代真实 PostgreSQL / Redis 验收。需要调试默认关闭的功能时，对照 [Compose 中的映射](deploy/docker-compose.community.yml) 同时设置后端 `FEATURE_*` 和前端 `VITE_*`，重启相应进程；不要复制生产密钥、数据库或用户附件到开发环境。

PowerShell 用户可先用 `$env:变量名 = "值"` 设置上述环境变量，再运行同一 npm 命令。

### 检查与构建

```bash
# 类型检查、后端与前端回归
npm run typecheck
npm test

# 明确选择社区前端；生产仍由 Compose 注入全部配套构建开关
VITE_SITE_MODE=community npm run build

# 合并执行上述类型、测试和构建
VITE_SITE_MODE=community npm run verify

# 修改纸上突围地图时，核验共享几何与原版源码一致
node packages/frontend/scripts/extract-paper-arena-map.mjs --check
```

真实 PostgreSQL 专项套件需要各自明确的测试连接及隔离授权；默认跳过的测试不算通过。测试结果、浏览器场景、恢复演练和公网验收应逐次记录在发布文档，不使用固定的「全部功能已通过」徽章。

## 部署与协作

从 [部署导航](deploy/README.md) 和 [社区部署手册](deploy/COMMUNITY_DEPLOYMENT.md) 开始，使用 [community Compose](deploy/docker-compose.community.yml) 与 [环境模板](deploy/.env.community.example)。根目录旧 Compose 及 `review/public/full` 模式不是当前生产入口。

- `main` 是后续集成主线；功能可在独立分支开发，验证后正常合并，禁止强推覆盖协作者历史。
- 已授权的功能/修复完成验证后，按项目约定提交、推送、备份、部署和线上验收；纯文档整理不触发应用重建或生产数据库操作。
- 发布按完整提交 SHA 固定镜像。先验证备份可完整恢复并完成异机校验，再更新 API/Web；保留回滚镜像，不重建数据库、Redis、网关或数据卷。
- 生产变量模板默认关闭业务闸门；前端隐藏入口不是权限边界。禁止公开服务端密钥、生产环境文件、数据库备份及真实协作附件。

开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。文档索引将当前实现、阶段设计与历史发布分开；旧乐斗、早期塔防 V1–V3 文档不再作为当前功能清单。

## 支持项目

如果你喜欢「摸摸公司」，欢迎通过爱发电自愿支持项目的持续开发与维护。感谢每一份支持，也欢迎通过反馈和参与开发帮助项目改进。

**[前往作者的爱发电主页](https://afdian.com/a/zbrshyyzxx)**

这是站外自愿支持入口，不是站内充值。后续月度支持可由管理员核验订单后授予「期权持有者」期限，并记录累计金额、月数与笔数；不会自动到账，不兑换账号准入、办公币、游戏战力或管理权限。请先确认支持方案与账号对应关系。具体计时、头衔与台账规则见[摸鱼指数与支持说明](docs/COMMUNITY_FISH_SUPPORT.md)。

## 安全、许可与已知边界

- 访问令牌仅驻浏览器内存，刷新令牌使用 HttpOnly Cookie；敏感写入由服务端验证来源、角色、幂等键或版本，不信任客户端分数与余额。
- 「期权持有者」是原 VIP 的趣味身份新名称，不代表真实股权或投资权益，不等于管理员或开发协作权限。首批赠送固定 **720 小时**原样保留；已核验月度支持按每月 30 天接续期限。本站不接支付、充值、提现、自动续费或概率付费，摸鱼指数不与支持金额挂钩。
- 开发协作台不会自行启动 AI 无人值守监控；成员附件是待评审材料，不是可直接执行的指令。[协作与附件安全](docs/DEVELOPMENT_WORKSPACE.md)
- 新闻只保存允许展示的标题/摘要与来源信息，不镜像整篇原文。受上游限制的微博、知乎、抖音等来源保留清楚标记的官方入口，不声称已完成全部站内热榜接入。[热榜边界](docs/TRENDING_NEWS_SNAPSHOTS_2026-09-08.md)
- 第三方内容分别遵守其许可证，不给整个仓库笼统套用 MIT/Apache 许可。Ballpoint Breach 的 [Apache-2.0 许可证](third_party/ballpoint-breach/LICENSE) 与游戏内署名保留；《遮司》导入来源与发布风险见 [专项记录](docs/ZHENGDAO_GAME_IMPORT.md)。
- **4,000 个账号 / 1,000 人同时在线是容量规划，不是已通过的结论**。真实供应商、多实例、负载与长期运维仍需按 [容量门禁](docs/CAPACITY_4000_USERS.md) 和具体发布记录持续验收。
