# Requirements Document

## Introduction

摸鱼阅读器是一个自托管的 Web 应用，把用户上传的**自有合法**纯文本文档渲染成"CSDN 风格技术博客文章页"，以便在办公场景中低调阅读。本需求文档由已批准的设计文档（design.md）派生，遵循 EARS 规范书写验收标准，并按用户要求将需求划分为三个发布版本（V1/V2/V3）。

**合规基线（贯穿所有版本）：** 本产品仅面向用户**自有、合法拥有**的文本内容，明确**排除**盗版小说分发、赌博/博彩、非法聊天导流及任何违法玩法。所有增长与变现能力（V3）均为合法机制。

## 发布路线概览（Release Planning Overview）

| 版本 | 主题 | 目标 | 交付重点 | 归属需求 |
|---|---|---|---|---|
| **第一版 V1（上线审核版 / Launch & Review）** | 可上线、合规、可审核 | 满足应用/站点审核的最小合规可用产品 | 账户认证、文档库（上传/浏览/搜索/删除自有 txt）、CSDN 伪装阅读视图、阅读控制、进度自动保存与恢复、章节目录/书签、老板键、便签自动保存、假元数据一致性、访问隔离、合规基础页、工具页与职业化工具推荐 | Requirements 1–14 |
| **第二版 V2（内容丰富版 / Content Enrichment）** | 丰富内容与阅读体验 | 扩展格式、皮肤与文档管理能力 | 更多格式（epub/pdf）、多皮肤/模板管理、富文档库（分类/标签/收藏/阅读历史）、更多摸鱼小工具、增强搜索、跨设备同步与导入/导出 | Requirements 15–20 |
| **第三版 V3（玩法/引流/变现版 / Gameplay, Growth & Monetization）** | 合法玩法与增长变现 | 合法的会员、引流与游戏化能力 | 会员/订阅分层、分享与邀请/推荐、成就/连续打卡/等级、社区/精选内容区、可选广告位；**明确排除赌博、博彩、盗版及任何非法机制** | Requirements 21–25 |

> 每条需求均在标题下标注 **版本 / Release: V1｜V2｜V3** 标签，指明其归属发布版本。

## Glossary

- **Reader_System（阅读器系统）**：整个摸鱼阅读器 Web 应用的统称。
- **Auth_Service（认证服务）**：负责用户注册、登录与 JWT 签发/校验的后端模块。
- **Document_Service（文档服务）**：负责文档上传、库管理与软删除的后端模块。
- **Parser（解析器）**：负责文本编码探测与分章的纯逻辑组件。
- **Reading_Engine（阅读引擎）**：负责分页、进度、书签与阅读控制的模块。
- **Skin_Layer（伪装层）**：负责将文档章节渲染为 CSDN 风格文章视图的皮肤模块。
- **Fake_Meta_Generator（假元数据生成器）**：由文档 ID 派生稳定伪造统计数据的纯函数组件。
- **Memo_Service（便签服务）**：负责便签内容自动保存与读取的模块。
- **Boss_Key（老板键）**：一键切换到"正经页面"并暂停进度上报的快捷键机制。
- **Widget_Service（小工具服务）**：管理下班倒计时等前端挂件配置的模块。
- **Tools_Service（工具服务）**：负责工具聚合页的工具目录管理、按分类检索、职业化工具推荐与工具启动的模块。
- **Tool（工具）**：工具聚合页中收录的单个实用小工具（如下班倒计时、单位/格式转换、文本处理、计算器、计时器、JSON/时间戳/正则等开发者小工具、汇率/日期计算等），具有唯一标识、名称、所属分类与所属职业标签集合。
- **Profession（职业）**：用户所选择的职业/岗位类别，取值属于受支持职业集合 {开发, 设计, 运营, 财务, 销售, 学生, 其他}，用于驱动职业化工具推荐并持久化到用户偏好。
- **Compliance_Pages（合规页面）**：隐私政策、服务条款、自有内容声明与备案友好页脚的统称。
- **Owner（归属用户）**：文档的唯一拥有者。
- **Membership_Service（会员服务）**：V3 中管理订阅分层与付费功能的模块。
- **Growth_Service（增长服务）**：V3 中管理分享、邀请/推荐的模块。
- **Gamification_Service（游戏化服务）**：V3 中管理成就、连续打卡与等级的模块。
- **Reading_Progress（阅读进度）**：某用户对某文档的当前章节序号、章节内偏移与全书百分比。
- **ArticleViewModel（文章视图模型）**：伪装层消费的标准化视图数据（标题、正文 HTML、假元数据、进度、皮肤 ID）。

