# ZBRS 技术工具工坊

ZBRS 技术工具工坊当前主线是一个以办公室职业为背景的轻社区。社区围绕首页、热点新闻、经验交流、工位绿植、乐斗、投喂、邀请、我的主页和好友九个系统展开；原有实用工具与浏览器本地单机游戏继续保留，但不作为社区服务端资产真源。

> 合规边界：平台不提供盗版内容分发、赌博或博彩、充值提现、概率付费、现金返佣，也不复制第三方产品的名称、角色、素材、剧情、技能文案或数值体系。用户内容、新闻摘要、社交关系和游戏结算都必须经过各自的发布与治理边界。

## 九个用户系统

| 系统 | 产品范围 | 发布约束 |
|---|---|---|
| 首页 | 游客查看公开入口；登录用户查看来自真实接口的摘要卡，每张卡只保留一个主行动 | 未开放模块显示真实不可用状态，不填充演示数据 |
| 热点新闻 | 展示来源、短摘要、发布时间和 HTTPS 原文链接，支持职业/主题偏好和“不感兴趣”反馈 | 公开资讯、个性化和编辑发布台使用独立闸门；不镜像整篇原文 |
| 经验交流 | 帖子、问答、最多两层评论、收藏、关注、采纳、举报，以及六个固定职业聊天室 | 内容发布、审核台和聊天室分别受控；普通用户权限由服务端校验 |
| 工位绿植 | 单株工位绿植，一键开始、收获并继续，按服务端时间计算离线进度 | 好友鼓励只提供轻量反馈，不改变资产结算 |
| 乐斗 | 程序员、产品经理、测试、销售、人力资源五职业，六个装备槽，办公室主题的自动战斗 | 游客仅本机试玩；正式胜负、掉落、体力和装备变化只认服务端结算 |
| 投喂 | 给好友发送轻量鼓励并查看真实额度与记录 | 无交易、提现和概率付费；写请求使用幂等键 |
| 邀请 | Beta 准入码与推荐码明确分离，展示奖励封顶进度和归因结果 | 不承诺无限奖励；准入、推荐和奖励均由服务端判定 |
| 我的主页 | 资料、职业、头像、简介、隐私、通知、账号安全、公开主页 | 敏感账号状态和社交实名信息不公开 |
| 好友 | 精确 publicId 搜索、申请、同意/拒绝/取消、删除、拉黑/解除 | 禁止通过邮箱或手机号探测用户 |

“代码中存在页面或接口”不等于“生产已经开放”。生产部署模板默认关闭注册、写入、内容、审核、聊天室、新闻后台、服务端乐斗等发布闸门；只有依赖、供应商、数据迁移和安全验收完成后才应逐项开启。关闭状态下页面必须给出真实空态、受限态或不可用态，不能伪造数据和成功结果。

## 当前社区能力

当前代码主线已经覆盖：

- Beta 注册、邮箱验证、登录、刷新、会话查看、单会话退出和全部退出。
- access token 仅驻浏览器内存，refresh token 使用 HttpOnly Cookie；刷新轮换、并发单飞和写请求不自动重放。
- `guest`、`pending_email`、`active`、`suspended`、`banned`、`deleting` 及 onboarding 的路由和服务端状态分流。
- 密码重置、社交实名、账号申诉和账号删除流程，并使用独立功能闸门控制上线。
- 九系统页面、通知中心、内容治理、固定聊天室、新闻编辑台和办公室乐斗正式档案。
- 举报、拉黑、隐私裁剪、软删除与恢复、版本冲突、审核审计和角色权限校验。
- 原有工具页与浏览器本地单机游戏；它们不会把客户端分数直接写成社区正式资产。

以下项目仍是发布前验收项，不能标记为已通过：

- 在目标 Linux 环境使用真实 PostgreSQL 16 完成迁移、回滚、备份和恢复演练。
- 使用真实 Redis 完成多实例广播、在线档位、故障恢复和写入 fail-closed 验证。
- 接入并验收真实邮件、社交实名、内容/聊天审核等 HTTPS 供应商。
- 验证持久化卷、密钥轮换、监控告警、日志脱敏和一键回滚。
- 对登录、内容、关系、通知、聊天室 WebSocket、重连和依赖故障做混合负载测试。

规划容量是约 4,000 个账号、1,000 人同时在线。这是容量目标，不是当前已通过的结论；真实 PostgreSQL、Redis、供应商链路和 1,000 并发必须在发布环境按容量门禁重新验收。

## 社区隔离架构

