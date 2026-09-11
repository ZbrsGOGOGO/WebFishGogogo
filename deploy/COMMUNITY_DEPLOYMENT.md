# 社区版部署与维护

本文面向当前「摸摸公司」的 `community` 模式。**已运行站点更新、空站初始化、历史迁移是三种不同流程，不可混用。** 旧 `full`、`review`、`public` 模式见 [部署导航](README.md)。

## 1. 当前运行快照与本次文档整理

### 2026-09-11 11:44 已发布：妖塔经济与统一物资申领

当前应用 `34260773f613b540bb9fa4257b8112ccbc87d019`，北京时间 11:44:14 上线。灵石、定额申领、永久/临时丹、符文与收支集中四分类，保留原残魂来源和办公币。无生产迁移，schema36 / 37 迁移 / 148 表不变，只切 API/Web、环境仅 IMAGE_TAG；投稿/审核保留开启，基础服务完整容器身份不变。新鲜备份恢复及异机校验、8 组真实 PostgreSQL、最终 Firefox 8 组流程 / 23 张唯一截图和公网 25 项通过。[发布与回滚](../docs/RELEASE_ECONOMY_20260911.md)。

直接回滚 `2111004`：先停止新版 API 再暂停妖塔整体与自动探索，保留新经济 JSON、资产、帖子和审计；投稿/审核仍开启。不得回灌旧库、删除经济字段或重放本次协作授权。下面投稿发布及其回滚开关是历史，不是本轮回滚步骤。

### 2026-09-10 20:30 历史发布：成员投稿与站长审核

当前应用 `2111004be1cc407b95cc9859afc43ac8fb10ece5`，北京时间 20:30:17 上线。正常账号投稿、站长审核后展示；无数据库迁移，schema36 / 37 迁移 / 148 表不变。环境仅 IMAGE_TAG 与内容写入/审核两开关变化，其他配置和基础设施 ID 不变。zbrs 沿用已有 admin 角色，没有授予真实账号新权限或核验状态。备份恢复、最终镜像 6 组工作流 / 14 张截图与公网 25 项验收通过。[发布与回滚](../docs/RELEASE_POSTING_20260910.md)。

直接回滚 `49071c8`，使用本批旧环境关闭内容写入和审核，保留全部新增帖子与审计数据，仅切 API/Web；不回灌旧库或重放权限。下文为历史快照。

### 2026-09-10 18:40 历史发布：工作台深色模式

当前应用 `49071c8452e1749423d3b58c88c8c59677a54d03`，北京时间 18:40:30 上线。仅前端，新增浅/深/跟随系统主题、本机记忆和跨标签同步；schema36 / 37 迁移 / 148 表不变。新鲜备份恢复和异机校验、最终镜像 8 组浏览器 / 33 张截图、公网 20 项及 Chromium 系统主题/窄屏验收通过。只切 API/Web，环境仅 IMAGE_TAG，基础设施 ID 不变。[发布与回滚](../docs/RELEASE_DARK_MODE_20260910.md)。

直接回滚基线 `7dd04d2`，保留 schema36 与本机数据，旧客户端忽略主题偏好键即可。不执行迁移、旧库覆盖、赠送或权限重放。下文为历史快照。

### 2026-09-10 17:55 历史发布：工作台统一界面

当前应用 `7dd04d23a0e094e8e542d46bb54feb80a2d92eea`，北京时间 17:55:17 上线。本次仅前端，统一样式与栏目目录；schema36 / 37 迁移 / 148 表不变。新鲜备份恢复及异机校验、最终镜像 8 组浏览器 / 31 张截图和公网 19 项验收通过。仅切 API/Web，环境只改 IMAGE_TAG，基础设施 ID 不变。[发布与回滚](../docs/RELEASE_INTERFACE_20260910.md)。

直接回滚基线 `57345dd`，认识 schema36 和分离存储的桌宠图片；不执行迁移、旧库覆盖、权限赠送或账号注销关停。下文 17:04 及以前为历史快照。

### 2026-09-10 17:04 历史发布：我的工作台与桌宠增强

