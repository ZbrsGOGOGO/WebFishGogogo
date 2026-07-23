# Implementation Plan: 摸鱼阅读器（Stealth Reader）

## Overview

本实现计划由已批准的 design.md 与 requirements.md 派生，按三个发布版本组织：

- **V1（上线审核版 / Launch & Review）** — Requirements 1–14，为首个交付里程碑，是即将上线的目标，任务粒度最细。
- **V2（内容丰富版 / Content Enrichment）** — Requirements 15–20，较高层次的任务规划。
- **V3（玩法/引流/变现版 / Gameplay, Growth & Monetization）** — Requirements 21–25，较高层次的任务规划。

技术栈：monorepo（`packages/shared` 共享 TS 类型、`packages/backend` NestJS、`packages/frontend` React + TS）、PostgreSQL、S3 兼容对象存储、Redis、JWT。属性测试使用 fast-check，共 9 条正确性属性。

任务按"共享类型 → 数据访问/纯函数 → Service → Controller/API → 前端 → 集成"的顺序增量推进，每个任务都建立在前序任务之上，最终接入端到端链路，避免出现游离、未集成的代码。

---

## Tasks

# 第一版 V1（上线审核版 / Launch & Review）

> 目标：满足应用/站点审核的最小合规可用产品。这是首个交付里程碑，优先完成。

- [x] 1. 搭建 monorepo 脚手架与共享类型基线
  - 初始化 workspace 根 `package.json`、`tsconfig.base.json`，创建 `packages/shared`、`packages/backend`（NestJS）、`packages/frontend`（React + Vite + TS）三包
  - 在 `packages/shared/src/types` 定义 `DocumentMeta`、`DocumentStatus`、`ChapterIndex`、`ReadingProgress`、`FakeMeta`、`ArticleViewModel` 类型
  - 在 `packages/shared/src/types/tool.ts` 定义 `Profession` 枚举（{开发,设计,运营,财务,销售,学生,其他}）、`Tool`、`ToolQuery`、`ToolRecommendation`
  - 在 `packages/shared/src/constants` 定义主题枚举、`DEFAULT_CHARS_PER_PAGE`、分页默认值
  - 配置后端测试框架（Jest）与 fast-check、前端测试框架（Vitest）与 fast-check
  - _Requirements: 4.1, 5.4, 14.2_

- [x] 2. 数据库 schema 与迁移
  - [x] 2.1 编写核心表迁移脚本
    - 创建 `users`、`documents`（含 `owner_id`、`status`、`deleted_at` 软删除）、`chapters`（`UNIQUE(document_id, idx)`）、`reading_progress`（`UNIQUE(user_id, document_id)`）、`bookmarks`、`memos`、`fake_meta`、`user_preferences`（含 `profession` CHECK 约束）
    - 创建 `tools`、`tool_professions`（junction，含 profession CHECK 约束）及相关索引
    - 配置数据库连接与 ORM（Prisma 或 TypeORM）实体映射
    - _Requirements: 1.1, 2.4, 3.1, 4.2, 7.3, 8.3, 10.3, 11.1, 14.1, 14.6_

## V1 · 认证（Auth）

- [x] 3. 实现用户认证与 JWT 鉴权
  - [x] 3.1 实现 Auth Repository 与密码哈希
    - 实现用户创建、按邮箱查询；使用加盐哈希（bcrypt/argon2）存储密码
    - _Requirements: 1.7_

  - [x] 3.2 实现 AuthService 注册/登录逻辑
    - 注册：邮箱唯一校验，重复邮箱返回冲突错误；成功创建账户
    - 登录：校验凭据，匹配则签发 JWT，不匹配返回认证失败错误
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [ ]* 3.3 编写 AuthService 单元测试
    - 测试重复邮箱冲突、错误凭据拒绝、密码哈希不落明文
    - _Requirements: 1.2, 1.4, 1.7_

  - [x] 3.4 实现 JWT 鉴权守卫与 Auth Controller
    - `POST /auth/register`、`POST /auth/login`；实现 `JwtAuthGuard`：有效 JWT 放行、缺失/无效 JWT 返回未授权错误
    - _Requirements: 1.1, 1.3, 1.5, 1.6_

  - [ ]* 3.5 编写鉴权守卫集成测试
    - 测试受保护接口在有/无有效 JWT 下的放行与拒绝
    - _Requirements: 1.5, 1.6_

