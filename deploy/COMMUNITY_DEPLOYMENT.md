# 社区版部署

## 小游戏与工具导航：2026-09-09 当前应用

当前应用 `a456a8b27027a45a7ebd10c9a4f9efd2f8ca6696` 已于北京时间 17:26 部署，随后公网验收通过，见 [导航发布记录](../docs/RELEASE_NAVIGATION_20260909.md)。仅新增工作台侧栏直达入口及手机首页快捷入口；回滚基线为 `6085298c42485067a3f17fca54fe9904ec05d063`。后端/shared 编译产物逐文件相同，schema32 无迁移，未改功能开关、账号权限、反馈状态或玩家数据。完整恢复验证及异机备份通过后仅更新 API/Web，基础设施容器保持不变。回退本批无需执行下面旧发布的妖塔关停、VIP 发放或迁移操作。

## 开发协作与低调游戏小窗：2026-09-09 本批发布边界

本批应用 `6085298c42485067a3f17fca54fe9904ec05d063` 已于北京时间 2026-09-09 16:54 部署，16:57 公网验收与反馈回填通过，见 [正式发布记录](../docs/RELEASE_FEEDBACK_20260909.md)；实现边界见 [补齐记录](../docs/FEEDBACK_INTEGRATION_20260909.md)。应用回退基线为 `727576bb8312889da3eae0795995848da787dc95`，**schema32 → schema32，无 SQL 迁移**；不得照搬下方历史迁移、VIP 赠送或旧成员授权步骤。

- 检查完整分支/生产状态、回归/类型/社区构建、真实 PostgreSQL 的反馈快照与 CAS / 新旧妖塔存档、真实 Firefox/Chromium 小窗与组合输入隔离；保留并完整恢复验证加密备份，异机校验通过才更新 API/Web。
- 不改任何权限、付费配置、玩家资产或数据卷；前后端现有功能开关保持同源，仅镜像标签变化。
- 妖塔成长规则 2 不可交给旧规则引擎继续写。应急回退 727 时先让当前 API 停止接收并完成在途动作，再关闭妖塔整体开关及自动探索开关，保留全部 v2 存档/资产/数据库表后启动旧 API/Web。旧入口与只读投影可能显示，但写接口暂不可用，旧投影也不保证正确表达新机制；后续以前向兼容修复恢复，不能恢复旧库覆盖新进度。
- 本批百度来自官方公开网页的内嵌 JSON 标题元数据，不是正式开放 API；微博/知乎受限部分继续明确标记，不绕授权或伪造。

## 成长档案、限时 VIP 与自动探索：2026-09-09 新增发布边界

本次应用 `727576b` 已于北京时间 2026-09-09 11:36 部署，公网及数据验收通过，详见 [正式发布记录](../docs/RELEASE_GROWTH_20260909.md) 和 [成长系统说明](../docs/COMMUNITY_PROGRESSION_20260909.md)。当前应用回滚基线是 `82b84312d01cd9174441dc4a5ac45d9e56ea5a71`，已应用迁移 **`0030 → 0031 → 0032`**，仅新增会员赠送、成就解锁、佩戴展示、妖塔自动委托四表。下方旧版发布记录为历史背景，不得原样重放迁移。

- `FEATURE_COMMUNITY_PROGRESSION_ENABLED`、`FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED` 默认关闭；发布时 API 与前端构建同源启用。VIP 独立于管理/协作角色，不增加权限或付费服务。
- 迁移 `0031` 只给当时 `active` 账号赠送一次固定 720 小时 VIP；登录、刷新、重复执行已登记迁移不续期，后续新账号不自动发放。
- 最终候选须完成全仓类型/回归/构建，既有七套与新增成长/自动探索真实 PostgreSQL 演练、真实浏览器及隔离完整生产备份迁移对比。克隆的回退仅在新表为空或精确验证的赠送数据范围内进行，不回传私人行内容。
- 新鲜加密备份、完整恢复和异机校验通过后，只执行待应用的 `0031/0032` 并更新 API/Web；不重建数据库、Redis、网关或数据卷。线上只以精确限定的普通临时账号做零奖励验收，不冒充站长或修改真实成员权限。
- 应用回滚保留 schema32、新 VIP/称号/自动记录及真实游戏资产；严禁生产 down 或恢复旧备份覆盖新数据。旧 `82b8431` 不认识四张新个人表，启动旧 API 前必须临时设 `FEATURE_ACCOUNT_DELETION_ENABLED=false`，保留原申请和日期，尽快以前向修复恢复完整注销清理。