当前应用 `57345dd5dbe510fc74f771e887f61afaa1ef8816`，北京时间 17:04:44 上线。前端与只读每日钱包汇总接口，schema36 / 37 迁移 / 148 表不变，未执行迁移或赠送。新鲜备份恢复、异机校验、真实 PostgreSQL、最终镜像 12 组浏览器/17 张截图和公网 13 项验收通过；只切 API/Web，环境仅 IMAGE_TAG，基础设施 ID 保持不变。[正式发布及回滚](../docs/RELEASE_WORKSPACE_20260910.md)。

直接回滚 `4840700`，保留数据库与分离存储的本机图片；旧客户端可能暂时显示内置形象，不删除新图片键、不关账号注销，不套用更早 f46 的回退步骤。下文 14:35 及以前是历史快照。

### 2026-09-10 14:35 已发布：免费工位搭子

当前应用 `48407006c70c5964c13ffd15e2670a322664344e`，北京时间 14:35:41 上线；本次仅前端改动，schema36 / 37 条迁移 / 148 表保持不变，不执行 UP/DOWN。新鲜备份完整恢复、候选映射与无待执行迁移、全部旧数据/结构/序列比对、异机校验及最终浏览器/公网验收均通过。只替换 API/Web，环境仅 `IMAGE_TAG` 变化，数据库/Redis/网关不动。详见[工位搭子正式发布](../docs/RELEASE_DESK_PET_20260910.md)。

直接回滚基线 `754dcaf083b3841a7e0dbc77e92bd1b6c0b79cc4` 是 14:24:58 上线的桌宠初版，也认识 schema36；保留数据库和本机桌宠数据，不执行恢复覆盖，不沿用更早 f46 回退的账号注销关停。下面 11:48 与 f46 的段落仅为历史快照。

### 2026-09-10 11:48 历史发布：摸鱼指数与支持台账

应用 `0b991be2c3ed3aaa537e3096d8131d7045c61c09` 已于北京时间 11:48:52 上线。新增迁移 **1700000000036**，schema35 → schema36：仅新增时长汇总与支持台账两表，旧 146 表及赠送记录不回写。当前为 37 条迁移、148 张 public 表。下表保留切换前 f46 的历史基线，不是当前运行值。具体规则见[摸鱼指数与期权持有者](../docs/COMMUNITY_FISH_SUPPORT.md)，最终镜像和验收见[本次发布记录](../docs/RELEASE_FISH_SUPPORT_20260910.md)。

此候选应用回滚基线为 f46；新表与全部台账必须保留，不运行 DOWN。若回退旧应用，临时关闭 `FEATURE_ACCOUNT_DELETION_ENABLED`，防止旧注销任务遗漏新表；旧版不能识别支持期限，应优先向前修复。这是本轮新增表的特定回滚差异，不照搬更早 public 项目的切换步骤。

预检已修正早期对 `cd` 文案、0026 目标及 `webfish-public` 回滚的过时要求；仍验证实际代码目录、独立 Compose 项目、仅 API/Web 普通切换，以及文档对当前登记的最高迁移的评审。它仍不代替备份恢复、增量迁移演练或功能验收。

以下状态来自 [Paper v2 正式发布记录](../docs/RELEASE_PAPER_V2_20260909.md)，最后一次发布后复核时间为北京时间 **2026-09-09 21:58**：

| 项目 | 已验收的值 |
| --- | --- |
| 生产 SSH / 代码目录 | `webfish-prod` / `/opt/webfish-review` |
| Compose 项目 / 文件 | `webfish-community` / `deploy/docker-compose.community.yml` |
| 环境文件 | `.env.community`，限权保管，不进入 Git |
| 实际运行应用 | `f46a765271a55d5708c6f6e0299c149b4183ef11`；2026-09-09 21:54:52 上线 |
| API 镜像 ID | `sha256:9cf9fef04f83dc314535621276f6eb81cc99ac10152480cd61313b23455907ff` |
| Web 镜像 ID | `sha256:050f7c244282252da67903bb485e8890687fc86bcff072a37d0d11c5ac616f6a` |
| 数据库 | schema35；最新迁移 `1700000000035`，完整 36 条迁移历史、146 张 public 表 |
| 本次应用更新范围 | schema35 → schema35，**无迁移**；仅 API / Web，环境仅 `IMAGE_TAG` 变化 |
| 精确应用回滚基线 | `ff6bab4ae5aa68a14f0de0204dbd34b9eb822a82` |