## V1 · 文档存储领域（Documents）

- [x] 4. 实现文本解析纯函数（parsing）
  - [x] 4.1 实现 `detectEncoding` 与 `splitChapters`
    - `detectEncoding` 返回受支持编码集合 {utf-8, gbk, gb2312, utf-16le} 之一，无副作用
    - `splitChapters`：idx 从 0 连续、`charOffset` 累加连续、`charLength` 之和等于 `text.length`；无章节标题时整篇作为单章
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 编写 splitChapters 属性测试
    - **Property 1：分章完整性**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ]* 4.3 编写 detectEncoding 与单章回退单元测试
    - 测试各编码探测、无标题回退单章
    - _Requirements: 4.1, 4.5_

- [x] 5. 实现对象存储适配器（StoragePort）
  - [x] 5.1 定义 `StoragePort` 接口并实现 S3/MinIO 适配器
    - 实现 `putChapter`、`getChapter`、`deleteDocument`；抽象可切换（S3/本地/MinIO）
    - _Requirements: 2.1, 3.4_

  - [ ]* 5.2 编写 Storage 适配器集成测试
    - 使用本地/MinIO 测试章节存取与删除
    - _Requirements: 2.1, 3.4_

- [x] 6. 实现文档上传、解析与库管理
  - [x] 6.1 实现 Document Repository
    - 文档与章节的持久化与查询；库列表仅返回归属且未软删除文档，支持分页；软删除实现
    - _Requirements: 2.4, 3.1, 3.2, 3.4_

  - [x] 6.2 实现 DocumentsService 上传与解析编排
    - 校验自有内容声明（未确认拒绝）、校验 .txt 类型（非法类型拒绝）、设置 `owner_id`
    - 状态流转：processing → 解析（detectEncoding + splitChapters + putChapter）→ ready；失败标记 failed 并返回原因
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 6.3 实现库浏览、搜索与删除逻辑
    - 列表分页；按标题关键字搜索仅返回归属该用户的匹配文档；软删除；删除非本人文档返回禁止访问错误
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 6.4 编写 DocumentsService 单元测试
    - 测试声明未确认拒绝、类型拒绝、状态流转、跨用户删除拒绝
    - _Requirements: 2.2, 2.3, 2.7, 3.5_

  - [x] 6.5 实现 Documents Controller
    - `POST /documents`（multipart）、`GET /documents`（分页/搜索）、`DELETE /documents/:id`；接入鉴权守卫
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4_

## V1 · 伪装/皮肤领域（Skin）

- [x] 7. 实现假元数据生成与 CSDN 皮肤
  - [x] 7.1 实现 `generateFakeMeta` 确定性纯函数
    - 由 docId 派生稳定 seed；同一 docId 幂等；保证 `views >= likes`、`views >= favorites`；`tags.length ∈ [1,5]`
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 7.2 编写假元数据属性测试
    - **Property 4：假元数据幂等性**
    - **Validates: Requirements 11.1, 11.2**

  - [x] 7.3 实现 SkinService 与皮肤模板注册表
    - 以"模板注册表 + 数据契约"方式渲染 `ArticleViewModel`；仅消费标准化视图模型，不依赖真实存储细节
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 7.4 实现 Skin Controller
    - `GET /skins` 返回可用皮肤列表
    - _Requirements: 5.1_

## V1 · 阅读引擎领域（Reading）

- [x] 8. 实现分页器纯函数（paginator）
  - [x] 8.1 实现 `getPage`
    - `startOffset === charOffset`、`endOffset === min(charOffset + charsPerPage, len)`、`content === slice(start,end)`、`hasNext === (endOffset < len)`；无副作用
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.2 编写分页边界属性测试
    - **Property 2：分页边界**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 8.3 编写分页可遍历性属性测试
    - **Property 3：分页可遍历性**
    - **Validates: Requirements 6.3**