社区后端使用独立入口 [`packages/backend/src/main.community.ts`](packages/backend/src/main.community.ts)，只装配社区允许的模块。它不会启动旧 `AppModule`，也不会把历史文档、阅读、旧农场、旧竞技场或其他 legacy API 暴露为社区接口。

```text
Browser
  │ HTTPS / WSS
  ▼
Caddy（TLS 与入口）
  ├── Nginx ── React community SPA
  ├── NestJS main.community API
  └── /ws/chat ── 原生 WebSocket
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 PostgreSQL 16            Redis 7
 业务与审计真源       广播、在线状态与短期协调
```

PostgreSQL 是账号、关系、内容、通知、新闻、绿植和乐斗正式资产的持久化真源。Redis 不是资产真源；Redis 不可用时，允许从 PostgreSQL 读取可安全提供的历史数据，但依赖实时协调的写入必须 fail-closed。

社区启动链路不加载 legacy Worker。历史 Worker 的 `processed` 语义不适合社区多消费者投影，不能当作社区架构继续使用。需要异步可靠性的社区流程使用各自的安全机制：例如认证邮件使用加密 Outbox 泵，账号删除使用数据库租约。

工具和浏览器本地单机游戏仍作为独立公开能力保留。游客乐斗存档也只保存在本机，绝不自动导入登录后的正式档案或装备资产。

## 账号安全与治理基线

- 账号、关系、奖励、内容状态和游戏资产以服务端事务结果为准。
- 写请求使用幂等键或 `expectedVersion`；401 后不自动重放非幂等写操作。
- 公开资料按隐私设置、关系状态和账号状态裁剪，拉黑关系双向生效。
- 内容严格区分 `publicationStatus`、`moderationStatus`、`deletedAt` 和 `version`，不把不同生命周期合并成一个“状态”。
- moderator/admin 能力必须由服务端角色守卫执行；隐藏前端链接不构成授权。
- 聊天 WebSocket 通过 60 秒单次 ticket 认证，token 不进入 URL；发送失败不会显示为已送达。
- 聊天室支持慢速、只读、关闭、撤回、举报、断档补齐和受限 @ 候选，不能通过提及功能探测邮箱或手机号。
- 新闻公开 DTO 只展示合规摘要、来源、时间和原文链接，不暴露采集证据、后台凭据或整篇正文。
- 社交实名状态不代表公开身份；身份信息不得展示在个人主页，生产必须使用真实 HTTPS 核验供应商。

## 发布闸门

生产变量模板见 [`deploy/.env.community.example`](deploy/.env.community.example)。模板中的发布闸门默认均为 `false`：

| 范围 | 服务端闸门 |
|---|---|
| 注册与账号安全 | `FEATURE_REGISTRATION_ENABLED`、`FEATURE_PASSWORD_RESET_ENABLED`、`FEATURE_SOCIAL_VERIFICATION_ENABLED`、`FEATURE_ACCOUNT_DELETION_ENABLED` |
| 社区关系与轻养成写入 | `FEATURE_COMMUNITY_WRITES_ENABLED` |
| 帖子与治理 | `FEATURE_COMMUNITY_CONTENT_ENABLED`、`FEATURE_COMMUNITY_CONTENT_WRITES_ENABLED`、`FEATURE_COMMUNITY_MODERATION_ENABLED` |
| 固定聊天室 | `FEATURE_COMMUNITY_CHAT_ENABLED`、`FEATURE_COMMUNITY_CHAT_WRITES_ENABLED` |
| 热点新闻 | `FEATURE_COMMUNITY_NEWS_ENABLED`、`FEATURE_NEWS_ADMIN_ENABLED` |
| 正式乐斗档案 | `FEATURE_COMMUNITY_BATTLE_ENABLED` |

前端有对应的 `VITE_COMMUNITY_*` 构建变量。生产 Compose 会把两侧闸门映射到同一发布决策；前端开关只控制入口和交互，不是安全边界。任何功能开放都必须同时满足服务端闸门、前端构建变量、数据库迁移、供应商和运维验收。

## 技术栈

| 层级 | 主要技术 |
|---|---|
| 前端 | React、TypeScript、Vite、React Router、Zustand、Vitest、Testing Library |
| 后端 | NestJS、TypeScript、TypeORM、原生 `ws`、Jest |
| 数据 | PostgreSQL 16、Redis 7 |
| 安全 | JWT、bcrypt、HttpOnly Cookie、幂等键、版本控制、服务端 RBAC |
| 测试 | 单元/集成测试、属性测试、`pg-mem` 本地数据库、k6 发布容量门禁 |
| 部署 | npm workspaces、Docker Compose、Nginx、Caddy |