最终不可变候选真实双 Firefox 30 项检查、21 张唯一截图及哈希核验通过；公网普通双账号 HTTPS/WSS、匿名桌面/390px 浏览器及数据安全复核通过。详细检查范围、旧候选被拒绝原因及备份证据见正式发布记录，不把它概括为“全站所有功能重新验完”。

**2026-09-10 的 GitHub 主分支与 README 整理以已上线 f46a765 为应用代码基线，只追加文档，不发布新应用。** 分支整理不等于部署，不修改 `IMAGE_TAG`、环境、数据库或运行容器，不需要重启。仓库文档 HEAD 可以晚于运行镜像；不能把文档提交号写成线上应用版本，也不能据 `main` 整理宣称生产 checkout 已切换到 `main`。之后的发布须重新核对分支、源码、镜像和数据库，而非一直沿用本表。

## 2. 当前架构与功能边界

[社区 Compose](docker-compose.community.yml) 的常驻服务为 PostgreSQL、Redis、API、Web（Nginx）、Gateway（Caddy）；`migrate` 是独立的一次性服务。API 使用 `main.community.js`，不是旧 `main.js` / 完整 `AppModule`。社区版不启动遗留 `main.worker.js` / `ActivityProjector`；认证邮件使用独立加密 Outbox，注销补偿使用数据库租约。新的异步消费者须独立评审回执、重试和积压机制，不可直接启用旧 Worker。

- Web 只映射宿主回环 `127.0.0.1:8080`（可由 `HTTP_PORT` 调整）；Caddy 对外提供 80/443。PostgreSQL、Redis、API 不映射宿主端口。不要对外开放 3000、5432、6379。
- 数据保存在 PostgreSQL、Redis、Caddy 的命名卷。`backend`、`application` 网络为内部网络；API 另有受配置约束的外部服务访问。不要与旧 public/review/full 项目共用环境或数据卷。
- [Nginx 白名单](community.nginx.conf) 代理已接入的账号、社交、聊天、开发协作、新闻、成长、公司及游戏 API；聊天与 Paper 使用独立 `/ws/chat`、`/ws/paper-arena`。未知 API/WS 不回落 SPA，旧文档上传和办公室乐斗 API 仍拒绝访问。前端“工具”入口不代表重新开放旧 `/api/v1/tools`。
- 工位塔防已包含服务端权威战役、存档和正式榜（`FEATURE_WORKSTATION_CAMPAIGN_ENABLED`），同时保留 `/tower-defense/practice` 本地练习；**不能再将整个塔防描述为纯前端短局**。旧本地最高分不导入正式榜。
- Paper v2 复用原版场景、人物和五武器，地图 `office-expanded-v2`、协议 2；保留原单机。联机临时房间在内存中，API 重启会结束对局，不会删除玩家数据库资产。本轮未增加 Paper 办公币奖励。
- 原版“遮司”本地资源、Arcade 记录与 Play 公平短局榜各有边界；不要把原存档战力当作统一对战分数。旧办公室乐斗的后端/前端开关固定关闭，历史表和源码仅保留兼容，不删除数据。

功能开关以 [Compose 映射](docker-compose.community.yml) 和 [.env 样例](.env.community.example) 为准；有对应前后端开关的功能必须同源构建。既有生产更新默认保留全部其他开关、外部提供方、权限及玩家数据。关闭某一个社区写入开关不等于“全站完全只读”，维护必须逐条核对受影响接口和后台任务。

## 3. 已运行社区站点：普通应用更新

以下是**未来获授权应用发布**的检查顺序，不是本次文档整理要执行的动作。不要照抄空站的全栈 `up`、旧迁移、成员授权或 VIP 发放步骤。