- [x] 9. 实现阅读进度、书签与阅读视图组装
  - [x] 9.1 实现 Progress Repository 幂等 upsert
    - 对 `(userId, documentId)` 仅保留一条记录并更新为最新值；`percent ∈ [0,100]`；并发以 `updated_at` 最新为准（LWW）
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [ ]* 9.2 编写进度幂等性属性测试
    - **Property 5：进度幂等性**
    - **Validates: Requirements 7.3, 7.4**

  - [x] 9.3 实现 ReadingService 阅读视图组装与归属鉴权
    - `getArticleView`：校验归属（非本人抛 ForbiddenException 且不泄露存在性）、拉取章节、`getPage` 切片、交 SkinService 渲染
    - `saveProgress` 幂等保存；对所有内容访问接口执行归属鉴权校验
    - _Requirements: 5.1, 6.1, 7.2, 12.1, 12.2, 12.3_

  - [ ]* 9.4 编写访问隔离属性测试
    - **Property 6：访问隔离**
    - **Validates: Requirements 12.1, 12.3**

  - [x] 9.5 实现章节目录与书签逻辑
    - 目录按 idx 升序返回；从目录跳转到章节起始；创建/删除书签（记录 chapter_idx 与 char_offset）；跳转到书签位置；删除非本人书签受限
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.6 实现 Reading Controller
    - `GET /reading/:docId/article`、`PATCH /reading/:docId/progress`、`GET/POST/DELETE /reading/:docId/bookmarks`；接入鉴权守卫
    - _Requirements: 5.1, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 8.5, 12.3_

## V1 · 便签、偏好、工具页领域

- [x] 10. 实现便签自动保存
  - [x] 10.1 实现 MemoService 与 Repository
    - 便签内容与用户 ID 关联；保存最新内容；新会话恢复上次内容
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.2 实现 Memo Controller
    - `GET/PUT /memo`；接入鉴权守卫
    - _Requirements: 10.1, 10.2_

- [x] 11. 实现用户偏好（含职业持久化）
  - [x] 11.1 实现 Preferences Repository 与 Service
    - 持久化 active_skin、font_size、line_height、theme、boss_key、profession；`getProfession`/`setProfession`
    - _Requirements: 6.4, 9.4, 14.6_

  - [x] 11.2 实现 Preferences Controller
    - `GET/PUT /preferences`，PUT 同时持久化 profession
    - _Requirements: 6.4, 9.4, 14.6_

- [x] 12. 实现工具页与职业化推荐
  - [x] 12.1 实现 `recommendTools` 与 `filterTools` 纯函数（recommender.ts）
    - `recommendTools`：返回每个工具 `professions.includes(profession)` 且 `enabled === true`，为 catalog 子集，无副作用
    - `filterTools`：分类精确匹配 AND 名称规整后包含；返回全部且仅匹配项，为 catalog 子集无重复
    - _Requirements: 14.2, 14.3, 14.8_

  - [ ]* 12.2 编写职业化推荐属性测试
    - **Property 7：职业化推荐的可靠性**
    - **Validates: Requirements 14.2, 14.7**

  - [ ]* 12.3 编写工具筛选/搜索属性测试
    - **Property 8：工具筛选/搜索的正确性**
    - **Validates: Requirements 14.3**

  - [x] 12.4 实现 Tool Repository 与工具目录种子数据
    - `listEnabledWithProfessions` 载入目录与职业标签；种子人工精选的自有合规工具（下班倒计时、单位/格式转换、文本处理、计算器、计时器、JSON/时间戳/正则、汇率/日期计算等），不收录任何赌博/博彩/违法工具
    - _Requirements: 14.1, 14.8_

  - [x] 12.5 实现 ToolsService 编排
    - `selectProfession`：持久化职业并返回推荐；`getRecommendationForUser`：用已持久化职业生成推荐（跨会话一致）；筛选/搜索无匹配返回空集与无匹配提示；启动工具返回可用状态
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ]* 12.6 编写职业偏好持久化往返一致性属性测试
    - **Property 9：职业偏好持久化往返一致性**
    - **Validates: Requirements 14.6, 14.7**

  - [x] 12.7 实现 Tools Controller
    - `GET /tools`、`GET /tools?category=&q=`、`GET /tools/recommend?profession=`、`POST /tools/:id/launch`；接入鉴权守卫
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

- [x] 13. 后端集成 checkpoint
  - 将 auth/documents/reading/skin/memo/preferences/tools 模块接入 `app.module.ts`，确保上传→解析→章节索引→阅读组装端到端链路与越权拒绝、工具页选职业→持久化→新会话推荐一致链路可运行
  - Ensure all tests pass, ask the user if questions arise.

