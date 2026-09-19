# 摸摸公司文档索引

最新发布：[文字战线 V4、持久房间与妖塔魂珠](RELEASE_WORD_FRONT_V4_20260919.md)：V4 默认入口、三张 10×8 地图、十二角色、20/40 波、装备/商人、服务端回放榜、跨 API 重启恢复的双人房、站长地图草稿及每武器双魂珠已经上线。此前[妖塔出发回执与异步猜画修复](RELEASE_COLLABORATION_20260915.md)、[六款本地小游戏第三阶段](RELEASE_GAME_PACK_20260915.md)的 27 个目录入口、[个人工作台与成长档案第二阶段](RELEASE_UI_PHASE2_20260915.md)、[第一阶段首页与游戏大厅](RELEASE_UI_PHASE1_20260915.md)、[压力整理与统一导航](RELEASE_RELIEF_NAVIGATION_20260911.md)、[成员投稿与站长审核](RELEASE_POSTING_20260910.md)、[深色模式](RELEASE_DARK_MODE_20260910.md)及[工作台与桌宠增强](MY_WORKSPACE.md)能力保留。

更新日期：2026-09-19。先看[项目首页](../README.md)与[当前进度](PROGRESS.md)，再按下面的主题查阅。

当前生产 API 固定到 `ef93db12d3a900e3e3506e5d595a6b9f5d7e813e`，Web 固定到 `3e32257d4bc46329482c7ba3d4cacb5dd996abb2`；最终 Web 只比 API 功能提交多两个 Nginx 路由补丁。数据库为 **schema40 / 41 条迁移 / 150 张 public 表**，PostgreSQL、Redis、Gateway 完整身份及数据卷不变。GitHub `main` 已同步应用代码，后续文档提交不代表重新部署应用。

本批完整后端 164 套 / 1637 项通过，另 6 套 / 85 项条件跳过；完整前端 221 文件 / 1939 项通过。148 表/40 迁移备份完整恢复、隔离 UP/DOWN/UP 到 150 表/41 迁移、候选 API/Web、真实 Nginx 代理和最终公网 67 项 HTTP 烟测均通过。**生产认证 Cookie 烟测明确跳过**，不宣称全站登录、真人手机矩阵或长期经济平衡已验收，具体范围见[本次发布](RELEASE_WORD_FRONT_V4_20260919.md)。

协作反馈已实际回写并于 **2026-09-19 16:21:13（北京时间）**复核：34 条中 31 已完成、3 进行中、0 待审阅。新赵云重构为 v4 9/10，妖塔 v0.11 为 v6 7/11，旧塔防更改为 v6 7/9；真人平衡、部分技能/活动及局外商店仍未完成，不能据此宣称三份提案全部完成。足球及其他游戏来源仍仅评估，未接入；Palm AI 与其暂停依赖/接口文件仍未提交、未部署，不新增支付或权限。

确认运行版本、发布结果和回滚边界时，以对应的**正式发布记录**为准；设计文档中的“待验收”或旧提交号是该阶段的历史，不是新的部署指令。

## 当前玩法与功能