## 九层妖塔免费版：本轮发布边界

本轮应用 `82b8431` 已于北京时间 2026-09-09 09:23 部署并通过公网验收，完整结果见 [正式发布记录](../docs/RELEASE_DEMON_TOWER_20260909.md)。以下为该次发布及后续维护必须保留的安全边界，不是要求重新执行一次迁移。

本轮授权是新增免费联网玩法，目标迁移为 **`0029 → 0030`**，不是下文系统审计的无迁移更新。实施记录见 [妖塔实施与验收](../docs/DEMON_TOWER_IMPLEMENTATION_20260908.md)。`0030` 仅新增角色、世界楼层、动作回执、楼层贡献、每日进度和每日奖项六张表；不得改写旧账户、钱包、聊天、其他游戏或开发附件。读页面不自动创建角色，首次明确建立角色才初始化世界。

- 发布应用回滚基线是 `2c82fddf8cf5a8bea6fec1420f081f149c4cb655`，保留其 API/Web 镜像。本次新建 `FEATURE_COMMUNITY_DEMON_TOWER_ENABLED`，默认 `false`，API 与前端构建同源；仅在最终验收后启用，不改其他开关和真实成员权限。
- 先完成全回归、类型检查、社区构建、真实 PostgreSQL 妖塔并发/重复领取/跨日/注销清理演练及旧六套系统演练。只有静态检查或 pg-mem 通过不算迁移/并发通过。
- 以新鲜加密生产备份完整还原到另一隔离网络，验证 `0029 → 0030 → 0029 → 0030`，每轮对全部旧业务表内容作指纹比较；新六表应为空。回退仅在该临时副本验证，绝不在生产执行 `0030 down`。
- 生产运行候选镜像的迁移命令仅应用待执行 `0030`；核对原迁移登记完整保留，再以 `up -d --no-deps api web` 更新应用。不得重建数据库、Redis、网关或删数据卷。
- 若应用需回滚，切回已保留镜像并关闭新功能，**保留六张新表、角色存档、贡献和已发办公币**。禁止用旧备份覆盖发布后产生的真实业务数据。
- **旧应用的注销暂停条件**：`2c82fdd` 的注销实现是软删除用户，不认识新妖塔表；数据库外键不会因 `account_status='deleted'` 自动级联清理。因此在创建回退的旧 API 容器前，必须额外临时设置 `FEATURE_ACCOUNT_DELETION_ENABLED=false`，暂停注销入口和旧队列处理，保留原申请、冷静期和租约，不将其伪装为已完成。这是仅应急回滚的短时维护措施，正常发布不改该开关；旧前端按钮可能仍可见，接口应明确返回不可用。
- 回退期间不得手动调用旧版注销 worker。应尽快以前向修复的新 API 恢复服务，再按原日期继续注销；若旧版已完成过漏清的注销，单纯重启新版不会补删，必须先按已删除用户关联新四张个人表及奖项做只读聚合审计，再单独审阅限定范围的前向处理。不能清空新表、恢复已注销账号或重放迁移来解决。

以上为门禁要求；本轮对应的提交、备份、演练和线上验收已完成，具体结果以正式发布记录为准。下方 `0029 → 0029` 及首次建站步骤都是历史上下文，不得原样照搬。

## 2026-09-08 系统审计修复：已运行站点的发布边界

