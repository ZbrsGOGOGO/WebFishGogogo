# ZBRS 技术工具工坊整体架构设计

> 状态：已定稿，可作为后续开发与部署的主架构基线。
> 适用范围：工具、阅读、农场、小游戏（首个小游戏为“午休斗技场”）。
> 核心策略：保留现有阅读/工具代码，以模块化单体重建共享资产底座，再依次接入农场与小游戏。

## 1. 架构目标

项目的四个前台系统是：

1. **工具系统**：办公、文本、开发者小工具。
2. **阅读系统**：私人文档上传、书架、阅读、书签、笔记与阅读设置。
3. **农场系统**：短周期种植、收获、资源循环与每日留存。
4. **小游戏系统**：小游戏中心；第一款为异步、自动结算的“午休斗技场”。

四个系统共用一套用户资产底座：

- 用户档案；
- 等级与 EXP；
- 精力；
- 多币种钱包与不可变流水；
- 道具目录、背包与不可变流水；
- 签到、任务、奖励与每日上限；
- 领域事件与事务外盒。

共享底座是内部平台能力，不算第五个前台系统。

## 2. 架构决策

### 2.1 采用模块化单体，不提前拆微服务

当前阶段部署为：

```text
Browser
   │ HTTPS
   ▼
Nginx
├─ /                 React 静态资源
└─ /api/*            NestJS API
                         │
                         ├─ PostgreSQL（唯一资产真源）
                         ├─ Redis（缓存/限流/队列，可后加）
                         └─ 正文存储适配器
                            ├─ 单机首发：持久化本地卷
                            └─ 多机扩展：维护中的 S3 服务

Worker（与 API 同仓库、同镜像、不同进程）
└─ 异步解析、事务外盒消费、补偿清理和定时任务
```

原因：

- 当前一台服务器即可承载早期流量；
- 账号、资产、农场与战斗需要大量本地事务，拆服务会增加分布式事务复杂度；
- NestJS 模块已经提供清晰边界；
- 将来真正出现独立扩容需求时，可从 Port 和 outbox 边界抽出服务。

### 2.2 一个仓库、三个包、两个运行进程

```text
packages/
├─ shared/        前后端共享契约、枚举、错误码和纯规则
├─ backend/       API 与 Worker
└─ frontend/      React SPA
```

后端同一代码包提供：

- `api` 进程：处理 HTTP 请求；
- `worker` 进程：处理异步任务；
- `migration` 命令：只在部署阶段显式运行。

### 2.3 PostgreSQL 是所有资产的唯一真源

EXP、货币、精力、道具、作物、战斗结果均以 PostgreSQL 为准。Redis 只能用于：

- 查询缓存；
- 限流；
- 队列；
- 排行榜缓存；
- 分布式锁的辅助实现。

Redis 丢失不得造成用户资产丢失或重复发奖。

## 3. 领域边界