| 主题 | 优先阅读 | 阅读边界 |
| --- | --- | --- |
| 工位塔防 | [正式任务与权威结算](WORKSTATION_CAMPAIGN_AND_PAPER_ARENA.md)、[V4 商店与五塔进阶](WORKSTATION_TOWER_DEFENSE_V4.md) | 正式任务与本地练习分开；现有六章、三模式、服务端存档和奖励以补齐发布为准，不再是 V1 三波版 |
| 文字战线 | [V4 默认版、持久双人房与地图草稿](RELEASE_WORD_FRONT_V4_20260919.md)、[历史 v3](RELEASE_WORD_FRONT_V3_20260914.md)、[历史 v2](RELEASE_WORD_FRONT_V2_20260914.md) | V4 三张 10×8 地图、十二角色、20/40 波、装备与商人，独立服务端回放榜；免费密码双人房采用 V4 规则并可跨 API 重启恢复。v1–v3 保留，不发办公币；长期平衡和局外商店仍未完成 |
| Paper 纸上突围 | [联机 v2](PAPER_ARENA_V2.md)、[地图来源与几何边界](PAPER_ARENA_MAP_V2.md) | 原场景与五武器、96 × 102 扩建、4–8 席临时红蓝房；不发办公币、不进正式榜，不开放联机钩索/补给/破坏 |
| 公司工作台 | [公司规则](OFFICE_HUB_RULES_20260909.md)、[猜画与界面修复](RELEASE_COLLABORATION_20260915.md) | 既有公司、公会数据复用；免费收藏、部门周常、故事、异步猜画/卧底墙及小老板日常。猜画免费不限每日创作次数，单草稿两分钟自动提交，参与猜题后可 1–5 分评价、一人一票可改，评分无新奖励；容量和短节流仍保留 |
| 压力整理 | [免费机会与奖励规则](OFFICE_RELIEF.md)、[发布验收](RELEASE_RELIEF_NAVIGATION_20260911.md) | 30 分钟认可活跃一次机会、上限 10；绑定解压币不兑换办公币，礼包实际增加 30 种植经验，原每日巡视独立保留 |
| 九层妖塔 | [双魂珠发布](RELEASE_WORD_FRONT_V4_20260919.md)、[出发回执恢复](RELEASE_COLLABORATION_20260915.md)、[v0.8—v0.11 适配](DEMON_TOWER_PROPOSALS_20260911.md)、[六工作区整合](RELEASE_COLLABORATION_20260912.md)、[灵石经济与集中申领](DEMON_TOWER_ECONOMY.md)、[基础玩家指南](DEMON_TOWER_PLAYER_GUIDE.md) | 每把主武器独立双魂珠、五类七级与免费来源；六个工作区、完整最近出发回执及原 70% 战斗 / 15% 宝匣 / 15% 机缘保留。普通探索仍消耗 5 体力；魂珠不接办公币或付费，v0.11 其余规划未全部完成 |
| 我的工作台与公开档案 | [第二阶段界面与会话验收](RELEASE_UI_PHASE2_20260915.md)、[工作台功能](MY_WORKSPACE.md) | 私人摘要优先、资料编辑默认折叠；完整资料读取失败禁用保存，公开档案不混入私人支持/钱包，并行/旧会话不能覆盖新投影 |
| 摸鱼指数、称号与期权持有者 | [第二阶段成长收藏](RELEASE_UI_PHASE2_20260915.md)、[指数与台账规则](COMMUNITY_FISH_SUPPORT.md)、[三款称号](OFFICE_RELIEF.md)、[历史成长发布](RELEASE_FISH_SUPPORT_20260910.md)、[原成长设计](COMMUNITY_PROGRESSION_20260909.md) | 44 项成就五分类、搜索与状态；佩戴先确认、管理员台账按需读取。旧赠送期限不变，月度支持人工核验，不授予管理角色 |
| 六款挑战与玩家房间 | [小游戏、房间与排行榜](COMMUNITY_GAME_ROOMS.md)、[词库更新](PLAY_WORD_BANK_V2_20260909.md) | 经典竞分、遮司短局、实时你画我猜/谁是卧底；不要与 Paper 临时房或原本机存档混算奖励 |
| 轨道难题 | [房间、观战与日榜](COMMUNITY_RAIL_ROOMS.md)、[题库 v2](RAIL_DECK_V2_20260909.md) | 独立玩法/榜单；房间密码、真人参与和奖励资格均有约束 |
| 农场与办公币 | [农场玩法](FARM_GAMEPLAY.md)、[基础收益与余额](FARM_ECONOMY_2026-09-08.md) | 每次成熟收获有基础收入，前三次仅限制额外订单；当前余额以服务端钱包为准 |
| 新闻与热榜 | [新闻分类](NEWS_CATEGORIES_2026-09-08.md)、[快照机制](TRENDING_NEWS_SNAPSHOTS_2026-09-08.md)、[历史来源验收](RELEASE_COMPLETION_20260909.md#热榜实际验收)、[历史关闭跟进](RELEASE_ECONOMY_20260911.md) | 微博、知乎、抖音仍为外链；微博、知乎反馈按站长要求关闭，保留未接入分项，不宣称站内同步成功 |
| 低调本地游戏与素材 | [2048 / Underrun 源码与许可](LOWKEY_GAME_SOURCE_REVIEW_20260909.md)、[遮司导入边界](ZHENGDAO_GAME_IMPORT.md)、[Ballpoint 来源](../third_party/ballpoint-breach/README.md) | 本地练习、长期存档和正式奖励榜不是同一套数据；遮罩不隐藏网络访问 |
| 六款本地小游戏实验室 | [玩法、固定来源、首选源码与许可](LOCAL_GAME_LAB.md)、[第三阶段发布验收](RELEASE_GAME_PACK_20260915.md) | 架构守关、麻将构筑、六角消除、AI 四子棋、街机生存、太空经营；仅本轮内存，不发办公币、不入正式榜或本站房间；Radius 限桌面键鼠，in ASCENT 建议桌面/横屏放大 |
| 首页、游戏大厅与导航 | [界面风格化第一阶段](RELEASE_UI_PHASE1_20260915.md)、[统一跨页目录与自定义](RELEASE_RELIEF_NAVIGATION_20260911.md)、[ThreeUI Community 来源与许可](../third_party/threeui/README.md) | 今日/交流/游戏/工具/我的五组快捷入口，Ctrl/⌘K 查找栏目；游戏按类型与关键词筛选，旧玩法入口保留。按账号在当前浏览器排序/隐藏/重置，不跨设备同步，不覆盖工作台收藏或绕过权限；3D 工位可关闭、空闲休眠，不读取账户资料 |
| 工位搭子 | [本机桌宠规则与隐私](DESK_PET.md)、[发布验收](RELEASE_DESK_PET_20260910.md) | 免费自定义图片与互动，按账号隔离本机保存，不调用 AI 或上传服务器 |

## 协作、运营与安全

- [摸鱼指数与期权持有者](COMMUNITY_FISH_SUPPORT.md)：有效活跃计时、六级摸鱼头衔、人工核验台账及第二阶段页面组织；schema36 是 2026-09-10 首次增量升级历史，当前 schema40，VIP 为历史名称。

- [开发协作台](DEVELOPMENT_WORKSPACE.md)：成员权限、提案/评论、附件、版本冲突、规则预检与人工审核；不包含无人值守 AI 监控。
- [历史压力整理与导航反馈处理](RELEASE_RELIEF_NAVIGATION_20260911.md)：当次两条均已完成、记录 v3，分别 8/8 与 2/2；2026-09-11 17:13 的 23 条（21 完成、1 待审阅、1 进行中）是历史快照，当时塔防四点仅诊断，后续部分实现见[协作整合发布](RELEASE_COLLABORATION_20260912.md)。
- [文字战线 V4 与魂珠](RELEASE_WORD_FRONT_V4_20260919.md)、[历史首期及 v2/v3](RELEASE_WORD_FRONT_V3_20260914.md)：旧 3/8、4/9、6/11 都是历史快照。当前新赵云重构 9/10、旧塔防 7/9、妖塔 v0.11 7/11，仍保持进行中；局外商店、关系技能/神技、周期活动与真人长期平衡等范围未全部完成。[历史妖塔提案发布](RELEASE_PROPOSALS_20260911.md)保留 v0.8/v0.9/v0.10 的完成证据。
- [历史协作反馈修复](RELEASE_COLLABORATION_20260915.md)：探索回执恢复与异步猜画不限每日次数/评价按各自范围完成并回写；2026-09-15 的 33 条统计是历史快照，当前状态以 V4 发布记录为准。
- [历史协作反馈修复](RELEASE_FEEDBACK_20260914.md)：当时两条显示问题完成，异步猜画题库扩大，但不限次数与 1–5 分评价尚未实现；发布后记录 32 条反馈（29 完成、3 进行中、0 待审阅）。这是 2026-09-14 的历史统计；随后六款小游戏界面阶段没有读取新反馈，不把旧快照或当次未实现状态当作当前结果。
- [历史经济发布与反馈处理](RELEASE_ECONOMY_20260911.md)：此前经济反馈完成 8 项，微博、知乎按站长要求关闭跟进但保留 2 个未接入分项；该次仅更新这两条反馈。一名指定成员当时获开发协作授权，不是管理员；本轮不重放授权。
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

当前 schema40、41 条迁移历史、150 张 public 表。**本批直接回滚为 API+Web**：恢复已保留的 `f346f0c` API/Web 镜像，保留全部玩家数据、V4 表/成绩/快照、魂珠存档和 41 条迁移，不执行 DOWN、旧库回灌、权限/权益重放；PostgreSQL、Redis、Gateway 及数据卷不动。旧应用期间新功能不可操作，恢复当前应用后继续。不要套用第三阶段 Web-only 或更早 API 桥流程，详见[本次发布记录](RELEASE_WORD_FRONT_V4_20260919.md)。

## 正式发布记录

同一天的记录按功能发布先后演进，不能只按文件日期判断版本。第一项为当前 API `ef93db1` / Web `3e32257`，其余为历史发布记录。文档提交可以晚于运行应用，不代表再次部署。

| 阶段 | 记录 |
| --- | --- |
| 当前 API `ef93db1` / Web `3e32257`：文字战线 V4、持久房间、地图草稿与妖塔魂珠 | [2026-09-19 文字战线 V4 发布](RELEASE_WORD_FRONT_V4_20260919.md) |
| 历史 API/Web：妖塔出发回执、异步猜画与公司对比修复，f346f0c | [2026-09-15 协作反馈修复发布](RELEASE_COLLABORATION_20260915.md) |
| 历史 Web-only：六款本地小游戏第三阶段，2b7b8d9 | [2026-09-15 第三阶段发布](RELEASE_GAME_PACK_20260915.md) |
| 历史 Web-only：个人工作台与成长档案第二阶段，cd11419 | [2026-09-15 第二阶段发布](RELEASE_UI_PHASE2_20260915.md) |
| 历史 Web-only：首页与游戏目录第一阶段，f88ba2c | [2026-09-15 第一阶段发布](RELEASE_UI_PHASE1_20260915.md) |
| 历史 API/Web：协作反馈修复，832f5288 | [2026-09-14 反馈修复发布](RELEASE_FEEDBACK_20260914.md) |
| 历史 Web-only：掌心故事本地体验，9994fe9 | [2026-09-14 掌心故事发布](RELEASE_PALM_STORY_20260914.md) |
| 历史：文字战线 v3、免费双人房与妖塔技能，d641ae0 | [2026-09-14 文字战线 v3 发布](RELEASE_WORD_FRONT_V3_20260914.md) |
| 历史：文字战线 v2 与反馈补齐，994b479 | [2026-09-14 文字战线 v2 发布](RELEASE_WORD_FRONT_V2_20260914.md) |
| 历史：文字战线首期与妖塔成长，9013da7 | [2026-09-14 文字战线首期发布](RELEASE_WORD_FRONT_20260914.md) |
| 历史：协作反馈整合，e183860 | [2026-09-12 协作反馈发布](RELEASE_COLLABORATION_20260912.md) |
| 历史：压力整理与统一导航，a84759f | [2026-09-11 17:02 压力整理与导航发布](RELEASE_RELIEF_NAVIGATION_20260911.md) |
| 历史：妖塔提案适配，9413977 | [2026-09-11 14:41 提案发布](RELEASE_PROPOSALS_20260911.md) |
| 历史：妖塔经济与统一物资申领，3426077 | [2026-09-11 11:44 经济发布](RELEASE_ECONOMY_20260911.md) |
| 历史：成员投稿与站长审核，2111004 | [2026-09-10 投稿发布](RELEASE_POSTING_20260910.md) |
| 历史：工作台深色模式，49071c8 | [2026-09-10 深色模式发布](RELEASE_DARK_MODE_20260910.md) |
| 历史：工作台统一界面，7dd04d2 | [2026-09-10 界面发布](RELEASE_INTERFACE_20260910.md) |
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
