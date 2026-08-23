# ZBRS 技术工具工坊开发进度

> 更新日期：2026-08-24
>
> 当前开发分支：`agent/simplify-farm-first-play`
>
> 线上站点：<https://zbrshyyzxx.top>

## 1. 当前发布基线

| 项目 | 当前状态 |
|---|---|
| 生产环境 | 腾讯云轻量服务器，Docker Compose 部署，运行正常 |
| 线上功能 | 首页、热点新闻、经验交流、农场、乐斗、投喂、邀请、个人主页、好友、工具、小游戏 |
| 登录边界 | 游客仅可使用工具和小游戏；社区、农场、乐斗等成长功能要求注册登录 |
| 数据真源 | PostgreSQL；Redis 用于运行时能力，不作为玩家资产真源 |
| 当前数据库迁移 | `0023 AddArcadeLeaderboardsAndChatRetention` |
| 最近线上版本 | 乐斗共享等级、PVE/PVP 分层和技能图鉴版本 |
| 自动化验证 | 后端 82 个套件 / 393 项；前端 91 个文件 / 394 项，全部通过 |
| 线上验收 | 健康检查、41 项 HTTP 冒烟检查和实际登录浏览器验收通过 |

生产服务器与当前开发提交的代码树一致。仓库不保存服务器密码、JWT 密钥、数据库密码或生产 `.env`。

## 2. 已实现功能

### 2.1 账号与访问控制

- 用户名、密码注册登录和登录态恢复。
- 密码哈希、JWT Cookie、来源校验、登录/注册限流和账户安全接口。
- 未登录用户不能操作聊天、好友、农场、乐斗、邀请币和个人成长数据。
- 用户档案、通知中心、个人主页和好友关系。

### 2.2 热点新闻与经验交流

- 热点新闻页面、每日新闻数据、发布日期校验和编辑规则。
- 注册用户聊天室；服务端只保留最近 200 条公开聊天记录。
- 聊天 WebSocket、历史记录和登录鉴权。
- 用户经验交流内容、内容边界和社区规范页面。

### 2.3 统一成长与货币

- 统一等级、经验、体力、办公币、邀请币、背包和不可变资产流水。
- 奖励幂等、防重复领取、事务一致性和 Outbox/Worker 投影。
- 每日任务、签到、最近活动和跨系统可信事件。
- 玩家资产由服务端计算，客户端不能自行申报奖励。

### 2.4 农场

- 每用户独立土地、服务端成熟时间、种植、收获和作物目录。
- 农场等级和地块数量成长。
- 农场经验、种子、收获奖励与统一办公币循环。
- 简化后的首次游玩流程，降低种植操作复杂度。

详细规则见 `docs/FARM_GAMEPLAY.md` 和 `docs/GROWTH_SYSTEMS_V1.md`。

### 2.5 办公室乐斗

- 五职业：程序员、产品经理、测试、销售员、人力资源管理。
- 六装备位、装备品质、强化、背包、掉落和职业命名。
- 共享 Lv.1～60 等级和经验曲线。
- PVE 项目挑战：NPC 对手、三档难度、PVE 技能树、完整强化增量、每日奖励上限。
- PVP 好友对战：好友条件、PVP 技能树、强化增量折算 60%、每日奖励和同好友限制。
- 五职业共 30 项 PVE/PVP 技能；独立技能点、解锁等级、升级费用和技能图鉴。
- 服务端分别返回 PVE/PVP 属性与战力快照。
- 战斗回放、历史记录、防守阵容、帮派、帮派 Boss 和排行榜。
- PVE 总榜、PVP 总榜及各职业单独排行榜。

详细规则见 `docs/OFFICE_BATTLE_GAMEPLAY_SPEC_V1.md`、`docs/LEDOU_GROWTH_AND_SKILL_SYSTEM_V1.md` 和 `docs/GUILD_BOSS_GAMEPLAY_V1.md`。

### 2.6 小游戏

- 游戏中心保留俄罗斯方块和坦克大战。
- 游戏成绩由服务端保存，并提供排行榜。
- 游客可玩；登录用户的有效成绩进入账号排行榜。

### 2.7 邀请、投喂与运营页面

- 邀请币已经进入统一钱包与用户资料；完整邀请活动仍可继续扩展。
- 投喂页面已保留产品入口，后续可接入爱发电跳转和回执方案。
- 隐私政策、服务条款、社区规范和备案页脚已经上线。

## 3. 工程与部署

- Monorepo：React/Vite 前端、NestJS 后端、共享 TypeScript 包。
- PostgreSQL 保存账号、内容、聊天、农场、乐斗和资产数据。
- Docker Compose 编排 gateway、web、api、migrate、postgres、redis。
- 网关提供 HTTPS、反向代理和安全响应头。
- 部署脚本包含环境预检、迁移、健康检查、冒烟检查和备份恢复能力。
- 目标容量按 4,000 注册用户、1,000 同时在线规划，详见 `docs/CAPACITY_4000_USERS.md`。

## 4. 换电脑继续开发

```bash
git clone https://github.com/ZbrsGOGOGO/WebFishGogogo.git
cd WebFishGogogo
git switch agent/simplify-farm-first-play
npm ci
npm run verify
```

要求 Node.js `>=22.12`。本地环境变量从仓库模板复制，不能从 GitHub 获取生产密钥。

常用命令：

```bash
npm run typecheck
npm test
npm run build
npm run dev --workspace @stealth-reader/frontend
npm run start:dev --workspace @stealth-reader/backend
```

## 5. 下一阶段建议

1. 丰富 PVE：项目章节、关卡 Boss、首次通关奖励和扫荡规则。
2. 丰富 PVP：可挑战好友池、匹配记录、防守阵容编辑和赛季统计。
3. 做装备图鉴、套装路线、掉落预览和强化材料循环。
4. 增加主动技能、战斗状态、技能触发日志和更清晰的战报表现。
5. 完善帮派任务、帮派副本、成员贡献与排行榜周期结算。
6. 接入爱发电前先确定跳转、订单回执、隐私说明和异常补单流程。
7. 根据真实并发压测结果扩充 WebSocket、Redis、API 副本和数据库连接池。

## 6. 关键文档

| 文档 | 用途 |
|---|---|
| `docs/PRODUCT_PRD_V1.md` | 产品总 PRD |
| `docs/OFFICE_COMMUNITY_BLUEPRINT.md` | 社区整体蓝图 |
| `docs/UNIFIED_GAME_ECONOMY_AND_COMBAT_RULES_V1.md` | 统一货币、体力和战斗经济 |
| `docs/LEDOU_GROWTH_AND_SKILL_SYSTEM_V1.md` | 乐斗等级、PVE/PVP 和技能图鉴 |
| `docs/LEADERBOARD_AND_CHAT_RULES_V1.md` | 排行榜与聊天保留规则 |
| `docs/CAPACITY_4000_USERS.md` | 4,000 用户容量规划 |
| `deploy/README.md` | 服务器部署与运维 |