本轮账号、聊天、通知、资产、公会及页面恢复修复是 **`0029 → 0029` 的无迁移应用更新**，不修改实体、历史迁移或现有生产功能开关。详细验收见 [系统审计记录](../docs/SYSTEM_AUDIT_2026-09-08.md)。保留新鲜加密备份并完整恢复、异机校验；最终候选镜像须重跑账号/开发、资产、社交、Play、Rail、新闻快照隔离系统演练，并在另一个不与浏览器测试联网的生产备份副本验证无待执行迁移及全表内容不变。通过后只以 `--no-deps` 更新 API/Web，核对完整迁移登记不变，不运行历史回退、成员授权或迁移重放。

本轮应用回滚基线为 `0ec2d0b`，回滚不删除新数据、不回退 schema；该旧镜像不包含本轮修复，尤其不能将关闭社区写开关误称为“全站已经只读”。以下 Rail/密码迁移说明及首次建站步骤保留作历史/新站参考，**不能直接套用到本轮无迁移发布**。

## 既有 Rail/密码版本与首次部署参考

本次增量版本增加《轨道难题》及房主密码（`1700000000029`），迁移目标为 `1700000000029`。只新增 7 张轨道表及原 `play_rooms.password_hash` 可空字段，不回填旧账户、房间、钱包余额、聊天记录、存档或开发附件；发布要从新鲜生产备份完整还原副本验证 `0028 → 0029 → 0028 → 0029`，逐表比较原数据内容指纹（原房间仅允许新增的空密码字段）。规则见 [轨道难题与密码](../docs/COMMUNITY_RAIL_ROOMS.md) 和 [原六款小游戏](../docs/COMMUNITY_GAME_ROOMS.md)。私有开发协作 `1700000000026` 及后续游戏/热榜均已有数据，保留原开关与授权，不重复旧成员授权或旧迁移处置步骤。协作附件随数据库备份，不启动无人值守 AI 监控。

本版另有独立 `/api/v1/games/rail` Nginx 白名单及限流预算。以下完整新站初始化流程仅供新部署参考；已经运行的生产站不得照抄全栈 `up`、旧成员授权或清空新表的回滚，应沿用最近发布记录，只更新 API/Web 并执行待应用的增量迁移。

社区版是独立于 `review`、`public` 和旧 `full` 站的发布模式。它启动 PostgreSQL、Redis、数据库迁移、`main.community.js` API、社区 SPA、Nginx 和 Caddy。Nginx 只代理已实现且明确列入白名单的认证、账号、关系、绿植、内容、审核、新闻、Arcade 和 `/v1/games/play` API；旧文档上传、私人阅读、便签、偏好、工具目录和已停服的办公室乐斗 API，以及尚未实现的社区前缀一律返回 404。“摸鱼升职记”工位塔防 V3 仍为纯前端短局；原版“遮司”保留 `/games/zhesi` 页面及 `/games/zhengdao/` 静态资源和旧 Arcade 记录，新版公平短局通过 Play API 单独计算每日成绩，不混入原版存档战力。

这套 Compose 是阶段性单机发布骨架，不是“1000 同时在线已经通过”的证明。社区部署明确不启动遗留 `main.worker.js` / `ActivityProjector`：它会把事件级 `processed` 状态误当成多消费者投递状态。认证邮件使用独立加密 Outbox，账号注销补偿使用数据库租约；其他社区领域事件在完成逐消费者回执审计前不得接入旧 Worker，也不得把积压写成已投递。

## 1. 上线前条件

- 仓库为准备发布的干净提交，`IMAGE_TAG` 使用该提交完整 40 位 SHA。
- 已准备真实 ICP、隐私处理者、专用隐私渠道和游戏发布书面依据。
- `AUTH_EMAIL_WEBHOOK_URL` 的受保护 HTTPS 服务已验证可发送验证码、找回和安全通知。
- 已确认数据库/Redis 数据卷、异机备份、恢复演练和监控负责人。
- 已在 Linux Docker 隔离环境用真实 PostgreSQL 16 完成 0007 快照的迁移演练并保留证据。
- `packages/backend/src/main.community.ts` 只装载社区模块；不能导入旧完整 `AppModule`。