1. **只读盘点。** 核对干净提交、已确认的 GitHub 分支、生产源码 SHA、API/Web 不可变镜像 ID、完整环境备份、基础设施容器 ID/挂载、迁移历史、磁盘及内存余量。保留用户和协作者改动；存在冲突或证据不一致时停止。
2. **确定发布边界。** 比较候选与实际生产迁移清单，明确是无迁移更新还是指定增量迁移；登记精确回滚版本和兼容限制。不得用“最新迁移编号相同”代替完整名称、时间戳和 schema 核验。
3. **回归与构建。** 按影响范围跑测试、类型检查、社区功能开关下的构建。候选 `IMAGE_TAG` 使用其完整 40 位提交 SHA；构建 API/Web 并记录实际镜像 ID。真实候选验收必须复用最终不可变镜像，不用临时覆盖的源码/dist 代替。
4. **新鲜备份与恢复。** 为该目标保留限权加密备份、完整环境和旧镜像，完整恢复到隔离副本并做内容/结构/序列/迁移历史核对，异机传输并校验。生产备份副本不得与合成浏览器账号或外部提供方测试混在同一环境。仓库旧 `backup.sh` / `restore.sh` 面向 full 文档卷，**不是当前 community 发布的一键备份/回滚工具**；沿用当批已审阅的私有发布流程，不把私有路径、凭据或备份放进仓库。
5. **验证数据库兼容。** 无迁移更新在新鲜恢复副本上验证候选映射、无待执行迁移及全库内容不变；不执行生产 UP/DOWN。有增量迁移时，先在隔离副本验证确切起点→终点及旧数据不变；只有必要的待执行迁移可以另行批准进入生产。破坏性迁移或备份/演练失败时停止发布。
6. **候选功能验收。** 新建隔离网络、合成数据库和普通测试账号，限制 CPU/内存；跑受影响的真实 HTTP/WSS、浏览器、权限及资产边界。账号/资产并发测试要使用真实 PostgreSQL，pg-mem 或页面可见不能替代它。记录失败，修复后在最终镜像复验。
7. **有限切换。** 所有门禁通过后才更新已审阅的发布配置；排空在途操作，告知临时房间中断。常规应用更新仅以 `up -d --no-deps api web` 替换 API/Web，保持 PostgreSQL、Redis、网关及数据卷不变。不能无条件执行全栈 `up`、`down` 或启动旧 Worker。
8. **线上复核与留档。** 验证健康、实际镜像、环境差分、完整迁移登记、基础设施 ID；按授权范围完成公网及匿名/手机浏览器检查。普通合成账号的资产与残留须单独核对，未知副作用停止清理；不能自动删除真实用户。隔离材料归档并逐项校验后，只按已确认 ID/挂载清理本次测试资源。

准备实际候选时的预检与构建命令如下；它们不切流，不替代上述备份和验收，也不是本轮文档提交要执行的命令：

```bash
sh deploy/community-preflight.sh .env.community
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community config -q
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community build api web
```

预检要求 `IMAGE_TAG` 与当前干净 checkout 的完整 HEAD 一致，因此**不应用它来判断“旧运行镜像 + 新文档 HEAD”是否健康，更不能为让预检通过而擅自改生产 IMAGE_TAG**。`config -q` 只校验配置；不要把会展开密钥的完整 Compose 配置打印到公共日志。构建仍会占用 CPU/内存，需避开备份恢复及双浏览器等峰值。

## 4. 历史 f46 应用回滚：仅供追溯

此节只适用于上表 f46 → **ff6bab4ae5aa68a14f0de0204dbd34b9eb822a82** 的已审阅预案，不表示执行过生产回滚。后续应用需重新制定对应回滚边界。

- 尚未切流且旧应用健康时，仅撤销该批准备阶段的源码/环境变动，不重启运行容器。
- 已切流时，先排空/停止当前 API 在途请求，再恢复已保留的 ff6 源码、API/Web 不可变镜像和发布前**逐字相同的完整环境**。只恢复 API/Web，复核健康、迁移登记及基础设施不变。
- **保留 schema35、36 条迁移历史、全部玩家进度及新旧业务数据。禁止生产 `migration:revert` / DOWN、旧备份覆盖新数据、删表或删除数据卷。** 灾难恢复不是普通应用回滚，必须单独确认数据损失范围并验证恢复方案。
- **不要套用旧 ff6 → a456 回滚的妖塔整体、自动探索、账号注销关停措施。** ff6 已认识 schema35；历史版本的特殊限制不适用于这次回滚，环境按本次备份恢复。
- 回退也会结束内存 Paper 临时房间；完成后重新做公网验收。不能只因容器启动成功就宣称恢复完成。