```text
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  Dashboard | Reading | Tools | Farm | Games/Arena           │
└──────────────────────────────────────────────────────────────┘
                              │ REST /api/v1
┌──────────────────────────────────────────────────────────────┐
│                    Application Modules                       │
│  Reading       Tools          Farm          Games/Arena      │
│      \           |             |               /             │
│       └──────────┴─────────────┴──────────────┘              │
│                              ▼                               │
│  Profile | Progression | Energy | Economy | Inventory        │
│  Check-in | Tasks | Rewards | Activity | Outbox              │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│              PostgreSQL | Redis | Object Storage             │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 依赖规则

- 阅读、工具、农场、斗技场可以调用共享底座的应用服务。
- 农场和斗技场不得直接更新钱包、EXP、精力或背包表。
- 奖励统一由 `RewardsService` 原子发放并记录幂等凭证。
- 跨领域联动通过可信领域事件触发，不接受前端直接声明“已阅读 10 分钟”或“已完成任务”。
- Controller 不直接注入 TypeORM Repository。
- 模块之间优先依赖应用服务或显式 Port，不横向依赖对方的 Repository。

### 3.2 “职业”概念隔离

项目存在两套完全不同的职业：

| 概念 | 建议代码名 | 示例 | 所属领域 |
|---|---|---|---|
| 工具推荐岗位 | `ToolAudience` / `WorkRolePreference` | 开发、设计、运营、财务 | Tools |
| 斗技场战斗职业 | `BattleClassId` | 程序员、产品经理、运营、销售、行政人事 | Arena |

现有 `user_preferences.profession` 暂时保留数据库列名以兼容旧代码，但只能表示工具推荐岗位。斗技场使用独立字段和实体，绝不复用它。

## 4. 后端目标模块

```text
modules/
├─ auth/                 认证、当前用户、会话
├─ profile/              公开档案与打工人角色外观
├─ progression/          等级、EXP、称号、解锁条件
├─ energy/               精力余额、恢复与消耗
├─ economy/              钱包余额与不可变流水
├─ inventory/            道具目录、背包与不可变流水
├─ rewards/              幂等奖励编排
├─ activity/             可信行为事件、每日计数与上限
├─ checkin/              每日签到
├─ tasks/                任务定义与用户进度
├─ documents/            文档元数据与上传编排
├─ reading/              阅读视图、进度、书签、阅读会话
├─ skin/                 阅读伪装皮肤
├─ memo/                 全局便签
├─ preferences/          UI/阅读偏好
├─ tools/                工具目录与推荐
├─ farm/                 农场、土地、作物周期
├─ games/                小游戏目录
│  └─ arena/             午休斗技场
└─ outbox/               事务外盒与 Worker 消费
```

## 5. 共享资产模型

### 5.1 用户档案与成长

`user_profiles`

- `user_id`：主键并外键到 `users`；
- `nickname`、`avatar_key`、`title`；
- `created_at`、`updated_at`。

`player_progression`

- `user_id`：主键；
- `level`：1–100；
- `experience`：当前累计 EXP；
- `version`：乐观并发版本；
- `updated_at`。

等级不是由客户端提交。每次增加 EXP 后，由服务端依据版本化等级曲线重新计算等级与解锁项。

### 5.2 精力

`energy_states`

- `user_id`：主键；
- `balance`、`capacity`；
- `last_recovered_at`；
- `version`、`updated_at`。

精力采用“读取时计算”或“每日账本结算”，不为每个用户启动常驻定时器。

### 5.3 钱包与账本

`wallet_balances`

- 复合主键：`user_id + currency`；
- `balance`；
- `version`、`updated_at`。

首期币种：

- `office_coin`：办公币；
- `decor_coin`：装饰币；
- `inspiration`：灵感点；
- `water`：水滴；
- `sunlight`：阳光；
- `fertilizer`：肥料。

`wallet_ledger`

- `id`；
- `user_id`、`currency`；
- `delta`、`balance_after`；
- `source_type`、`source_id`、`reason`；
- `idempotency_key`；
- `created_at`。

余额表用于快速查询，流水表用于审计和对账。任何加减必须在同一事务内同时写两者。

### 5.4 道具与背包

`item_definitions`

- `id` / `slug`；
- `name`、`category`、`stackable`；
- `metadata`；
- `enabled`。

`inventory_stacks`

- 复合唯一键：`user_id + item_id`；
- `quantity`、`version`、`updated_at`。

`inventory_ledger`

- 与钱包流水同样记录每次增减、结余、来源和幂等键。

### 5.5 奖励

`reward_grants`

- `id`、`user_id`；
- `source_type`、`source_id`、`rule_key`；
- `reward_snapshot`；
- `created_at`。

唯一约束：

```text
user_id + source_type + source_id + rule_key
```

同一个签到、收获或战斗请求即使重试，也只能成功发奖一次。

## 6. 农场设计

### 6.1 MVP 范围

- 每个用户一个农场；
- 初始 4 块土地；
- 作物目录；
- 种植、查看成熟倒计时、收获；
- 服务端时间判定成熟；
- EXP、办公币、装饰币、灵感点等确定性奖励；
- 与签到/任务联动；
- 不做偷菜、交易、付费抽奖和好友农场。

### 6.2 数据模型

`farms`

- `user_id`：主键；
- `level`、`experience`；
- `plot_count`；
- `version`、`updated_at`。

`farm_plots`

- `id`；
- `farm_user_id`；
- `slot_index`；
- `state`：`empty | growing | mature`（`mature` 可由时间派生）；
- `version`。

`crop_definitions`

- `slug`、`name`；
- `grow_seconds`；
- `seed_item_id`；
- `plant_cost`；
- `harvest_rewards`；
- `required_farm_level`；
- `enabled`。

`farm_plantings`

- `id`、`plot_id`、`crop_slug`；
- `planted_at`、`matures_at`、`harvested_at`；
- `status`；
- `harvest_reward_snapshot`；
- `plant_idempotency_key`、`harvest_idempotency_key`。

不为每块地创建定时任务。读取时使用 `serverNow >= maturesAt` 判定成熟。

### 6.3 农场命令

- 种植：锁定土地与所需资产，扣除种子/资源，创建种植周期；
- 收获：锁定种植周期，校验成熟，标记已收获，通过奖励服务发奖；
- 批量操作：后续作为便利功能，仍逐条使用相同领域规则；
- 所有写命令要求 `Idempotency-Key`。

## 7. 小游戏与午休斗技场设计

### 7.1 小游戏中心

`games` 模块只负责：

- 游戏目录；
- 解锁条件；
- 最近游玩；
- 统一入口。

具体玩法放在独立子模块，首个为 `games/arena`。

### 7.2 斗技场 MVP

- Lv.3 解锁普通异步 PVP；
- 三选一对手：轻松、均势、危险；
- 服务端自动战斗；
- 最多 8 回合；
- 确定性随机种子；
- 保存双方快照、公式版本、随机种子、完整战报与奖励快照；
- 胜方获得 EXP/办公币，败方获得较少参与奖励；
- 战斗历史；
- PVE、排位、赛季、高阶职业后置。

`arena_battles` 至少保存：

- `id`、`attacker_user_id`；
- 对手快照；
- 双方属性快照；
- `seed`、`engine_version`、`balance_version`；
- `result`、`rounds`、`battle_log`；
- `reward_snapshot`；
- `idempotency_key`；
- `created_at`。

相同快照、种子和引擎版本必须能够完整重放同一结果。

### 7.3 竞技公平

- PVP 统一技能槽位，不出售额外战力槽；
- 会员卖配置方案、批量便利、跳过动画和外观，不卖胜率；
- 免费与会员用户的有效计榜场次上限一致；
- 强化首期固定成本、100% 成功，不做随机词条与付费概率；
- 虚拟资产不可提现、不可转让、无现实货币价值。

## 8. 跨系统联动

可信事件示例：

- `reading.session.completed`
- `reading.note.created`
- `farm.crop.harvested`
- `arena.battle.completed`
- `checkin.completed`

事件处理流程：

```text
业务事务
├─ 更新业务状态
└─ 写入 outbox_events
          │
          ▼