## 2. 准备环境文件

```bash
cd /opt/webfish-review
cp deploy/.env.community.example .env.community
chmod 600 .env.community
```

分别为 JWT、认证 pepper、数据库、Redis、邮件 webhook 和 Beta 引导码生成独立随机值。下面只演示安全字符格式，不要在多个字段复用同一个输出：

```bash
openssl rand -hex 32
```

填写 `.env.community`。`BETA_BOOTSTRAP_CODE` 是首批邀请制注册的唯一引导码，至少 16 字符并严格限制使用次数；认证邮件 webhook 必须验证 Bearer token。预检会拒绝空密钥、占位域名、非 HTTPS 邮件 webhook、缺失隐私配置、`DB_LOGGING=true`、前后端功能开关不同源、认证限流缺失、ICP 号被误当游戏依据、非当前提交镜像标签和脏工作区，并且不会打印密钥。

```bash
sh deploy/community-preflight.sh .env.community
```

### PostgreSQL 16 迁移发布门禁

`community-preflight.sh` 只做静态和 Compose 检查，不能替代真实 PostgreSQL 演练。先从已停在 `1700000000007` 的脱敏数据库制作 plain SQL 快照；快照不得包含真实邮箱、密码哈希或其他个人数据：

```bash
pg_dump \
  --format=plain \
  --no-owner \
  --no-privileges \
  --file=/secure/rehearsal/community-0007.sanitized.sql \
  webfish_0007_sanitized
```

构建待发布的 `community-api` 镜像后，在 Linux Docker 主机执行：

```bash
set -o pipefail
sh deploy/community-migration-rehearsal.sh \
  "webfish-community-api:${IMAGE_TAG}" \
  /secure/rehearsal/community-0007.sanitized.sql \
  | tee "/secure/rehearsal/community-migration-${IMAGE_TAG}.log"
```

`pipefail` 必须在同一个 Bash 会话中生效；否则 `tee` 可能掩盖迁移演练脚本的非零退出码。

脚本只会创建无公网端口的一次性 Docker 网络和 PostgreSQL `16.14-alpine` 容器，不读取 `.env.community`，也不连接现网数据库。它会依次验证：

- 干净 0007 快照 `up → down 到 0007 → up`；
- 每次升级均必须完整登记至最新迁移 `1700000000030`：账号安全 `0013`、聊天室 `0014`、新闻 `0015`、热点索引 `0016`、用户名账号 `0017`、游戏成长字段 `0018`、统一等级/体力/货币 `0019`、帮派基础 `0020`、共享帮派首领 `0021`、每日热点与邀请币 `0022`、小游戏排行榜与聊天留存 `0023`、好友私聊 `0024`、Arcade 的 `zhesi` game key `0025`、私有开发协作 `0026`、权威小游戏房间/日榜/奖项 `0027`、来源独立热榜快照 `0028`、轨道房间与密码 `0029`、九层妖塔六张独立表 `0030`；
- 当前脚本先回退 `0030`，验证六张妖塔表移除、回到 `0029`，且原 7 张轨道表仍保留；再回退 `0029`，验证轨道表及可空密码字段移除、回到 `0028`。随后在空新表的临时数据库分别回退 `0028` 和 `0027`，验证两张快照表及五张游戏表删除，然后继续旧 `0026/0025` 检查。以上删除仅限该一次性演练库，真实生产仅作应用回退，绝不删新表或回收已发奖资产。
- 单独回滚 `0026` 时，四张开发协作表应删除，最新迁移回到 `0025`；仅在演练的临时数据库执行，生产回滚不得直接删除真实提案和附件。
- 单独回滚 `0025` 时，两个 Arcade CHECK 必须恢复为仅允许 `tetris`/`tank`，重新升级后必须再次同时允许 `zhesi`；
- 逐个回滚到 `0007` 后，上述 `0013`—`0030` 的表、字段、索引、约束和相关迁移记录必须全部消失，再次升级必须重新完整创建；
- `trim/lower` 后邮箱冲突必须在 schema 变更前中止；
- `user_profiles` 表锁竞争必须在 `lock_timeout` 内失败，并回滚此前已执行的 `users` DDL/数据更改；
- 释放锁后同一快照可正常升级。

