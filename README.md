# ZBRS 技术工具工坊

ZBRS 技术工具工坊是一个面向自有服务器部署的 Web 平台，由四个用户可见系统组成：

- **阅读**：上传并阅读用户自己合法拥有的文本文档，提供书架、章节、进度、书签、便签与技术博客风格阅读页。
- **工具**：办公、文本与开发者小工具，支持岗位偏好推荐和可直接使用的工具组件。
- **农场**：围绕土地、种子、种植、成熟与收获构成的轻量资源循环。
- **小游戏**：统一游戏入口，现有贪食蛇、俄罗斯方块、坦克大战、比大小、三数之和，以及服务端自动结算的“午休斗技场”。

四个系统共用账号、成长、精力、钱包、背包、签到和幂等奖励能力。共享底座属于平台内部能力，不是第五个前台系统。

> **合规边界：**阅读系统只处理用户自有、合法拥有的内容；项目不提供盗版内容分发、赌博/博彩、付费抽奖、虚拟资产提现或现金返佣，也不复制第三方游戏的名称、角色、图像、技能与文案。

## 当前状态

当前仓库已完成四系统重建与正式界面收口，可作为**单机首发候选版**运行。前端统一使用“ZBRS 技术工具工坊”品牌；阅读、工具、农场和六个小游戏入口均已接入同一账号与导航框架。

| 范围 | 状态 | 当前能力 |
|---|---|---|
| 阅读系统 | ✅ 已收口 | 文档上传/解析、书架、搜索、章节阅读、进度、书签、便签、阅读设置、工作模式与服务端可信阅读计时 |
| 工具系统 | ✅ 已收口 | 工具目录、搜索与分类，以及 12 款计算、时间、文本和开发者工具的真实交互 |
| 共享平台底座 | ✅ 本轮已实现 | 用户档案、等级/EXP、精力、钱包与流水、背包与流水、签到、每日任务、活动时间线与幂等奖励 |
| 农场 MVP | ✅ 已收口 | 土地选择、种子与水资源、种植、服务端成熟倒计时、收获、农场经验和确定性奖励 |
| 小游戏/竞技场 MVP | ✅ 已收口 | 5 款可直接游玩的单机小游戏，以及 Lv.3 解锁、三档 AI 对手、确定性战斗、战报、精力消耗与幂等奖励 |
| 跨系统成长闭环 | ✅ 本轮已实现 | 签到、有效阅读、农场收获和竞技场可信事件推进每日任务，支持领奖、最近活动与可靠异步处理 |
| 整体架构设计 | ✅ 本轮已完成 | 四系统边界、资产真源、事务/幂等、部署基线与后续演进路线 |
| 单机发布验收 | ✅ 已通过 | 前后端全量测试、三端 TypeScript 检查、生产构建与浏览器逐页/小游戏实玩验收 |
| 自有服务器部署配置 | 🚧 已安全收口、待实机验证 | Node 24 LTS、Nginx 安全版本、PostgreSQL、持久化文档卷、回环 HTTP 与受保护备份恢复 |

详细状态见 [`docs/PROGRESS.md`](docs/PROGRESS.md)，架构基线见 [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md)。

## 架构概览

当前采用**一个仓库、模块化单体、前后端分离**的结构：

```text
Browser
  │ HTTPS
  ▼
Nginx
├─ /           React SPA
└─ /api/*      NestJS API
                  │
                  ├─ PostgreSQL（账号、资产、任务、农场、战斗的唯一真源）
                  └─ 持久化文件卷（单机版文档正文；可切换 S3）

Worker ────────────────┘（消费事务外盒，投影任务进度与最近活动）
```

```text
packages/
├─ shared/                   前后端共享类型、契约与纯规则
├─ backend/
│  └─ src/modules/
│     ├─ auth/               认证与当前用户
│     ├─ documents/          文档上传、解析与存储
│     ├─ reading/            阅读视图、进度、书签与可信阅读会话
│     ├─ skin/               阅读伪装皮肤
│     ├─ memo/               便签
│     ├─ preferences/        阅读/UI/工具岗位偏好
│     ├─ tools/              工具目录与推荐
│     ├─ platform/           成长、精力、钱包、签到与奖励编排
│     ├─ tasks/              每日任务查询与幂等领奖
│     ├─ engagement/         可信活动与任务进度投影
│     ├─ outbox/             事务外盒与独立 Worker
│     ├─ farm/               农场 MVP
│     └─ games/arena/        竞技场 MVP 与确定性战斗引擎
└─ frontend/
   └─ src/features/
      ├─ library/ + reader/  阅读系统
      ├─ tools/              工具系统
      ├─ platform/           全局资产、每日任务与最近活动
      ├─ farm/               农场
      └─ games/              小游戏中心、5 款本地游戏与竞技场
```