Worker 消费
├─ 更新任务进度
├─ 生成最近活动
└─ 写入消费回执
          │
          ▼
用户领取已完成任务
└─ 调用 RewardsService 幂等发奖
```

阅读奖励必须基于服务端阅读会话/心跳，不直接信任滚动位置或客户端上报分钟数。老板键、页面隐藏或长时间无操作时暂停有效时长。

## 9. API 设计

新增接口统一使用 `/api/v1`；现有 `/api` 接口在迁移期保留。

```text
/api/v1/me
/api/v1/platform/overview
/api/v1/checkins
/api/v1/tasks/today
/api/v1/tasks/:taskKey/claim
/api/v1/activity/recent
/api/v1/farm
/api/v1/farm/plots/:plotId/plant
/api/v1/farm/plots/:plotId/harvest
/api/v1/games
/api/v1/games/arena/bootstrap
/api/v1/games/arena/opponent-offers
/api/v1/games/arena/battles
```

规则：

- JWT 中的 `sub` 是唯一用户身份来源；
- 客户端不能提交奖励值、余额、等级或对手属性快照；
- 写操作使用稳定错误码；
- 资产写操作支持 `Idempotency-Key`；
- 列表接口使用游标分页；
- 时间统一保存为 UTC，日界线按 `Asia/Shanghai` 计算；
- API 返回 `serverTime`，倒计时以服务器时间校准。

## 10. 并发、事务与幂等

以下操作必须在单个数据库事务内完成：

- 签到与奖励；
- 种植扣除资产并占用土地；
- 收获关闭种植周期并发奖；
- 战斗扣精力、结算、保存战报并发奖；
- 道具购买/强化。

约束：

- 余额行使用行锁或乐观版本；
- 业务记录使用唯一幂等键；
- 奖励凭证使用唯一来源约束；
- 重复请求返回原结果，不产生第二笔资产变动；
- Worker 使用 outbox receipt 防止重复消费。

## 11. 前端架构

目标路由：

```text
/                       工作台
/library                阅读系统
/blog/article/:docId    阅读页
/tools                  工具系统
/farm                   农场
/games                  小游戏中心
/games/arena            午休斗技场
/profile                用户档案与资产
```

原则：

- 服务端数据使用统一查询/缓存层；
- Zustand 仅保存认证会话和纯 UI 状态；
- 四个系统页面使用 `React.lazy` 分包；
- 全局资源条展示等级、EXP、办公币、装饰币、精力；
- 所有倒计时以 API 的 `serverTime` 为基准；
- 360px 手机宽度与桌面均可操作；
- 老板键升级为全站“工作模式”，暂停动画和阅读计时。

## 12. 安全与合规

- 生产环境缺失强 JWT 密钥时拒绝启动；
- 增加刷新令牌、会话撤销和 `/me`；
- DTO 统一校验，拒绝未知字段；
- 上传类型、大小、文件名与内容探测均由服务端校验；
- 资产接口限流并保留请求 ID；
- 管理员操作写审计日志；
- 不做盗版内容分发、赌博、博彩、现金返佣、付费抽奖或虚拟资产提现；
- 不复制第三方游戏名称、角色、图像、技能和文案；
- 对外把老板键描述为“工作模式/隐私模式”，不宣传为欺骗性功能。

## 13. 服务器部署基线

### 13.1 单机首发

建议首发使用 Docker Compose：

```text
nginx
frontend-static
api
worker
postgres
document-volume
```

单机首发使用服务器本地目录并挂载独立持久卷，数据库与正文卷执行停写一致性备份并异机复制。扩展到多台 API 前，再通过现有 `StoragePort` 切换到云厂商 S3/COS/OSS 或其他持续维护的兼容服务。

### 13.2 资源建议

- 2 核 4G：适合早期单实例；
- PostgreSQL 与 API 共享机器时限制连接池和容器内存；
- 单机首发不运行额外对象存储或 Redis，给系统和构建过程预留内存；
- 日志按天轮转；
- 数据库每日全量备份，并保留 WAL/增量策略；
- 文档持久卷纳入一致性备份、保留与异机复制；切换 S3 后再启用版本或生命周期策略；
- TLS、域名和防火墙在上线前完成。

### 13.3 发布流程

```text
构建镜像
→ 备份数据库
→ 执行 migration
→ 启动新 API/Worker
→ 健康检查
→ 切换 Nginx
→ 冒烟测试
→ 保留上一镜像用于回滚
```

仓库已经提供 `deploy/preflight.sh`、`deploy/backup.sh` 和 `deploy/restore.sh`：预检拒绝空值/公开占位密钥、可变镜像标签和公网明文绑定并验证 Compose；备份默认停写后同时快照 PostgreSQL 与文档卷并生成校验和；恢复要求显式确认、校验归档路径，并等待数据库/存储就绪，失败时保持业务服务停止。域名、TLS、云安全组、异机备份、监控告警和恢复演练仍必须在真实服务器完成。

## 14. 开发顺序

阶段 A–D 的首个可用闭环已经完成，服务端可信阅读会话也已接入 Activity/Tasks/Outbox/Worker；以下保留为架构演进记录。当前下一优先级是目标服务器实机部署、备份恢复演练与可观测性。

### 阶段 A：兼容与可靠性

- `/api/v1` 与 `/me`；
- 统一 DTO 校验、请求 ID 和错误码；
- 修复用户偏好 `settings` 契约；
- 修复阅读章节/位置语义；
- 隔离工具岗位与斗技场职业命名。

### 阶段 B：共享资产底座

- Profile、Progression、Energy；
- Economy、Inventory、Rewards；
- Check-in、Tasks；
- Outbox 与 Worker；
- 现有用户数据回填。

### 阶段 C：农场 MVP

- 作物目录、土地、种植、成熟、收获；
- 前端农场；
- 签到/任务/奖励联动；
- 并发与幂等测试。

### 阶段 D：斗技场 MVP

- 角色属性与解锁；
- 三选一异步对手；
- 确定性战斗引擎与文字战报；
- 精力消耗、奖励、历史；
- 战斗重放与并发测试。

### 阶段 E：上线

- Docker Compose、Nginx、备份与监控；
- 服务器环境变量；
- 数据迁移和灰度发布；
- 安全、性能与合规检查。

## 15. 首期非目标

以下内容不进入第一轮重建：

- 微服务拆分；
- 实时同步 PVP；
- 好友偷菜；
- 玩家交易市场；
- 付费抽奖或随机付费装备；
- 排位、赛季、高阶职业；
- 大型 PVE 副本；
- 社区内容广场；
- 自动支付与复杂会员体系。
