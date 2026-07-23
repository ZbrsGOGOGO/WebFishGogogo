# 摸鱼阅读器 · WebFishGogogo（Stealth Reader）

> 一个「伪装成 CSDN 风格技术博客」的**个人自有内容**阅读器。用户上传并阅读**自己合法拥有**的文本文档，阅读界面伪装成技术博客文章页，融入办公环境。
>
> **合规基线：本项目仅面向用户自有、合法拥有的内容，明确排除盗版小说分发、赌博/博彩及任何违法玩法。**

---

## 目录

- [1. 项目简介](#1-项目简介)
- [2. 参考来源（灵感站点）](#2-参考来源灵感站点)
- [3. 技术栈](#3-技术栈)
- [4. 项目结构](#4-项目结构)
- [5. 版本规划（V1 / V2 / V3）](#5-版本规划v1--v2--v3)
- [6. 开发进度跟踪](#6-开发进度跟踪)
- [7. 整体设计](#7-整体设计)
- [8. 本地运行（预览）](#8-本地运行预览)
- [9. 文档索引](#9-文档索引)

---

## 1. 项目简介

| 项 | 内容 |
|---|---|
| 项目名 | 摸鱼阅读器 / WebFishGogogo / Stealth Reader |
| 代码仓库 | https://github.com/ZbrsGOGOGO/WebFishGogogo |
| 形态 | 自托管 Web 应用（前后端分离 + Monorepo） |
| 核心价值 | 把自有文本渲染成「技术博客文章页」，办公场景低调阅读 |
| 目标规模 | 1–2k 活跃 / 同时在线 |
| 当前阶段 | **V1（上线审核版）功能已完成**，UI 设计与工具真实交互待补 |

---

## 2. 参考来源（灵感站点）

本项目的产品形态灵感来自以下站点，**仅作交互与产品设计参考，不复制其内容与非法功能**：

| 参考项 | 地址 / 说明 |
|---|---|
| 灵感站点 | `https://www.duanwuqiufenmao.top/` |
| 参考的产品点 | CSDN 风格伪装阅读界面、文档库、老板键、摸鱼小工具（下班倒计时等）、便签 |
| **明确不参考/不实现** | 该站的盗版小说分发、赌博类玩法（乐斗/梭哈）、非法聊天导流 |
| 视觉风格参考 | CSDN 技术博客文章页布局（阅读量/点赞/收藏/标签/专栏等元数据样式） |

> 说明：参考站点自述为「办公室摸鱼神器」，其内容与玩法存在版权与合规问题。本项目只借鉴**合法的产品交互思路**（伪装阅读体验 + 摸鱼工具），全部内容改为用户自有、合规。

---

## 3. 技术栈

### 3.1 当前技术栈（已落地）

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite 5 | SPA |
| 前端路由 | React Router v6 | 公开页 + 受保护路由 |
| 前端状态 | Zustand | 轻量状态（认证 token/user） |
| 后端 | NestJS 10 + TypeScript | REST API |
| ORM | TypeORM 0.3 | 实体 + 迁移 |
| 数据库 | PostgreSQL | 元数据/索引/用户数据（正文不入库） |
| 对象存储 | S3 兼容（AWS SDK v3 / MinIO） | 文档正文按章节存放 |
| 鉴权 | JWT（@nestjs/jwt）+ bcrypt | 加盐哈希密码 |
| 测试 | Jest（后端）/ Vitest（前端）/ fast-check（属性测试） | 173 个测试 |
| 本地开发 | pg-mem（内存 Postgres）+ 本地文件存储 | 零安装预览，`LOCAL_DEV=true` |
| 工程 | npm workspaces（Monorepo） | shared / backend / frontend 三包 |

### 3.2 计划技术栈（规划中 / 待引入）

| 方向 | 计划技术 | 归属版本 | 说明 |
|---|---|---|---|
| UI 设计体系 | Tailwind CSS 或组件库（待定） | 待排期 | 当前页面为裸 HTML，缺统一视觉设计 |
| 工具真实交互 | 纯前端小组件（计算器/JSON/正则/倒计时等） | 待排期 | 目前工具页只做「目录+推荐+启动接口」 |
| 更多文档格式 | epub.js / pdf.js | V2 | epub/pdf 解析 |
| 缓存/会话 | Redis（ioredis） | V2/上线 | 会话、热点章节、假元数据缓存 |
| 部署 | Docker / docker-compose、Nginx、PgBouncer、CDN | 上线阶段 | 容量与部署规划见 design.md |
| 支付/会员 | 合规支付渠道（待定） | V3 | 会员订阅分层 |

---

## 4. 项目结构

```text
WebFishGogogo/
├─ packages/
│  ├─ shared/                 # 前后端共享 TS 类型与常量
│  ├─ backend/                # NestJS API
│  │  └─ src/
│  │     ├─ modules/
│  │     │  ├─ auth/          # 认证（注册/登录/JWT 守卫）
│  │     │  ├─ documents/     # 【文档存储】上传/解析/库管理 + 存储适配器
│  │     │  ├─ reading/       # 【阅读引擎】分页/进度/书签/目录/视图组装
│  │     │  ├─ skin/          # 【伪装皮肤】假元数据/CSDN 模板
│  │     │  ├─ memo/          # 便签（自动保存）
│  │     │  ├─ preferences/   # 用户偏好（皮肤/字号/老板键/职业）
│  │     │  └─ tools/         # 工具页（职业化推荐 + 目录）
│  │     ├─ database/         # 实体、迁移、pg-mem 本地数据源
│  │     └─ config/           # 数据库/存储/JWT 配置
│  └─ frontend/               # React + Vite SPA
│     └─ src/
│        ├─ app/              # 路由、Provider、受保护布局、状态
│        ├─ api/              # 按领域拆分的 API 客户端
│        ├─ features/         # library / reader / skins / memo / tools / auth / compliance
│        ├─ components/       # 通用组件（页脚、合规声明）
│        └─ hooks/            # useAutoSave / useDebouncedCallback 等
├─ .kiro/specs/stealth-reader/  # 需求 / 设计 / 任务规格文档
│  ├─ requirements.md         # EARS 需求（分 V1/V2/V3）
│  ├─ design.md               # 架构/建表/时序/接口/正确性属性
│  └─ tasks.md                # 实现任务清单 + 依赖图
├─ docs/                      # 项目跟踪文档（见第 9 节）
├─ README.md                  # 本文件：项目总览
├─ package.json               # workspace 根
└─ tsconfig.base.json
```

---

## 5. 版本规划（V1 / V2 / V3）

| 版本 | 主题 | 目标 | 交付重点 | 归属需求 |
|---|---|---|---|---|
| **V1 上线审核版** | 可上线、合规、可审核 | 满足应用/站点审核的最小合规可用产品 | 账户认证、文档库、CSDN 伪装阅读、阅读控制、进度自动保存、章节目录/书签、老板键、便签、假元数据一致性、访问隔离、合规基础页、工具页与职业化推荐 | Req 1–14 |
| **V2 内容丰富版** | 丰富内容与阅读体验 | 扩展格式、皮肤与文档管理 | epub/pdf、多皮肤/模板管理、富文档库（分类/标签/收藏/阅读历史）、更多摸鱼小工具、增强搜索、跨设备同步与导入导出 | Req 15–20 |
| **V3 玩法/引流/变现版** | 合法玩法与增长变现 | 合法会员、引流与游戏化 | 会员/订阅分层、分享与邀请推荐、成就/连续打卡/等级、社区/精选内容区、可选广告位（**排除赌博/博彩/盗版/违法**） | Req 21–25 |

> 详细验收标准见 `.kiro/specs/stealth-reader/requirements.md`。

---

## 6. 开发进度跟踪

> 详细可勾选进度见 `docs/PROGRESS.md`；这里是概览。

| 模块 / 阶段 | 版本 | 状态 |
|---|---|---|
| Monorepo 脚手架 + 共享类型 | V1 | ✅ 完成 |
| 数据库建表 + 迁移（10 表）+ 工具种子 | V1 | ✅ 完成 |
| 认证（注册/登录/JWT 守卫） | V1 | ✅ 完成 |
| 文档存储（上传/解析/分章/库管理） | V1 | ✅ 完成 |
| 阅读引擎（分页/进度/书签/目录/视图组装） | V1 | ✅ 完成 |
| 伪装皮肤（假元数据/CSDN 模板） | V1 | ✅ 完成 |
| 便签自动保存 | V1 | ✅ 完成 |
| 用户偏好（含职业持久化） | V1 | ✅ 完成 |
| 工具页（职业化推荐 + 目录） | V1 | ✅ 完成（后端+前端骨架） |
| 合规页（隐私/条款/备案页脚/自有声明） | V1 | ✅ 完成 |
| 前端各页面接入 + 全链路 checkpoint | V1 | ✅ 完成（173 测试通过） |
| **统一 UI 设计** | 待排期 | ⛔ 未开始（当前为裸 HTML） |
| **工具真实交互实现** | 待排期 | ⛔ 未开始（仅目录+推荐+启动接口） |
| V2 全部 | V2 | ⬜ 未开始（高层规划） |
| V3 全部 | V3 | ⬜ 未开始（高层规划） |

**图例**：✅ 完成 · 🚧 进行中 · ⬜ 未开始 · ⛔ 已知缺口（不在原 spec 内，需新增）

---

## 7. 整体设计

完整设计见 `.kiro/specs/stealth-reader/design.md`，涵盖：

- **架构**：前后端分离，无状态 NestJS 多实例 + PostgreSQL + Redis + 对象存储 + CDN。
- **三层解耦**：伪装皮肤层 / 阅读引擎层 / 文档存储层，可独立演进。
- **数据模型**：10 张表（users、documents、chapters、reading_progress、bookmarks、memos、fake_meta、user_preferences、tools、tool_professions）。正文存对象存储，元数据入库。
- **正确性属性**：9 条可用于属性测试（fast-check）的不变量（分章完整性、分页边界/可遍历性、假元数据幂等、进度幂等、访问隔离、职业推荐可靠性等）。
- **容量与部署规划**：针对 1–2k 在线规模的服务器/存储/CDN/连接池起步规格与发版路线。

---

## 8. 本地运行（预览）

无需安装 PostgreSQL —— 本地开发模式用 pg-mem（内存 Postgres）+ 本地文件存储。

```bash
# 安装依赖（首次）
npm install

# 构建 shared 包
npm run build:shared

# 启动后端（本地开发模式，端口 3000）
cd packages/backend
npm run build
LOCAL_DEV=true JWT_SECRET=local-dev-secret node dist/main.js

# 另开一个终端，启动前端（端口 5173）
npm run dev --workspace @stealth-reader/frontend
```

- 前端预览：`http://localhost:5173/`
- 后端 API：`http://localhost:3000/api`
- 首次使用先在 `/register` 注册账号（无预置账号）。
- 注意：本地模式数据存内存，后端重启即清空。生产走真实 PostgreSQL + 对象存储。

---

## 9. 文档索引

| 文档 | 位置 | 内容 |
|---|---|---|
| 项目总览 | `README.md` | 本文件 |
| 进度跟踪 | `docs/PROGRESS.md` | 逐项可勾选进度 + 已知缺口 + 后续计划 |
| 需求文档 | `.kiro/specs/stealth-reader/requirements.md` | EARS 需求，分 V1/V2/V3 |
| 设计文档 | `.kiro/specs/stealth-reader/design.md` | 架构/建表/时序/接口/正确性属性/部署 |
| 任务清单 | `.kiro/specs/stealth-reader/tasks.md` | 实现任务 + 依赖图 |