## Requirements

> **=== 第一版 V1（上线审核版 / Launch & Review）：Requirements 1–14 ===**

### Requirement 1: 用户认证

**版本 / Release: V1**

**User Story:** 作为用户，我想要注册并登录账户，以便安全地管理并访问我自有的文档。

#### Acceptance Criteria

1. WHEN 用户提交有效的邮箱与密码进行注册, THE Auth_Service SHALL 创建新用户账户并返回成功响应。
2. IF 注册时提交的邮箱已存在, THEN THE Auth_Service SHALL 拒绝该注册并返回冲突错误。
3. WHEN 用户提交与已存储凭据匹配的邮箱与密码, THE Auth_Service SHALL 签发 JWT 访问令牌。
4. IF 登录凭据与存储记录不匹配, THEN THE Auth_Service SHALL 拒绝登录并返回认证失败错误。
5. WHEN 请求访问受保护接口且携带有效 JWT, THE Reader_System SHALL 允许该请求继续处理。
6. IF 请求访问受保护接口且缺失或携带无效 JWT, THEN THE Reader_System SHALL 拒绝该请求并返回未授权错误。
7. THE Auth_Service SHALL 以加盐哈希形式存储用户密码。

### Requirement 2: 文档上传与自有内容声明

**版本 / Release: V1**

**User Story:** 作为用户，我想要上传自己合法拥有的 txt 文档，以便在系统中阅读它们。

#### Acceptance Criteria

1. WHERE 用户在上传时确认了自有内容声明, THE Document_Service SHALL 接受该 .txt 文档并开始处理。
2. IF 用户未确认自有内容声明, THEN THE Document_Service SHALL 拒绝该上传并返回声明未确认错误。
3. IF 上传文件的类型不是支持的 .txt 文本类型, THEN THE Document_Service SHALL 拒绝该上传并返回不支持类型错误。
4. WHEN 文档被接受, THE Document_Service SHALL 将该文档的 owner_id 设为上传用户的 ID。
5. WHILE 文档正在解析处理中, THE Document_Service SHALL 将该文档状态标记为 processing。
6. WHEN 文档解析完成, THE Document_Service SHALL 将该文档状态标记为 ready。
7. IF 文档解析失败, THEN THE Document_Service SHALL 将该文档状态标记为 failed 并返回失败原因。

### Requirement 3: 文档库浏览、搜索与删除

**版本 / Release: V1**

**User Story:** 作为用户，我想要浏览、搜索和删除我上传的文档，以便管理自己的文档库。

#### Acceptance Criteria

1. WHEN 用户请求文档库列表, THE Document_Service SHALL 仅返回该用户拥有且未被软删除的文档。
2. WHEN 用户请求文档库列表, THE Document_Service SHALL 以分页形式返回结果。
3. WHEN 用户按标题关键字搜索, THE Document_Service SHALL 仅返回标题包含该关键字且归属该用户的文档。
4. WHEN 用户删除一个自己拥有的文档, THE Document_Service SHALL 对该文档执行软删除并使其不再出现在库列表中。
5. IF 用户请求删除非本人拥有的文档, THEN THE Document_Service SHALL 拒绝该操作并返回禁止访问错误。

### Requirement 4: 文本编码探测与分章

**版本 / Release: V1**

**User Story:** 作为用户，我想要系统自动识别文档编码并划分章节，以便正确阅读并按章节导航。

#### Acceptance Criteria

1. WHEN 解析已上传文档的文本缓冲区, THE Parser SHALL 返回一个属于受支持编码集合 {utf-8, gbk, gb2312, utf-16le} 的编码。
2. WHEN 对已解码文本执行分章, THE Parser SHALL 生成章节序列使得每个章节的 idx 等于其在序列中的位置且从 0 开始。
3. WHEN 对已解码文本执行分章, THE Parser SHALL 保证首章 charOffset 为 0 且每个后续章节的 charOffset 等于前一章节 charOffset 与 charLength 之和。
4. WHEN 对已解码文本执行分章, THE Parser SHALL 保证所有章节 charLength 之和等于原文本长度。
5. IF 文本中未匹配到任何章节标题, THEN THE Parser SHALL 返回将整篇作为单一章节的结果。

### Requirement 5: 伪装阅读视图（CSDN 皮肤）