只有脚本返回 0、输出最终 passed，且日志与镜像 SHA 一起归档，才能将这条从 `0007` 快照完整升级/回退的独立流程记为通过。本轮尚未记录该完整脚本在最终候选上的实际执行通过，不得把静态检查或其他隔离演练写成它的通过结果。这是首次部署或从旧快照升级时的验收流程；当前已运行站点的 `0029 → 0030` 发布须执行文首列出的最终候选、生产备份副本和异机备份门禁，实际完成状态另见本轮发布记录。

## 3. 构建但不切流

社区版始终使用独立 Compose 项目 `webfish-community`，不与原 `webfish-public`/review 共用容器、网络或数据卷。构建阶段不会占用线上端口：

```bash
docker compose \
  -p webfish-community \
  -f deploy/docker-compose.community.yml \
  --env-file .env.community \
  config -q

docker compose \
  -p webfish-community \
  -f deploy/docker-compose.community.yml \
  --env-file .env.community \
  build
```

构建必须产出 `packages/backend/dist/main.community.js`。不要把 `main.js` 或旧 `full` 前端作为替代品。

## 4. 启动与迁移

首次切换前保留当前公开镜像和 `.env.public`，并对服务器做可恢复快照。下线旧办公室乐斗入口前还必须完成一次数据安全硬闸：记录当前运行镜像的 tag 与 digest，保留可直接回滚的镜像，对 PostgreSQL 做加密备份并验证备份可读。随后在只读事务中执行下列盘点，将输出、备份校验值、镜像 digest、时间和发布 SHA 一起归档：

```sql
BEGIN TRANSACTION READ ONLY;

SELECT status, COUNT(*)
FROM office_battle_pending_rewards
GROUP BY status;

SELECT 'office_battle_profiles' AS table_name, COUNT(*) AS row_count FROM office_battle_profiles
UNION ALL SELECT 'office_battle_offer_sets', COUNT(*) FROM office_battle_offer_sets
UNION ALL SELECT 'office_battle_offers', COUNT(*) FROM office_battle_offers
UNION ALL SELECT 'office_battle_records', COUNT(*) FROM office_battle_records
UNION ALL SELECT 'office_battle_equipment', COUNT(*) FROM office_battle_equipment
UNION ALL SELECT 'office_battle_loadout_items', COUNT(*) FROM office_battle_loadout_items
UNION ALL SELECT 'office_battle_defense_configs', COUNT(*) FROM office_battle_defense_configs
UNION ALL SELECT 'office_battle_pending_rewards', COUNT(*) FROM office_battle_pending_rewards
UNION ALL SELECT 'office_battle_friend_reward_claims', COUNT(*) FROM office_battle_friend_reward_claims
UNION ALL SELECT 'office_battle_asset_ledger', COUNT(*) FROM office_battle_asset_ledger
UNION ALL SELECT 'office_battle_inventory_ledger', COUNT(*) FROM office_battle_inventory_ledger
ORDER BY table_name;

COMMIT;
```

如果第一个查询返回任何 `status = 'pending'` 的记录，必须立即暂停切换；不得用脚本清零、标记已领取、批量兑换或删除。先将受影响的 `user_id`、`battle_id`、奖励快照和创建时间导出到加密且限权的处置文件，由业务与隐私负责人制定并签字确认人工处置、用户通知和回滚方案后，才能继续停服。11 张表的行数只用于前后校验，切换不得改名、清空或删除这些表。

原 `webfish-public` 的 gateway/web 与社区版会竞争 80、443 和 8080；数据安全硬闸留档完整后，先只停服原容器（不执行 `down -v`），并确认端口已释放：

