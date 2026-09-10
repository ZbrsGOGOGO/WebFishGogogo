# 摸摸公司文档索引

最新发布：[成员投稿与站长审核](RELEASE_POSTING_20260910.md)，正常账号可投稿，经人工审核后展示；固定发帖和审核入口，详见[使用说明](POSTING_AND_REVIEW.md)。原有[深色模式](RELEASE_DARK_MODE_20260910.md)、[工作台与桌宠增强](MY_WORKSPACE.md)能力保留。

更新日期：2026-09-10。先看[项目首页](../README.md)与[当前进度](PROGRESS.md)，再按下面的主题查阅。

截至最近一次已验收发布，线上应用为 `2111004be1cc407b95cc9859afc43ac8fb10ece5`，数据库为 schema36，GitHub 集成主线为 `main`。确认运行版本、发布结果和回滚边界时，以对应的**正式发布记录**为准；设计文档中的“待验收”或旧提交号是该阶段的历史，不是新的部署指令。后续文档提交不代表重新部署应用。

## 当前玩法与功能

| 主题 | 优先阅读 | 阅读边界 |
| --- | --- | --- |
| 工位塔防 | [正式任务与权威结算](WORKSTATION_CAMPAIGN_AND_PAPER_ARENA.md)、[V4 商店与五塔进阶](WORKSTATION_TOWER_DEFENSE_V4.md) | 正式任务与本地练习分开；现有六章、三模式、服务端存档和奖励以补齐发布为准，不再是 V1 三波版 |
| Paper 纸上突围 | [联机 v2](PAPER_ARENA_V2.md)、[地图来源与几何边界](PAPER_ARENA_MAP_V2.md) | 原场景与五武器、96 × 102 扩建、4–8 席临时红蓝房；不发办公币、不进正式榜，不开放联机钩索/补给/破坏 |
| 公司工作台 | [公司规则](OFFICE_HUB_RULES_20260909.md) | 既有公司、公会数据复用；免费收藏、部门周常、故事、异步猜画/卧底墙及小老板日常 |
| 九层妖塔 | [基础玩家指南](DEMON_TOWER_PLAYER_GUIDE.md)、[免费扩展规则](../packages/backend/src/modules/community/demon-tower/EXPANSION.md)、[补齐发布](RELEASE_COMPLETION_20260909.md) | 指南是基础版规则，重复物品与成长等后续规则须结合扩展说明；不把旧指南当作全部当前掉落规则 |
| 摸鱼指数、称号与期权持有者 | [指数与台账规则](COMMUNITY_FISH_SUPPORT.md)、[当前发布](RELEASE_FISH_SUPPORT_20260910.md)、[原成长设计](COMMUNITY_PROGRESSION_20260909.md) | 41 项成就含六级摸鱼头衔；原 VIP 更名，旧赠送期限不变，月度支持人工核验授予，不授予管理角色 |
| 六款挑战与玩家房间 | [小游戏、房间与排行榜](COMMUNITY_GAME_ROOMS.md)、[词库更新](PLAY_WORD_BANK_V2_20260909.md) | 经典竞分、遮司短局、实时你画我猜/谁是卧底；不要与 Paper 临时房或原本机存档混算奖励 |
| 轨道难题 | [房间、观战与日榜](COMMUNITY_RAIL_ROOMS.md)、[题库 v2](RAIL_DECK_V2_20260909.md) | 独立玩法/榜单；房间密码、真人参与和奖励资格均有约束 |
| 农场与办公币 | [农场玩法](FARM_GAMEPLAY.md)、[基础收益与余额](FARM_ECONOMY_2026-09-08.md) | 每次成熟收获有基础收入，前三次仅限制额外订单；当前余额以服务端钱包为准 |
| 新闻与热榜 | [新闻分类](NEWS_CATEGORIES_2026-09-08.md)、[快照机制](TRENDING_NEWS_SNAPSHOTS_2026-09-08.md)、[最新来源验收](RELEASE_COMPLETION_20260909.md#热榜实际验收) | 快照文档为初版；后续已增加百度、B 站、豆瓣。微博、知乎、抖音仍为外链，不宣称站内同步成功 |
| 低调本地游戏与素材 | [2048 / Underrun 源码与许可](LOWKEY_GAME_SOURCE_REVIEW_20260909.md)、[遮司导入边界](ZHENGDAO_GAME_IMPORT.md)、[Ballpoint 来源](../third_party/ballpoint-breach/README.md) | 本地练习、长期存档和正式奖励榜不是同一套数据；遮罩不隐藏网络访问 |
| 导航入口 | [小游戏与工具直达](RELEASE_NAVIGATION_20260909.md) | 小游戏、工具、排行榜均有独立导航入口 |
| 工位搭子 | [本机桌宠规则与隐私](DESK_PET.md)、[发布验收](RELEASE_DESK_PET_20260910.md) | 免费自定义图片与互动，按账号隔离本机保存，不调用 AI 或上传服务器 |

## 协作、运营与安全

- [摸鱼指数与期权持有者](COMMUNITY_FISH_SUPPORT.md)：有效活跃计时、六级摸鱼头衔、爱发电人工核验台账及 schema36 增量升级边界；原成长发布文档中的 VIP 为历史名称。

- [开发协作台](DEVELOPMENT_WORKSPACE.md)：成员权限、提案/评论、附件、版本冲突、规则预检与人工审核；不包含无人值守 AI 监控。
- [上传安全](UPLOAD_SECURITY_20260909.md)：私有附件校验、下载与解析边界；附件内容不是执行授权。
- [协作补齐清单](FEEDBACK_COMPLETION_PLAN_20260909.md)：实施阶段的分项与待验收记录；最终完成范围和仍阻塞项见[补齐发布记录](RELEASE_COMPLETION_20260909.md#协作反馈回填)。
- [前序反馈集成](FEEDBACK_INTEGRATION_20260909.md)：补齐之前的分阶段记录，所列“未实现”项目须对照后续正式发布，不当作当前待办清单。
- [新闻编辑规则](NEWS_EDITORIAL_POLICY_V1.md)、[社区规范](COMMUNITY_RULES_V1.md)：内容发布与社区管理参考，实际权限以当前服务端校验为准。
- [系统审计](SYSTEM_AUDIT_2026-09-08.md)、[界面审计](SYSTEM_AUDIT_UI_2026-09-08.md)、[工具审计](SYSTEM_AUDIT_TOOLS_2026-09-08.md)、[审计修复发布](RELEASE_SYSTEM_AUDIT_20260908.md)：有日期和范围的检查证据，不是“永久无漏洞”承诺。
- [早期安全审查](SECURITY_REVIEW_2026-09-07.md)：保留历史问题与验证边界，不替代后续发布验收。

## 开发与部署

| 文档 | 用途 |
| --- | --- |
| [项目首页](../README.md) | 仓库入口、目录、开发和验证命令 |
| [协作约定](../AGENTS.md) | 当前 Git / 发布协作边界；每次操作前复核，不重放历史授权 |
| [部署索引](../deploy/README.md) / [社区部署说明](../deploy/COMMUNITY_DEPLOYMENT.md) | 配置、备份、健康检查、发布门禁与回滚 |
| [Compose 定义](../deploy/docker-compose.community.yml) | 社区环境服务与配置的代码依据 |
| [容量规划](CAPACITY_4000_USERS.md) / [压测说明](../loadtest/README.md) | 4,000 注册 / 1,000 在线是规划目标，不是已验收容量 |

摸鱼指数与支持台账发布新增 0036，当前为 37 条迁移历史、148 张 public 表。前一版 Paper 发布未执行迁移。历史发布中的迁移 DOWN、旧库恢复、成员授权及权益赠送不能照抄到生产；生产回退以选定版本对应的正式预案为准。

## 正式发布记录

同一天的记录按功能发布先后演进，不能只按文件日期判断版本。以下均为历史事件记录，当前线上版本见第一项。

| 阶段 | 记录 |
| --- | --- |
| 当前应用：工作台统一界面，7dd04d2 | [2026-09-10 界面发布](RELEASE_INTERFACE_20260910.md) |
| 历史：我的工作台与桌宠增强，57345dd | [2026-09-10 工作台发布](RELEASE_WORKSPACE_20260910.md) |
| 免费工位搭子，4840700 | [2026-09-10 桌宠发布](RELEASE_DESK_PET_20260910.md) |
| 成长指数与支持台账，0b991be | [2026-09-10 成长发布](RELEASE_FISH_SUPPORT_20260910.md) |
| Paper 原版场景联机 v2，f46 | [2026-09-09 Paper v2 发布](RELEASE_PAPER_V2_20260909.md) |
| schema35：协作补齐、正式塔防、公司、妖塔扩展与首版 Paper 联机，ff6 | [2026-09-09 补齐发布](RELEASE_COMPLETION_20260909.md) |
| 同日前序：导航与反馈补齐 | [导航发布](RELEASE_NAVIGATION_20260909.md)、[反馈与纸上突围单机发布](RELEASE_FEEDBACK_20260909.md) |
| 成长档案与九层妖塔基础版 | [成长发布](RELEASE_GROWTH_20260909.md)、[妖塔发布](RELEASE_DEMON_TOWER_20260909.md) |
| 2026-09-08 系统、房间与经济 | [系统审计修复](RELEASE_SYSTEM_AUDIT_20260908.md)、[轨道与密码](RELEASE_2026-09-08_RAIL_PASSWORDS.md)、[小游戏/聊天/排行](RELEASE_2026-09-08_PLAY_SOCIAL.md)、[新闻分类](RELEASE_2026-09-08_NEWS_CATEGORIES.md)、[农场收益](RELEASE_2026-09-08_FARM_BALANCE.md) |
| 2026-09-07 开发协作与早期塔防 | [开发协作](RELEASE_2026-09-07.md)、[农场反馈](RELEASE_2026-09-07_FARM.md)、[塔防 V2](RELEASE_2026-09-07_TOWER_V2.md)、[塔防 V3](RELEASE_2026-09-07_TOWER_V3.md) |

## 历史设计与阶段记录

以下资料保留设计来源、演进背景和兼容性参考，**不是当前已上线功能清单，也不是待自动执行的需求**。其中付费、目标容量、旧乐斗入口、早期成就数或“仅两款小游戏”等表述须按后续代码和发布记录修正理解。

- 早期总规划：[产品 PRD](PRODUCT_PRD_V1.md)、[平台架构](PLATFORM_ARCHITECTURE.md)、[办公室社区蓝图](OFFICE_COMMUNITY_BLUEPRINT.md)、[首玩流程](FIRST_PLAY_LOOP.md)、[成长系统](GROWTH_SYSTEMS_V1.md)、[统一经济与战斗](UNIFIED_GAME_ECONOMY_AND_COMBAT_RULES_V1.md)。完整模式的阅读/工具设计不等于当前社区站点全部开放。
- 历史乐斗：[玩法规格](OFFICE_BATTLE_GAMEPLAY_SPEC_V1.md)、[成长与技能](LEDOU_GROWTH_AND_SKILL_SYSTEM_V1.md)、[PVE 战役](LEDOU_PVE_CAMPAIGN_V1.md)、[公会首领](GUILD_BOSS_GAMEPLAY_V1.md)、[早期榜单和聊天室规则](LEADERBOARD_AND_CHAT_RULES_V1.md)。旧数据与兼容模块不能据此当作恢复乐斗或扣改玩家资产的授权。
- 早期工位塔防：[V1](WORKSTATION_TOWER_DEFENSE_V1.md)、[V2](WORKSTATION_TOWER_DEFENSE_V2.md)、[V3](WORKSTATION_TOWER_DEFENSE_V3.md)。当前正式存档、章节、职业和经济以正式任务文档为准。
- 妖塔初版阶段：[实现记录](DEMON_TOWER_IMPLEMENTATION_20260908.md)、[UI 验收](DEMON_TOWER_UI_ACCEPTANCE_20260908.md)；后续免费扩展见当前功能区。
- 农场反馈历史：[反馈记录](FARM_FEEDBACK_2026-09-07.md)，配合后续经济修复阅读。

不要把真实用户反馈原文、私有附件、凭据、环境文件或数据库备份补进公开文档。发布记录只保留必要的版本、聚合验收和实现边界。