**版本 / Release: V1**

**User Story:** 作为用户，我想要文档正文以 CSDN 风格技术博客文章页呈现，以便低调阅读而不引人注意。

#### Acceptance Criteria

1. WHEN 用户打开某文档的阅读页, THE Skin_Layer SHALL 将当前章节正文渲染为 CSDN 风格的技术博客文章视图。
2. WHEN 渲染阅读页, THE Skin_Layer SHALL 展示假标题栏、面包屑、阅读量、点赞、收藏、标签与专栏等伪装元数据。
3. WHEN 渲染阅读页, THE Reader_System SHALL 将浏览器标签页标题设置为技术博客风格文本。
4. THE Skin_Layer SHALL 仅消费标准化的 ArticleViewModel 而不直接依赖文档真实存储细节。

### Requirement 6: 阅读控制与分页

**版本 / Release: V1**

**User Story:** 作为用户，我想要调节字号、行距、主题并翻页阅读，以便获得舒适的阅读体验。

#### Acceptance Criteria

1. WHEN 用户请求某章节的一页且提供合法的 charOffset 与 charsPerPage, THE Reading_Engine SHALL 返回内容等于 chapterText 从 startOffset 到 endOffset 的切片。
2. WHEN 生成一页, THE Reading_Engine SHALL 保证该页字符数不超过请求的 charsPerPage。
3. WHEN 从偏移 0 起反复取页并推进至 endOffset 直到 hasNext 为 false, THE Reading_Engine SHALL 保证所有页内容按序拼接后等于原章节文本且无丢失或重复。
4. WHEN 用户调整字号、行距或主题, THE Reader_System SHALL 应用该设置并持久化到用户偏好。
5. WHEN 用户切换翻页或滚动模式, THE Reader_System SHALL 按所选模式呈现正文。

### Requirement 7: 阅读进度自动保存与恢复

**版本 / Release: V1**

**User Story:** 作为用户，我想要系统自动记住我的阅读位置并跨设备恢复，以便随时从上次的地方继续阅读。

#### Acceptance Criteria

1. WHEN 用户在阅读中翻页或滚动, THE Reading_Engine SHALL 以防抖方式自动保存该用户对该文档的阅读进度。
2. WHEN 用户重新打开某文档, THE Reading_Engine SHALL 恢复到该用户上次保存的章节序号与章节内偏移。
3. WHEN 保存阅读进度, THE Reading_Engine SHALL 在 reading_progress 中对同一 (userId, documentId) 仅保留一条记录并更新为最新值。
4. WHEN 保存阅读进度, THE Reading_Engine SHALL 保证记录的 percent 处于 0 到 100 的闭区间内。
5. IF 同一 (userId, documentId) 的进度被并发写入, THEN THE Reading_Engine SHALL 以 updated_at 最新的写入为准。

### Requirement 8: 章节目录与书签

**版本 / Release: V1**

**User Story:** 作为用户，我想要通过章节目录跳转并添加书签，以便快速定位到关注的位置。

#### Acceptance Criteria

1. WHEN 用户请求某文档的章节目录, THE Reading_Engine SHALL 返回该文档按 idx 升序排列的章节列表。
2. WHEN 用户从目录选择某章节, THE Reading_Engine SHALL 将阅读位置跳转到该章节起始处。
3. WHEN 用户在当前位置创建书签, THE Reading_Engine SHALL 保存包含章节序号与章节内偏移的书签记录。
4. WHEN 用户选择某个已保存书签, THE Reading_Engine SHALL 将阅读位置跳转到该书签记录的章节序号与偏移处。
5. WHEN 用户删除某个自己拥有的书签, THE Reading_Engine SHALL 移除该书签记录。

### Requirement 9: 老板键

**版本 / Release: V1**

**User Story:** 作为用户，我想要一键切换到"正经页面"，以便在有人靠近时迅速隐藏阅读内容。

#### Acceptance Criteria

1. WHEN 用户按下预设的老板键快捷键, THE Boss_Key SHALL 立即将界面切换为预置的正经内容页面或空白文档。
2. WHILE 老板键处于激活状态, THE Reading_Engine SHALL 暂停阅读进度上报。
3. WHEN 用户再次按下老板键快捷键, THE Boss_Key SHALL 恢复到激活前的阅读界面并恢复进度上报。
4. WHERE 用户在偏好中设置了自定义老板键, THE Boss_Key SHALL 使用该自定义快捷键作为触发键。