```bash
docker compose \
  -p webfish-public \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  stop gateway web

if ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)(80|443|8080)$'; then
  echo 'required ports are still occupied' >&2
  exit 1
fi
```

只有端口检查通过后才启动独立社区项目：

```bash
docker compose \
  -p webfish-community \
  -f deploy/docker-compose.community.yml \
  --env-file .env.community \
  up -d

docker compose \
  -p webfish-community \
  -f deploy/docker-compose.community.yml \
  --env-file .env.community \
  ps --all
```

`migrate` 成功后显示 `Exited (0)` 是正常状态。确认 PostgreSQL、Redis、API、Web 和 Gateway 状态；不得跳过失败迁移强行启动 API。

## 5. 烟测

先验证本机入口：

```bash
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/health/ready
```

再从公网执行低流量烟测：

```bash
sh deploy/community-smoke.sh https://zbrshyyzxx.top
```

发布验收必须再使用一个无生产数据的专用测试账号验证刷新 Cookie：

```bash
COMMUNITY_SMOKE_EMAIL=release-smoke@example.test \
COMMUNITY_SMOKE_PASSWORD='replace-with-dedicated-safe-password' \
REQUIRE_AUTH_SMOKE=1 \
sh deploy/community-smoke.sh https://zbrshyyzxx.top
```

脚本会验证安全响应头、API no-store、未登录本人接口拒绝、旧上传/文档及办公室乐斗 API 为 404、`/tower-defense` 与历史地址 `/ledou`、`/battle` 均可达、`/games/zhesi` 确实加载含“遮司”文案的 React chunk 并引用 `/games/zhengdao/` 静态 iframe、iframe 文档只返回一组 `SAMEORIGIN` / `frame-ancestors 'self'` 许可头且普通页仍保持 `DENY` / `frame-ancestors 'none'`、无登录信息的 `GET /api/v1/games/arcade/leaderboards/zhesi` 返回排行榜合约、WebSocket 不回落 SPA，login/verify-email 在缺少或伪造 `Origin` 时先返回 403，以及 register 入口在无害空请求爆发下返回带 `Retry-After` 的 429。限流探针在所有其他检查之后执行，不会查询真实账号、执行 bcrypt、发邮件或创建会话。它只耗尽独立的 register 预算，不影响随后使用专用账号的 login/refresh 验收；同一公网 IP 立即重跑时，register 探针可直接再次观察到 429。

带专用测试账号运行时，脚本还会验证合法 `Origin` 登录、生产 `__Host-` 刷新 Cookie 的 `Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/` 和无 `Domain` 属性，以及缺少 `Origin` 的刷新被拒绝、合法同源刷新成功并在结束时注销测试会话。不要使用真实用户账号，也不要把测试凭据写进仓库或命令历史。

## 6. 分阶段开启

1. 首次部署保持全部服务端写入业务开关为 `false`，只验证 health、登录安全、迁移、旧 API 拒绝和回滚路径。工位塔防的纯前端构建开关例外，生产固定为开启。
2. 先开启注册与账号恢复；社交核验、账号注销分别使用独立开关，只有外部 Provider 与补偿任务验收后才开启。
3. 再开启好友、邀请、投喂、工位绿植等社区事务；公开主页与这些写能力使用同一社区总闸。
4. 内容读取、内容写入、审核操作使用三个独立开关。先由值班审核员在写入关闭状态验收审核台，再开放发帖、评论和互动。
5. 聊天室先开读取和连接，发送保持关闭；首发可开启 `CHAT_BUILTIN_MODERATION_ENABLED=true` 使用内置基础规则，接入外部审核 Provider 后关闭该开关。审核、举报、Redis 故障只读和重连演练通过后，再按 50 → 200 → 500 → 1000 连接逐级开放写入。
6. 新闻总闸与后台闸同时开启后，公开列表在首篇稿件通过双人复核前仍为空；只录入真实授权来源，不得使用抓取、全文镜像或虚假种子填充页面。
7. 生产构建固定开启 `VITE_COMMUNITY_TOWER_DEFENSE_ENABLED=true`。工位塔防只在本机保存最高分，不上传进度、不接入正式排行榜也不提供正式奖励。“遮司”可在未登录时本机游玩和读取公开排行榜；只有登录账号才会创建 `zhesi` 赛局并提交经服务端校验的最佳战力，不发放正式资产。`FEATURE_COMMUNITY_BATTLE_ENABLED`、`VITE_COMMUNITY_LEDOU_ENABLED` 和 `VITE_COMMUNITY_BATTLE_SERVER_ENABLED` 必须保持 `false`，社区入口不再装配旧办公室乐斗服务；历史源码、迁移与表只供回滚，不改名也不删除数据。
8. 社区领域若以后引入新的异步事件消费者，必须先实现逐消费者回执与积压/重试/死信监控；禁止直接启用遗留 `main.worker.js`。