仓库仍保留 review/public/full 等历史或展示模式，但社区开发与部署必须显式选择 `community` 入口，不能用旧模式替代。

## 目录

```text
packages/
  shared/                         # 跨端类型与合同
  backend/
    src/main.community.ts         # 社区唯一后端入口
    src/community-app.module.ts   # 社区模块白名单
    src/modules/auth/             # 认证、会话与账号安全
    src/modules/community/        # 关系、资料、邀请、投喂、绿植、通知、内容与治理
    src/modules/chat/             # 固定聊天室 REST / WebSocket
    src/modules/news/             # 热点新闻与编辑发布台
    src/modules/office-battle/    # 办公室乐斗正式结算
  frontend/
    src/main.tsx                  # Vite 入口；community 构建绑定隔离路由
    src/app/community-router.tsx  # 路由、守卫与功能开关
    src/api/                      # 社区 API 合同
    src/features/                 # 九系统及账号/治理界面
deploy/                           # 社区 Compose、环境模板与验收脚本
loadtest/k6/                      # 发布容量门禁
docs/                             # PRD、玩法、政策与容量设计
```

## 本地 community 开发

要求 Node.js 22.12 或更高版本；生产镜像使用 Node.js 24。首次安装依赖：

```powershell
npm ci
```

提交前统一验证命令：

```powershell
npm run verify
```

`npm run verify` 会依次执行全仓 TypeScript 检查、测试和构建。README 不记录容易过时的用例计数，以命令实际结果为准。

在第一个 PowerShell 终端启动隔离的社区后端：

```powershell
$env:LOCAL_DEV = "true"
$env:PORT = "3000"
npm exec --workspace @stealth-reader/backend -- nest start --watch --entryFile main.community
```

在第二个 PowerShell 终端启动 community 前端：

```powershell
$env:VITE_SITE_MODE = "community"
$env:VITE_API_BASE_URL = "http://localhost:3000/api"
npm run dev --workspace @stealth-reader/frontend
```

默认本地地址：

- 前端：`http://localhost:5173`
- API：`http://localhost:3000/api`
- 健康检查：`http://localhost:3000/api/health`
- 聊天 WebSocket：`ws://localhost:3000/ws/chat`

`LOCAL_DEV=true` 使用的 `pg-mem` 和本地实时总线只适合开发，进程重启后数据可能丢失，也不能证明 PostgreSQL/Redis 的生产行为。调试被关闭的模块时，应为后端 `FEATURE_*` 与前端 `VITE_COMMUNITY_*` 设置对应值后重启；准确映射以 [社区 Compose](deploy/docker-compose.community.yml) 为准。热点新闻等需要外部审核/采集保证的能力即使在本地也应保持 fail-closed，除非显式配置了开发适配器。

## 社区部署

生产部署从 [`deploy/COMMUNITY_DEPLOYMENT.md`](deploy/COMMUNITY_DEPLOYMENT.md) 开始，使用社区专用 Compose 和入口，不要启动旧 `main`、旧 Compose 或 legacy Worker。

发布流程相关文件：

- [生产变量模板](deploy/.env.community.example)
- [社区 Docker Compose](deploy/docker-compose.community.yml)
- [发布前静态检查](deploy/community-preflight.sh)
- [PostgreSQL 迁移演练](deploy/community-migration-rehearsal.sh)
- [部署后 smoke 检查](deploy/community-smoke.sh)
- [k6 容量门禁](loadtest/k6/community-capacity-gate.mjs)

只有预检、真实数据库迁移演练、备份恢复、供应商验收、smoke、监控和容量门禁全部通过，才应逐项开启生产功能闸门。

## 设计与运营文档

| 文档 | 用途 |
|---|---|
| [社区产品 PRD](docs/PRODUCT_PRD_V1.md) | 九系统范围、用户流程、状态与验收口径 |
| [办公室乐斗玩法规范](docs/OFFICE_BATTLE_GAMEPLAY_SPEC_V1.md) | 职业、装备、战斗结算与合规边界 |
| [热点新闻编辑政策](docs/NEWS_EDITORIAL_POLICY_V1.md) | 来源、摘要、纠错、反馈与发布规范 |
| [社区架构蓝图](docs/OFFICE_COMMUNITY_BLUEPRINT.md) | 模块边界、数据真源和演进路线 |
| [4,000 用户容量规划](docs/CAPACITY_4000_USERS.md) | 目标容量、观测指标和压测场景 |
| [社区部署手册](deploy/COMMUNITY_DEPLOYMENT.md) | 生产准备、迁移、发布、回滚和验收 |