关键原则：

- PostgreSQL 是 EXP、精力、货币、道具、作物和战斗结果的唯一真源。
- 农场和竞技场通过共享资产服务变更余额与背包，不直接绕过账本写表。
- 签到、种植、收获和战斗写操作使用幂等键，重复请求不会重复扣除或发奖。
- 可信业务事件与领域数据同事务写入 Outbox，独立 Worker 可重试且不会重复推进任务。
- 有效阅读由服务端按连续心跳和墙钟差值累计；页面隐藏、长时间无操作或工作模式开启时暂停，客户端不能自报时长。
- 作物成熟和战斗结算均以服务端数据为准，客户端不能提交奖励数值或对手属性。
- 纯前端小游戏成绩不直接产生平台资产，避免信任客户端自报分数。
- 工具推荐岗位与竞技场战斗职业是两个独立概念。

## 已实现与后续能力

单机首发候选版已经落地账号、资产、签到、可信阅读计时、农场、小游戏、竞技场，以及 `Tasks + Activity + Outbox + Worker` 的跨系统闭环。以下仍是**后续目标能力**：

- 更通用的任务条件、周期任务与运营配置；
- Redis 缓存、限流与队列（不会成为资产真源）；
- 更完整的监控、灰度发布与回滚自动化，以及目标服务器上的备份恢复演练。

这些目标不会阻塞当前四系统 MVP 的本地开发，但在开放更复杂的跨系统奖励或扩大流量前应优先完成。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite 5、React Router、Zustand |
| 后端 | NestJS 10、TypeScript、TypeORM 0.3 |
| 数据 | PostgreSQL、单机持久化文件卷（保留 S3 适配器） |
| 鉴权 | JWT、bcrypt |
| 测试 | Jest、Vitest、Testing Library、fast-check |
| 工程 | npm workspaces、Docker、Docker Compose、Nginx |
| 本地模式 | pg-mem + 本地文件存储（`LOCAL_DEV=true`） |

## 本地开发

要求使用仍处于官方支持期的 Node.js 22 或 24 LTS；生产镜像固定使用 Node.js 24 LTS。

```bash
npm ci
npm run build:shared
npm run typecheck
npm test
```

启动后端（PowerShell）：

```powershell
$env:LOCAL_DEV="true"
$env:JWT_SECRET="local-dev-secret-at-least-32-characters"
npm run start:dev --workspace @stealth-reader/backend
```

另开终端启动前端：

```bash
npm run dev --workspace @stealth-reader/frontend
```

- 前端：`http://localhost:5173/`
- 后端 API：`http://localhost:3000/api`
- 本地模式使用内存数据库，后端重启后数据会清空。

全量验证不在文档中固定测试数量，以仓库当前命令输出为准：

```bash
npm run typecheck
npm test
npm run build
```

最近一次完整发布门槛（2026-07-31）：

- 前端 44 个测试文件、224 项测试全部通过；
- 后端 32 个测试套件、199 项测试全部通过；
- shared、backend、frontend TypeScript 检查全部通过；
- shared、backend、frontend 生产构建全部通过；
- 首页、文档库、阅读页、工具、农场和 6 个游戏入口已完成浏览器验收，其中 5 款本地小游戏均完成实际操作验证。

## 自有服务器部署

仓库已加入单机首发配置，等待在目标服务器完成实机验证：

- 根目录 `Dockerfile`、`docker-compose.yml` 与 `.dockerignore`；
- `deploy/nginx.conf`；
- `deploy/.env.example`；
- `deploy/preflight.sh`、`deploy/backup.sh`、`deploy/restore.sh`；
- `deploy/README.md`。

配置面向 Nginx + API + Worker + PostgreSQL + 持久化文档卷的单机部署。默认入口只绑定 `127.0.0.1:8080`，必须由宿主机反向代理提供公网 HTTPS；仓库侧已经具备生产预检、数据库与正文一致性备份、归档校验及等待依赖就绪的受保护恢复。正式上线前仍需在用户服务器完成域名/TLS、防火墙、首次迁移、持久卷、异机备份和恢复冒烟验证。

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md) | 四系统整体架构、领域边界、数据模型、事务/幂等与演进路线 |
| [`docs/FARM_GAMEPLAY.md`](docs/FARM_GAMEPLAY.md) | 农场首发循环、作物数值、成长联动与单机边界 |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | 已实现、收口中与后续目标能力 |
| [`.kiro/specs/stealth-reader/requirements.md`](.kiro/specs/stealth-reader/requirements.md) | 原阅读器 V1–V3 需求基线 |
| [`.kiro/specs/stealth-reader/design.md`](.kiro/specs/stealth-reader/design.md) | 原阅读器详细设计 |
| [`deploy/README.md`](deploy/README.md) | 自有服务器 Docker 部署说明 |