### Requirement 10: 便签自动保存

**版本 / Release: V1**

**User Story:** 作为用户，我想要在侧边便签中记事并自动保存，以便跨会话保留笔记而无需手动操作。

#### Acceptance Criteria

1. WHEN 用户修改便签内容, THE Memo_Service SHALL 以防抖方式自动保存该便签内容。
2. WHEN 用户在新会话中打开便签, THE Memo_Service SHALL 恢复该用户上次保存的便签内容。
3. WHEN 保存便签, THE Memo_Service SHALL 将便签内容与发起请求的用户 ID 关联。

### Requirement 11: 假元数据一致性

**版本 / Release: V1**

**User Story:** 作为用户，我想要伪造的统计数据在多次访问间保持稳定，以便伪装不会因数字跳变而穿帮。

#### Acceptance Criteria

1. WHEN 对同一文档 ID 生成假元数据, THE Fake_Meta_Generator SHALL 保证多次调用返回相等的结果。
2. WHEN 生成假元数据, THE Fake_Meta_Generator SHALL 保证 views 不小于 likes 且 views 不小于 favorites。
3. WHEN 生成假元数据, THE Fake_Meta_Generator SHALL 保证 tags 的数量处于 1 到 5 的闭区间内。

### Requirement 12: 访问隔离与安全

**版本 / Release: V1**

**User Story:** 作为用户，我想要我的文档只有我能访问，以便保护个人阅读隐私。

#### Acceptance Criteria

1. IF 某用户请求读取非本人拥有的文档内容, THEN THE Reader_System SHALL 拒绝该请求并返回禁止访问错误。
2. WHEN 拒绝越权文档访问, THE Reader_System SHALL 不泄露该文档是否存在的信息。
3. THE Reader_System SHALL 对所有文档内容访问接口执行归属鉴权校验。

### Requirement 13: 合规基础页面

**版本 / Release: V1**

**User Story:** 作为运营者，我想要提供合规声明与政策页面，以便产品通过应用/站点审核并满足法律要求。

#### Acceptance Criteria

1. WHEN 用户访问上传界面, THE Reader_System SHALL 展示明确的自有合法内容声明供用户确认。
2. THE Reader_System SHALL 提供可访问的隐私政策页面。
3. THE Reader_System SHALL 提供可访问的服务条款页面。
4. THE Reader_System SHALL 在页脚展示 ICP/备案友好信息与内容为用户上传且合法的声明。
5. WHEN 用户访问任意合规页面, THE Compliance_Pages SHALL 返回对应的政策或声明内容。

### Requirement 14: 工具页与职业化工具推荐

**版本 / Release: V1**

**User Story:** 作为用户，我想要一个聚合实用小工具的工具页，并根据我的职业获得工具推荐，以便在阅读之余快速找到与我工作最相关的自有合规小工具。

#### Acceptance Criteria

1. WHEN 用户访问工具页, THE Tools_Service SHALL 返回工具目录中所有可用工具的列表。
2. WHEN 用户选择一个受支持集合 {开发, 设计, 运营, 财务, 销售, 学生, 其他} 中的职业, THE Tools_Service SHALL 返回该职业对应推荐工具集合中的工具，且所返回的每个工具的职业标签集合均包含该职业。
3. WHEN 用户按工具分类筛选或搜索工具, THE Tools_Service SHALL 仅返回分类或名称匹配该查询条件的工具。
4. IF 用户按分类筛选或搜索工具未匹配到任何工具, THEN THE Tools_Service SHALL 返回空结果集与无匹配提示。
5. WHEN 用户请求启动某个工具, THE Tools_Service SHALL 打开该工具并返回其可用状态。
6. WHEN 用户选择职业, THE Tools_Service SHALL 将该职业持久化到该用户的偏好中。
7. WHEN 已设置职业的用户在新会话中访问工具页, THE Tools_Service SHALL 使用该用户已持久化的职业生成职业化工具推荐。
8. THE Tools_Service SHALL 仅收录用户自有且合规的实用工具，而不提供任何赌博、博彩或违法玩法工具。

> **=== 第二版 V2（内容丰富版 / Content Enrichment）：Requirements 15–20 ===**

### Requirement 15: 更多文档格式支持

**版本 / Release: V2**

**User Story:** 作为用户，我想要上传 epub 与 pdf 等更多格式的自有文档，以便阅读更丰富的内容。