## V1 · 前端（Frontend）

- [x] 14. 搭建前端框架与 API 客户端
  - 配置 React Router、全局 Provider、状态管理（Zustand/Redux Toolkit）；按领域拆分 `api/` 客户端；实现登录/注册页与 JWT 存取及受保护路由
  - _Requirements: 1.1, 1.3, 1.5_

- [x] 15. 实现文档库 UI（library）
  - 上传组件（含自有内容声明确认勾选，未勾选禁止上传）、库列表分页、按标题搜索、删除
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 13.1_

- [x] 16. 实现阅读引擎 UI（reader）
  - [x] 16.1 实现 CSDN 皮肤渲染与阅读视图
    - 渲染 `ArticleViewModel`：假标题栏、面包屑、阅读量/点赞/收藏/标签/专栏；设置浏览器标签页标题为技术博客风格文本
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 16.2 实现阅读控制与翻页/滚动
    - 字号、行距、明暗主题调节并持久化到偏好；翻页/滚动模式切换
    - _Requirements: 6.4, 6.5_

  - [x] 16.3 实现进度防抖自动保存与恢复
    - `useReadingProgress`/`useAutoSave` hook：翻页/滚动防抖保存；重开文档恢复上次章节与偏移
    - _Requirements: 7.1, 7.2_

  - [x] 16.4 实现章节目录与书签 UI
    - 目录跳转、创建/选择/删除书签
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 16.5 实现老板键（Boss Key）
    - `useBossKey` hook：按预设/自定义快捷键切换到正经页面/空白文档并暂停进度上报；再次按下恢复界面与上报
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 16.6 编写阅读器前端测试
    - 老板键切换、进度防抖、皮肤渲染快照
    - _Requirements: 5.1, 7.1, 9.1_

- [x] 17. 实现便签 UI（memo）
  - 侧边便签组件，防抖自动保存，跨会话恢复
  - _Requirements: 10.1, 10.2_

- [x] 18. 实现工具页 UI（tools）
  - 工具聚合页、职业选择器（选择即持久化并即时推荐、新会话按已存职业推荐）、工具卡片/启动、分类筛选/名称搜索、无匹配空态提示
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

## V1 · 合规页面（审核关键）

- [x] 19. 实现合规基础页面（Compliance_Pages）
  - [x] 19.1 实现隐私政策与服务条款页面
    - 提供可访问的隐私政策页面与服务条款页面路由，返回对应政策内容
    - _Requirements: 13.2, 13.3, 13.5_

  - [x] 19.2 实现自有内容声明与备案友好页脚
    - 上传界面展示明确的自有合法内容声明供确认；全站页脚展示 ICP/备案友好信息与"内容为用户上传且合法"声明
    - _Requirements: 13.1, 13.4, 13.5_

- [x] 20. V1 最终 checkpoint
  - 集成前后端全链路，确保 V1 全部功能可运行且合规页面就绪，满足上线审核要求
  - Ensure all tests pass, ask the user if questions arise.

---

# 第二版 V2（内容丰富版 / Content Enrichment）

> 目标：扩展格式、皮肤与文档管理能力。以下为较高层次任务规划。

- [ ] 21. 支持更多文档格式（epub/pdf）
  - [ ] 21.1 扩展 Parser 支持 epub/pdf 文本提取与章节索引
    - 校验自有内容声明后接受 epub/pdf；提取正文并生成章节索引；解析失败标记 failed 并返回原因
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 21.2 编写 epub/pdf 解析单元测试
    - _Requirements: 15.2, 15.3_

- [ ] 22. 多皮肤与模板管理
  - 皮肤列表接口返回所有已注册模板；选择皮肤持久化为用户偏好；渲染使用当前皮肤；新增皮肤不改阅读引擎逻辑
  - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 23. 富文档库（分类/标签/收藏/阅读历史）
  - [ ] 23.1 实现分类/标签/收藏数据模型与服务
    - 保存分类/标签关联；按分类/标签筛选仅返回归属该用户文档；收藏加入用户收藏集合
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ] 23.2 实现阅读历史记录与查询
    - 打开文档记录最近阅读时间；按最近阅读时间降序返回历史
    - _Requirements: 17.4, 17.5_