完整预案和最终状态见 [Paper v2 发布记录的应用回滚章节](../docs/RELEASE_PAPER_V2_20260909.md#本轮应用回滚)。

## 5. 仅新站：空环境初始化参考

**当前生产不是空站，不执行此节。** 新站须使用已确认的独立 checkout、空数据库及独立项目/卷；如承接旧系统数据，应改走单独评审的数据迁移流程，不把旧库当空库初始化。

上线前准备 Docker/Compose、域名与 TLS、真实隐私处理者及隐私渠道、备案与游戏发布依据、已验证的 HTTPS 认证邮件 webhook、备份/监控负责人。资源与依赖版本以当前 Compose 为准，测试报告不代表容量承诺。

只在新 checkout 中创建尚不存在的环境文件；若文件已存在，停止并核对来源，**不要覆盖**：

```bash
test ! -e .env.community || { echo '已有环境文件，停止初始化' >&2; exit 1; }
umask 077
cp deploy/.env.community.example .env.community
chmod 600 .env.community
```

分别为 JWT、认证 pepper、PostgreSQL、Redis、邮件 webhook 和 Outbox 加密准备独立随机秘密；可用 `openssl rand -hex 32` 每次生成新的值，不在多字段复用。`BETA_BOOTSTRAP_CODE` 至少 16 字符且限次；真实秘密不能写入示例、Git 或命令历史。设置正确的域名、隐私/备案/游戏依据和完整 40 位候选 SHA，再执行预检。预检验证静态配置、密钥基本条件、前后端映射等，不代替 Provider 或真实数据库验收。

新站首先在隔离环境验证同一候选的完整初始化与恢复。源码 [迁移清单](../packages/backend/src/database/migrations/index.ts) 当前登记 `0000` 至 `0036`，共 37 条；成功初始化应逐条比对名称/时间戳，不只看数量。通过后，在新站独立项目中构建并启动：

```bash
sh deploy/community-preflight.sh .env.community
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community config -q
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community build api web
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community up -d
docker compose -p webfish-community \
  -f deploy/docker-compose.community.yml --env-file .env.community ps --all
```

`migrate` 使用当前 API 镜像内的 TypeORM 清单执行尚未登记的迁移，`Exited (0)` 属正常完成；API 依赖迁移成功和 Redis 健康。迁移失败须停止排查，不能跳过依赖强启 API。确认 PostgreSQL、Redis、API、Web、Gateway 及持久卷均正确，不启动旧 Worker。

新环境的服务端业务开关默认关闭，按账号、社交/内容/审核、聊天、新闻和游戏依次验收后开启；需要前端入口的开关必须重建同源前端。既有站点不执行这种“重新全关再开”。聊天室写入前验证审核、举报、重连和 Redis 故障行为；来源/新闻须有真实授权依据，不伪造榜单，不把扩大 Nginx 白名单当作功能已经实现。管理/协作角色、权益赠送和支持登记均不是新站初始化的隐含授权。

### 旧迁移演练脚本的适用范围

[community-migration-rehearsal.sh](community-migration-rehearsal.sh) 当前硬编码 `BASELINE_TIMESTAMP=1700000000007`、`LATEST_TIMESTAMP=1700000000030`；预检也只检查其这套历史覆盖。它使用脱敏 0007 plain SQL 快照，在临时 PostgreSQL 16 中验证旧 `up/down/up`、邮箱冲突和锁超时，**不是 schema35 的当前发布门禁**。把含 0035 的最新镜像直接交给它，会与“最高迁移必须为 0030”的断言冲突；不得忽略失败或声称它已验证本次版本。本轮只整理文档，不修改该脚本。

从旧快照升级或新站初始化，须先为真实起点和当前候选补齐独立演练并审阅；旧脚本的历史通过不能替代它。当前 f46 无迁移发布使用的是新鲜备份恢复、最终镜像只读克隆及数据不变核验，详见发布记录。其他 `community-*-rehearsal.cjs` 是会写合成数据的专项测试，也不能当作生产只读命令运行。

### 旧 public/full 站点转入 community

这不是当前生产的常规更新。迁移前须另外确认旧项目、独立卷、端口占用、备份恢复及回滚方案；不能直接执行上面的全栈启动。若下线旧办公室乐斗，需只读盘点 `office_battle_pending_rewards` 和全部 11 张旧乐斗表；存在 `pending` 奖励就暂停切换，经明确的数据处置和用户通知方案后再继续，不能清零、补领或删表来通过门禁。旧 public 与 community 会竞争 80/443/8080，停旧网关与切流必须单独安排。已有真实写入后不得只为回旧模式而恢复旧库覆盖新数据。

## 6. 健康检查、烟测与容量声明

本机健康检查（默认 HTTP_PORT=8080）：

```bash
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/health/ready
```

`/healthz` 仅证明 Web 可响应，`/api/health` 是 API 存活检查，社区 `/api/health/ready` 当前仅执行数据库连通性检查，不检查 Redis、邮件 Provider 或旧文档卷；三者均不等于登录、资产并发或真实游戏验收。

经确认烟测范围后，可执行：

```bash
sh deploy/community-smoke.sh https://zbrshyyzxx.top
```

该脚本检查指定静态入口、旧 API 拒绝、API no-store、安全头、遮司同源静态嵌入头、部分榜单/游戏接口与 Origin 防护；**它不是全站功能测试，也不覆盖 Paper v2 的完整双用户操作**。最后会发送无效空注册请求验证带 `Retry-After` 的 429，消耗调用 IP 的注册限流预算，因此不是纯只读巡检，不应高频无人值守运行。

认证烟测可通过私有环境提供 `COMMUNITY_SMOKE_EMAIL`、`COMMUNITY_SMOKE_PASSWORD` 并设 `REQUIRE_AUTH_SMOKE=1`。仅使用获准的普通合成账号，不使用真实成员或管理员；脚本会登录、刷新和注销会话，验证生产 `__Host-` Cookie 的 Secure/HttpOnly/SameSite/Path/无 Domain 属性及同源限制。不要把凭据写进 Git 或终端历史；有任何资产变动须如实单独记录。实际 WSS、手机界面、输入隔离及临时账号收尾按当批受影响范围补充验证。

`loadtest/k6/capacity.mjs` 仅覆盖静态页和少量只读 API；`loadtest/k6/community-capacity-gate.mjs` 当前仍是固定失败的容量门禁，未完成混合写、1000 WebSocket、重连、实例/Redis 故障和持续运行验证。完整门禁实现、评审并在隔离环境连续通过三次前，不能宣称已支持 4000 账号或 1000 同时在线/连接。

## 7. 历史发布索引：只供追溯，不重放

| 历史应用 | 当时数据库边界 | 记录与注意事项 |
| --- | --- | --- |
| `ff6bab4` | schema32 → 35，新增 0033/0034/0035 | [协作补齐与红蓝房间](../docs/RELEASE_COMPLETION_20260909.md)；现在仅作为 f46 的回滚基线。该次回退到 a456 的特殊关停条件不套用到 f46 → ff6 |
| `a456a8b` | schema32 → 32，无迁移 | [小游戏与工具导航](../docs/RELEASE_NAVIGATION_20260909.md)；不是当前运行应用 |
| `6085298` | schema32 → 32，无迁移 | [开发反馈与小窗](../docs/RELEASE_FEEDBACK_20260909.md)；该次回退到 727 的旧妖塔规则限制仅适用于当时版本 |
| `727576b` | schema30 → 32，新增 0031/0032 | [成长/VIP/自动探索](../docs/RELEASE_GROWTH_20260909.md)；0031 对当时 active 账号的一次性 720 小时赠送不是每日任务，不补发、不重放，后续新账号不因登录自动领取 |
| `82b8431` | schema29 → 30，新增妖塔六表 | [九层妖塔](../docs/RELEASE_DEMON_TOWER_20260909.md)；旧 2c82 注销清理限制和空表副本 DOWN 演练不是当前生产步骤 |
| `2c82fdd` | schema29 → 29，无迁移 | [系统审计发布](../docs/RELEASE_SYSTEM_AUDIT_20260908.md) |
| Rail / 房间密码版本 | schema28 → 29 | [轨道难题与密码](../docs/COMMUNITY_RAIL_ROOMS.md)；只记录历史迁移，不再次回填旧房间/资产 |

迁移 `0026` 的真实开发协作与附件、`0025` 起的遮司成绩及以后各游戏进度均应保留。历史 `down` 演练只在限定隔离副本进行；不能把它、旧成员授权、VIP 发放或切回 public 的步骤复制到已运行社区站。所有发布私有证据、环境副本、备份和用户附件保持限权保管，不进入 Git。