#### Acceptance Criteria

1. WHERE 上传文件为受支持的 epub 或 pdf 格式且用户已确认自有内容声明, THE Document_Service SHALL 接受该文档并开始处理。
2. WHEN 解析 epub 或 pdf 文档, THE Parser SHALL 提取文本正文并生成章节索引。
3. IF 上传的 epub 或 pdf 文档无法被解析, THEN THE Document_Service SHALL 将文档状态标记为 failed 并返回失败原因。

### Requirement 16: 多皮肤与模板管理

**版本 / Release: V2**

**User Story:** 作为用户，我想要在多套皮肤/模板间切换并管理它们，以便按偏好定制伪装外观。

#### Acceptance Criteria

1. WHEN 用户请求可用皮肤列表, THE Skin_Layer SHALL 返回所有已注册皮肤模板。
2. WHEN 用户选择某个皮肤, THE Reader_System SHALL 将其持久化为该用户的当前皮肤偏好。
3. WHEN 渲染阅读视图, THE Skin_Layer SHALL 使用用户当前选择的皮肤模板渲染 ArticleViewModel。
4. WHERE 新增了皮肤模板, THE Skin_Layer SHALL 在不改动阅读引擎逻辑的前提下使其可被选择。

### Requirement 17: 富文档库（分类/标签/收藏/阅读历史）

**版本 / Release: V2**

**User Story:** 作为用户，我想要用分类、标签、收藏来组织文档并查看阅读历史，以便更好地管理大量文档。

#### Acceptance Criteria

1. WHEN 用户为某文档设置分类或标签, THE Document_Service SHALL 保存该分类或标签与文档的关联。
2. WHEN 用户按分类或标签筛选文档库, THE Document_Service SHALL 仅返回匹配该分类或标签且归属该用户的文档。
3. WHEN 用户收藏某文档, THE Document_Service SHALL 将该文档加入该用户的收藏集合。
4. WHEN 用户打开某文档进行阅读, THE Reading_Engine SHALL 记录该文档的最近阅读时间到该用户的阅读历史。
5. WHEN 用户请求阅读历史, THE Reading_Engine SHALL 按最近阅读时间降序返回该用户的阅读历史。

### Requirement 18: 更多摸鱼小工具

**版本 / Release: V2**

**User Story:** 作为用户，我想要下班倒计时、假期倒计时、退休倒计时等小工具，以便在阅读之余获得实用信息。

#### Acceptance Criteria

1. WHERE 用户启用了某个倒计时小工具, THE Widget_Service SHALL 保存该小工具的配置到用户偏好。
2. WHEN 显示下班、假期或退休倒计时小工具, THE Reader_System SHALL 依据配置的目标时间计算并展示剩余时长。
3. WHEN 用户禁用某个小工具, THE Widget_Service SHALL 从用户偏好中移除该小工具配置。

### Requirement 19: 增强搜索

**版本 / Release: V2**

**User Story:** 作为用户，我想要更强的搜索能力，以便跨标题、标签与内容快速找到文档。

#### Acceptance Criteria

1. WHEN 用户提交跨字段搜索查询, THE Document_Service SHALL 返回标题、标签或分类匹配该查询且归属该用户的文档。
2. WHEN 返回搜索结果, THE Document_Service SHALL 仅包含发起搜索用户拥有的文档。
3. IF 搜索未匹配到任何文档, THEN THE Document_Service SHALL 返回空结果集与无结果提示。

### Requirement 20: 跨设备同步与导入导出

**版本 / Release: V2**

**User Story:** 作为用户，我想要改进的跨设备同步以及导入/导出能力，以便在多设备间迁移我的阅读数据。

#### Acceptance Criteria

1. WHEN 用户在另一设备登录, THE Reading_Engine SHALL 提供该用户最新的阅读进度、书签与偏好。
2. WHEN 用户请求导出个人数据, THE Reader_System SHALL 生成包含该用户文档元数据、进度、书签与便签的可下载导出文件。
3. WHEN 用户导入之前导出的数据文件, THE Reader_System SHALL 恢复该文件中归属该用户的阅读进度、书签与便签。
4. IF 导入的数据文件格式无效, THEN THE Reader_System SHALL 拒绝该导入并返回格式错误。

> **=== 第三版 V3（玩法/引流/变现版 / Gameplay, Growth & Monetization）：Requirements 21–25 ===**
>
> **合规声明：** V3 的所有玩法、增长与变现能力均为合法机制。THE Reader_System SHALL 不提供任何赌博、博彩、开箱抽奖式付费博弈、盗版内容分发或其他违法玩法。