- [ ] 24. 更多摸鱼小工具（Widget_Service）
  - 下班/假期/退休倒计时：启用保存配置到偏好、按目标时间计算剩余时长、禁用移除配置
  - _Requirements: 18.1, 18.2, 18.3_

- [ ] 25. 增强搜索
  - 跨标题/标签/分类搜索仅返回归属该用户文档；无匹配返回空集与无结果提示
  - _Requirements: 19.1, 19.2, 19.3_

- [ ] 26. 跨设备同步与导入/导出
  - 另一设备登录提供最新进度/书签/偏好；导出生成含文档元数据/进度/书签/便签的可下载文件；导入恢复归属该用户数据；无效格式拒绝并返回格式错误
  - _Requirements: 20.1, 20.2, 20.3, 20.4_

- [ ] 27. V2 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

# 第三版 V3（玩法/引流/变现版 / Gameplay, Growth & Monetization）

> 目标：合法的会员、引流与游戏化能力。明确排除赌博、博彩、盗版及任何非法机制。以下为较高层次任务规划。

- [ ] 28. 会员与订阅分层（Membership_Service）
  - 合法支付后更新会员等级；有效会员可访问对应层级增值功能；到期降级为免费层并撤销增值权；仅提供固定权益层级，不含博彩式机制
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [ ] 29. 分享与邀请推荐（Growth_Service）
  - 生成唯一邀请码并关联邀请人；新用户通过邀请码注册归因到邀请人；归因成功按合法规则发放奖励；分享链接不含他人私有文档内容
  - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [ ] 30. 成就、连续打卡与等级系统（Gamification_Service）
  - 当日完成阅读计入连续打卡；未阅读则重置为零；达成条件授予成就；累计经验达阈值提升等级
  - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [ ] 31. 社区与精选内容区
  - 精选区仅展示已审核批准且可公开分享内容；未过审不展示；不展示用户私有文档
  - _Requirements: 24.1, 24.2, 24.3_

- [ ] 32. 可选广告位
  - 广告启用且非付费层展示合规广告；持去广告会员权益则隐藏广告位；仅展示合规广告不含赌博/博彩/违法内容
  - _Requirements: 25.1, 25.2, 25.3_

- [ ] 33. V3 最终 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- 标记 `*` 的子任务为可选（单元/属性/集成/前端测试），可为加速 MVP 跳过；核心实现任务不标记可选。
- 每个任务均引用具体需求编号（含子条款）以保证可追溯。
- V1 为首个交付里程碑，任务粒度最细；V2/V3 保持较高层次规划，待 V1 上线后细化。
- 9 条属性测试任务（Property 1–9）分别贴近对应实现任务放置，以尽早捕获错误：
  - Property 1（4.2）→ 12.x 分章；Property 2/3 → 分页；Property 4 → 假元数据；Property 5 → 进度；Property 6 → 访问隔离；Property 7/8 → 工具推荐/筛选；Property 9 → 职业偏好往返。
- 工具目录为人工精选的自有合规工具，全站排除赌博、博彩、盗版及违法玩法，与合规基线一致。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "7.1", "8.1", "10.1", "11.1", "12.1", "12.4"] },
    { "id": 3, "tasks": ["3.2", "4.2", "4.3", "5.2", "6.1", "7.2", "7.3", "8.2", "8.3", "9.1", "10.2", "11.2", "12.2", "12.3", "12.5"] },
    { "id": 4, "tasks": ["3.3", "3.4", "6.2", "7.4", "9.2", "9.3", "9.5", "12.6", "12.7"] },
    { "id": 5, "tasks": ["3.5", "6.3", "6.4", "6.5", "9.4", "9.6"] },
    { "id": 6, "tasks": ["14"] },
    { "id": 7, "tasks": ["15", "16.1", "17", "18", "19.1", "19.2"] },
    { "id": 8, "tasks": ["16.2", "16.3", "16.4", "16.5"] },
    { "id": 9, "tasks": ["16.6"] },
    { "id": 10, "tasks": ["21.1", "22", "23.1", "24", "25", "26"] },
    { "id": 11, "tasks": ["21.2", "23.2"] },
    { "id": 12, "tasks": ["28", "29", "30", "31", "32"] }
  ]
}
```
