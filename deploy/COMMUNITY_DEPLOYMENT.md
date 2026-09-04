# 社区版部署

社区版是独立于 `review`、`public` 和旧 `full` 站的发布模式。它启动 PostgreSQL、Redis、数据库迁移、`main.community.js` API、社区 SPA、Nginx 和 Caddy。Nginx 只代理已实现且明确列入白名单的认证、账号、关系、绿植、内容和审核 API；旧文档上传、私人阅读、便签、偏好、工具目录和已停服的办公室乐斗 API，以及尚未实现的社区前缀一律返回 404。“摸鱼升职记”工位塔防 V1 是纯前端短局，不新增服务端游戏 API。

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
cd /opt/webfish-community
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
- 两次升级均必须完整登记至最新迁移 `1700000000024`：账号安全 `0013`、聊天室 `0014`、新闻 `0015`、热点索引 `0016`、用户名账号 `0017`、游戏成长字段 `0018`、统一等级/体力/货币 `0019`、帮派基础 `0020`、共享帮派首领 `0021`、每日热点与邀请币 `0022`、小游戏排行榜与聊天留存 `0023`，以及好友私聊 `0024`；
- 逐个回滚到 `0007` 后，上述 `0013`—`0024` 的表、字段、索引和相关迁移记录必须全部消失，再次升级必须重新完整创建；
- `trim/lower` 后邮箱冲突必须在 schema 变更前中止；
- `user_profiles` 表锁竞争必须在 `lock_timeout` 内失败，并回滚此前已执行的 `users` DDL/数据更改；
- 释放锁后同一快照可正常升级。

只有脚本返回 0、输出最终 passed，且日志与镜像 SHA 一起归档，才可放行迁移。本次代码交付所在的 Windows 工作站未执行容器演练；这是 Linux 发布环境必须补齐的显式门禁，不得把静态检查写成“迁移已通过”。

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

脚本会验证安全响应头、API no-store、未登录本人接口拒绝、旧上传/文档及办公室乐斗 API 为 404、`/tower-defense` 与历史地址 `/ledou`、`/battle` 均可达、WebSocket 不回落 SPA，login/verify-email 在缺少或伪造 `Origin` 时先返回 403，以及 register 入口在无害空请求爆发下返回带 `Retry-After` 的 429。限流探针在所有其他检查之后执行，不会查询真实账号、执行 bcrypt、发邮件或创建会话。它只耗尽独立的 register 预算，不影响随后使用专用账号的 login/refresh 验收；同一公网 IP 立即重跑时，register 探针可直接再次观察到 429。

带专用测试账号运行时，脚本还会验证合法 `Origin` 登录、生产 `__Host-` 刷新 Cookie 的 `Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/` 和无 `Domain` 属性，以及缺少 `Origin` 的刷新被拒绝、合法同源刷新成功并在结束时注销测试会话。不要使用真实用户账号，也不要把测试凭据写进仓库或命令历史。

## 6. 分阶段开启

1. 首次部署保持全部服务端写入业务开关为 `false`，只验证 health、登录安全、迁移、旧 API 拒绝和回滚路径。工位塔防的纯前端构建开关例外，生产固定为开启。
2. 先开启注册与账号恢复；社交核验、账号注销分别使用独立开关，只有外部 Provider 与补偿任务验收后才开启。
3. 再开启好友、邀请、投喂、工位绿植等社区事务；公开主页与这些写能力使用同一社区总闸。
4. 内容读取、内容写入、审核操作使用三个独立开关。先由值班审核员在写入关闭状态验收审核台，再开放发帖、评论和互动。
5. 聊天室先开读取和连接，发送保持关闭；首发可开启 `CHAT_BUILTIN_MODERATION_ENABLED=true` 使用内置基础规则，接入外部审核 Provider 后关闭该开关。审核、举报、Redis 故障只读和重连演练通过后，再按 50 → 200 → 500 → 1000 连接逐级开放写入。
6. 新闻总闸与后台闸同时开启后，公开列表在首篇稿件通过双人复核前仍为空；只录入真实授权来源，不得使用抓取、全文镜像或虚假种子填充页面。
7. 生产构建固定开启 `VITE_COMMUNITY_TOWER_DEFENSE_ENABLED=true`。工位塔防只在本机保存最高分和设置，不上传进度、不接入正式排行榜也不提供正式奖励。`FEATURE_COMMUNITY_BATTLE_ENABLED`、`VITE_COMMUNITY_LEDOU_ENABLED` 和 `VITE_COMMUNITY_BATTLE_SERVER_ENABLED` 必须保持 `false`，社区入口不再装配旧办公室乐斗服务；历史源码、迁移与表只供回滚，不改名也不删除数据。
8. 社区领域若以后引入新的异步事件消费者，必须先实现逐消费者回执与积压/重试/死信监控；禁止直接启用遗留 `main.worker.js`。

白名单不是实现状态说明：后端模块、授权、治理和验收必须同时完成。每次扩大白名单后重新构建并执行完整烟测。

## 7. 回滚

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

`stop` 只停容器，不会删除 `webfish-community` 的 PostgreSQL、Redis 或 Caddy 命名数据卷，因此排查后仍可恢复社区项目。不要运行 `down -v`、`docker volume prune` 或全局带卷清理。数据库迁移可能不可逆；如果已有真实社区写入，必须按演练过的数据库恢复流程处理，不能只切旧镜像。

## 8. 容量声明门禁

现有 `loadtest/k6/capacity.mjs` 只覆盖公开静态页和少量只读 API。它即使通过，也不能证明社区版达到 4000 账号、1000 会话或 1000 WebSocket。

`loadtest/k6/community-capacity-gate.mjs` 当前会固定返回失败，直到合成数据、混合写请求、1000 WebSocket、重连、实例故障、Redis 故障和持续运行场景全部实现并评审。门禁被正式替换、隔离环境连续通过三次之前，不得对外宣称容量目标已经通过。