### Requirement 21: 会员与订阅分层

**版本 / Release: V3**

**User Story:** 作为用户，我想要订阅会员以解锁增值功能，以便支持产品并获得更好的体验。

#### Acceptance Criteria

1. WHEN 用户完成合法的会员订阅支付, THE Membership_Service SHALL 将该用户的会员等级更新为所购买的层级。
2. WHERE 用户持有有效会员等级, THE Reader_System SHALL 允许该用户访问对应层级的增值功能。
3. WHEN 会员订阅到期, THE Membership_Service SHALL 将该用户降级为免费层级并撤销增值功能访问权。
4. THE Membership_Service SHALL 仅提供固定权益的付费层级而不提供以随机结果换取付费的博彩式机制。

### Requirement 22: 分享与邀请推荐（引流）

**版本 / Release: V3**

**User Story:** 作为用户，我想要分享内容并邀请好友，以便合法地帮助产品增长并获得推荐奖励。

#### Acceptance Criteria

1. WHEN 用户生成邀请链接, THE Growth_Service SHALL 创建与该用户关联的唯一邀请码。
2. WHEN 新用户通过某邀请码完成注册, THE Growth_Service SHALL 将该新用户归因到对应的邀请人。
3. WHERE 邀请归因成功, THE Growth_Service SHALL 依据合法推荐规则向邀请人发放奖励。
4. WHEN 用户分享一个精选或公开内容项, THE Growth_Service SHALL 生成不包含他人私有文档内容的分享链接。

### Requirement 23: 成就、连续打卡与等级系统

**版本 / Release: V3**

**User Story:** 作为用户，我想要成就、连续打卡与等级系统，以便获得持续阅读的正向激励。

#### Acceptance Criteria

1. WHEN 用户在某自然日完成阅读, THE Gamification_Service SHALL 将该用户当日连续打卡计入连续记录。
2. IF 用户在某一自然日未产生阅读, THEN THE Gamification_Service SHALL 将该用户的连续打卡计数重置为零。
3. WHEN 用户达成某成就的条件, THE Gamification_Service SHALL 向该用户授予该成就。
4. WHEN 用户累计经验值达到某等级阈值, THE Gamification_Service SHALL 将该用户提升至对应等级。

### Requirement 24: 社区与精选内容区

**版本 / Release: V3**

**User Story:** 作为用户，我想要浏览合法的社区精选内容区，以便发现可公开分享的优质内容。

#### Acceptance Criteria

1. WHEN 用户访问精选内容区, THE Reader_System SHALL 仅展示已被审核批准且可公开分享的内容项。
2. IF 某内容项未通过审核, THEN THE Reader_System SHALL 不在精选内容区展示该内容项。
3. THE Reader_System SHALL 仅在社区区域展示已授权公开的内容而不展示用户私有文档。

### Requirement 25: 可选广告位

**版本 / Release: V3**

**User Story:** 作为运营者，我想要投放合规的可选广告位，以便在不破坏阅读体验的前提下获得收入。

#### Acceptance Criteria

1. WHERE 广告功能被启用且用户为非付费层级, THE Reader_System SHALL 在预定义广告位展示合规广告内容。
2. WHERE 用户持有去广告的有效会员权益, THE Reader_System SHALL 向该用户隐藏广告位。
3. THE Reader_System SHALL 仅展示合规广告而不展示涉及赌博、博彩或违法内容的广告。

## 需求与设计正确性属性的追溯关系

下列映射用于将 design.md 中的正确性属性回填到对应需求编号：

| 设计属性 | 对应需求 |
|---|---|
| Property 1 分章完整性 | Requirements 4.2, 4.3, 4.4 |
| Property 2 分页边界 | Requirements 6.1, 6.2 |
| Property 3 分页可遍历性 | Requirements 6.3 |
| Property 4 假元数据幂等性 | Requirements 11.1, 11.2 |
| Property 5 进度幂等性 | Requirements 7.3, 7.4 |
| Property 6 访问隔离 | Requirements 12.1, 12.3 |
| Property 7 职业化推荐可靠性 | Requirements 14.2, 14.7 |
| Property 8 工具筛选/搜索正确性 | Requirements 14.3 |
| Property 9 职业偏好持久化往返一致性 | Requirements 14.6, 14.7 |