白名单不是实现状态说明：后端模块、授权、治理和验收必须同时完成。每次扩大白名单后重新构建并执行完整烟测。

## 7. 回滚

### 已运行社区版的常规更新

以下为历史 `0026 → 0028` 增量更新示例，不是本轮迁移目标。本轮九层妖塔 `0029 → 0030` 的回滚基线、新表保留及旧版注销暂停条件以文首专节为准；已有社区站点不执行下面的 public 切站流程。历史示例的通用原则是：发布前保存旧 community 镜像、完整提交 SHA、限权环境文件和数据库备份。候选通过隔离数据库验收后，仅运行 `compose run --rm --no-deps migrate`；验证最新迁移、旧用户/权限/钱包/反馈数据不受迁移影响，再用 `--no-deps` 替换 API/Web。应用回退时恢复经审阅的旧 community 发布配置和 API/Web，原开发协作开关及成员权限保持不变；保持 PostgreSQL、Redis、Gateway 及其数据卷不变。保留该历史更新的 `0027/0028` 新表、已发放资产及已有 `0026` 提案附件，不在生产执行 `migration:revert`。

### 首次 public 切换为 community 后的回滚

应用失败时，先完整停止 `webfish-community` 容器并确认 80、443、8080 已释放，再启动保留的独立 `webfish-public` 项目：

```bash
docker compose \
  -p webfish-community \
  -f deploy/docker-compose.community.yml \
  --env-file .env.community \
  stop

if ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)(80|443|8080)$'; then
  echo 'community ports are still occupied; public rollback was not started' >&2
  exit 1
fi

docker compose \
  -p webfish-public \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  up -d

sh deploy/public-smoke.sh https://zbrshyyzxx.top
```

`stop` 只停容器，不会删除 `webfish-community` 的 PostgreSQL、Redis 或 Caddy 命名数据卷，因此排查后仍可恢复社区项目。不要运行 `down -v`、`docker volume prune` 或全局带卷清理。数据库迁移可能不可逆；如果已有真实社区写入，必须按演练过的数据库恢复流程处理，不能只切旧镜像。特别是 `arcade_game_runs` 或 `arcade_best_scores` 已有 `game_key='zhesi'` 时，`0025` 的 down 会因旧 CHECK 无法接纳现有行而失败；应优先保留 `0025` 做应用回滚，若必须回退 schema，则必须先按经批准的数据归档/恢复方案处理，不得直接删除真实排行榜数据。

## 8. 容量声明门禁

现有 `loadtest/k6/capacity.mjs` 只覆盖公开静态页和少量只读 API。它即使通过，也不能证明社区版达到 4000 账号、1000 会话或 1000 WebSocket。

`loadtest/k6/community-capacity-gate.mjs` 当前会固定返回失败，直到合成数据、混合写请求、1000 WebSocket、重连、实例故障、Redis 故障和持续运行场景全部实现并评审。门禁被正式替换、隔离环境连续通过三次之前，不得对外宣称容量目标已经通过。
