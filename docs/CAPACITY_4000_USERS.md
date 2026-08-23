# 4000 用户 / 1000 同时在线容量与运维基线

> 适用范围：社区版的目标口径是 4000 个已建档账号、1000 个同时在线会话（含聊天室长连接）以及真实读写混合。现有 `loadtest/k6/capacity.mjs` 只验证静态公开版；`loadtest/k6/community-capacity-gate.mjs` 会在社区混合 HTTP、WebSocket、故障和合成数据套件齐备前主动失败。任何静态页压测结果都不能替代社区版容量验收。

## 1. 目标与口径

首期容量按以下口径验收：

- 用户规模目标：4000；隔离压测库必须实际准备 4000 条合成账号、档案、关系、内容、通知和游戏资产数据。
- 同时在线用户：1000；社区版验收必须包含 1000 个独立账号会话和聊天室订阅长连接，不能用 1000 个匿名静态页 VU 替代。
- 稳态吞吐：400 RPS，等价于 1000 个在线用户平均每 2.5 秒发出一次请求。
- 峰值吞吐：800 RPS，持续 5 分钟；用于覆盖页面切换、集中登录后的读取和活动开始时的短时突发。
- `capacity.mjs` 的公开页/旧只读 API 混合只用于建立 CDN 与边缘基线；社区验收还必须覆盖登录刷新、通知分页、好友读取、内容列表、新闻、绿植、服务端乐斗、受控写入、聊天室收发与重连。

这是一条上线容量门槛，不是容量承诺。必须在与生产拓扑、镜像、数据库参数相同的隔离环境实测通过，才能认为配置满足目标。

## 2. k6 场景

脚本位于 `loadtest/k6/capacity.mjs`，共有五个档位：

| 档位 | 负载模型 | 用途 |
|---|---|---|
| `smoke` | 2 RPS × 30 秒 | 默认本机连通性检查 |
| `stable` | 400 RPS × 10 分钟 | 稳态容量验收 |
| `peak` | 100 → 400 RPS，保持 5 分钟；升至 800 RPS，保持 5 分钟；回落到 400 RPS | 峰值与恢复验收 |
| `soak` | 400 RPS × 30 分钟 | 内存、连接池和慢查询趋势检查；正式上线前建议延长到 2 小时 |
| `online` | 3 分钟升至 1000 VU，保持 10 分钟，再回落 | 验证 1000 个活跃会话；每个 VU 以 2.5 秒节拍请求，稳态约 400 RPS |

公开请求按权重访问 `/`、`/ledou`、`/tools`、`/games`、两个游戏直达页（`/games/tetris`、`/games/tank`）、`/privacy-policy` 和 `/terms-of-service`。认证场景只执行以下 GET 请求：

- `/api/auth/me`
- `/api/v1/platform/overview`
- `/api/v1/tasks/today`
- `/api/v1/activity/recent`

脚本不会调用登录、注册、上传、签到、领奖、种植、收获、战斗或其他写接口。因此它不需要仓库或线上密钥，也不会自动制造测试账号。

正式容量验收前，应在隔离数据库中准备 4000 个合成用户及与线上分布相近的档案、任务、活动和资产记录，再从中选 1000 个用户生成短期测试令牌。不要复制真实用户密码或正文到压测环境。缺少 4000 用户的数据基数时，测试只能证明请求并发，不能证明目标数据量下的查询性能。

## 3. 通过标准

k6 内置阈值会使不合格运行返回非零退出码：

| 指标 | 门槛 |
|---|---|
| 所有检查成功率 | `> 99.5%` |
| 整体 HTTP 失败率 | `< 1%` |
| 公开页面失败率 | `< 0.5%` |
| 公开页面延迟 | `p95 < 500ms`，`p99 < 1000ms` |
| 已登录只读 API 失败率 | `< 1%` |
| 已登录只读 API 延迟 | `p95 < 800ms`，`p99 < 1500ms` |
| 静态资源失败率（启用时） | `< 0.5%` |
| 静态资源延迟（启用时） | `p95 < 1000ms`，`p99 < 2000ms` |
| 到达率场景丢弃迭代数 | `0` |

服务器侧还必须同时满足：

- 稳态 CPU 平均低于 70%，峰值低于 85%；不能连续节流。
- 内存常驻使用率低于 75%，无 OOM、无持续增长。
- PostgreSQL 连接池使用率低于 70%，无锁等待堆积，慢查询没有随测试时间持续恶化。
- API、Nginx、数据库没有 5xx 连续突发；非专门限流测试中，429 也按失败处理。
- 认证邮件 Outbox 与账号注销租约积压能在峰值结束后 5 分钟内回落到基线；聊天室 Redis 恢复后只读状态可自动解除。

`stable`、`peak` 和 `online` 应各连续通过 3 次。只看平均延迟、只跑一次或在应用服务器本机产生流量，都不能作为正式容量验收。

## 4. 安全默认值

脚本有三层防误打机制：

1. 不传参数时只访问 `http://127.0.0.1:8080`，并使用 `smoke`。
2. 任何非本机目标都必须显式设置 `ALLOW_REMOTE=1`。
3. 已知生产域名还必须额外设置 `ALLOW_PRODUCTION=I_ACCEPT_PRODUCTION_LOAD`。

生产压测应是有维护窗口、有实时监控、有停止人和回滚方案的变更。优先使用独立压测环境；不要把测试令牌提交到 Git，也不要把压测器和被测应用放在同一台服务器。

## 5. 运行命令

要求本机安装 k6。所有命令从仓库根目录执行。

### 5.1 本机烟测

```bash
mkdir -p loadtest/results
k6 run --summary-export loadtest/results/smoke.json \
  loadtest/k6/capacity.mjs
```

PowerShell：

```powershell
New-Item -ItemType Directory -Force loadtest/results | Out-Null
$env:PROFILE = "smoke"
$env:BASE_URL = "http://127.0.0.1:8080"
k6 run --summary-export loadtest/results/smoke.json loadtest/k6/capacity.mjs
```

### 5.2 隔离环境 400 RPS 与 800 RPS

```bash
BASE_URL=https://loadtest.example.test ALLOW_REMOTE=1 PROFILE=stable \
  k6 run --summary-export loadtest/results/stable.json \
  loadtest/k6/capacity.mjs

BASE_URL=https://loadtest.example.test ALLOW_REMOTE=1 PROFILE=peak \
  k6 run --summary-export loadtest/results/peak.json \
  loadtest/k6/capacity.mjs
```

PowerShell：

```powershell
$env:BASE_URL = "https://loadtest.example.test"
$env:ALLOW_REMOTE = "1"
$env:PROFILE = "stable"
k6 run --summary-export loadtest/results/stable.json loadtest/k6/capacity.mjs

$env:PROFILE = "peak"
k6 run --summary-export loadtest/results/peak.json loadtest/k6/capacity.mjs
```

### 5.3 加入认证只读流量

令牌文件必须来自隔离环境的专用测试账号。支持两种 JSON 格式：

```json
[
  "jwt-for-test-user-0001",
  "jwt-for-test-user-0002"
]
```

或：

```json
{
  "tokens": [
    { "token": "jwt-for-test-user-0001" },
    { "token": "jwt-for-test-user-0002" }
  ]
}
```

文件建议放在 `loadtest/secrets/auth.tokens.json`；该目录和 `*.tokens.json` 已被忽略。使用绝对路径可避免不同 k6 启动目录的路径差异：

```powershell
$env:AUTH_TOKENS_FILE = (Resolve-Path loadtest/secrets/auth.tokens.json).Path
$env:AUTH_SHARE = "0.30"
$env:PROFILE = "stable"
k6 run --summary-export loadtest/results/stable-auth.json loadtest/k6/capacity.mjs
```

`online` 档位在启用认证流量时默认要求至少 1000 个唯一令牌，保证每个 VU 可以对应独立测试账号。只有诊断共享账号热点时才允许设置 `ALLOW_TOKEN_REUSE=1`。

### 5.4 1000 活跃会话

```powershell
$env:PROFILE = "online"
k6 run --summary-export loadtest/results/online-1000.json loadtest/k6/capacity.mjs
```

结束后清理当前 PowerShell 会话中的敏感变量：

```powershell
Remove-Item Env:AUTH_TOKENS_FILE -ErrorAction SilentlyContinue
Remove-Item Env:AUTH_SHARE -ErrorAction SilentlyContinue
```

### 5.5 办公室乐斗、游戏冷启动与静态带宽

k6 是 HTTP 压测器，不会像浏览器一样解析 SPA 并自动下载懒加载交互包。只请求 `/ledou`、`/games/tetris` 等页面时测到的是 HTML Shell，不代表办公室乐斗或游戏的 JS/CSS/图片冷启动已经被覆盖。

应从**与被测环境完全相同的构建产物**生成资源路径清单。下面的 PowerShell 示例从本地 `dist/assets` 生成 JSON；远端环境必须使用其实际部署产物，不能复用旧版本哈希：

```powershell
$assetRoot = (Resolve-Path packages/frontend/dist/assets).Path
$assets = Get-ChildItem $assetRoot -File -Recurse | ForEach-Object {
  $relative = [IO.Path]::GetRelativePath($assetRoot, $_.FullName).Replace('\', '/')
  "/assets/$relative"
}
@{ assets = $assets } |
  ConvertTo-Json -Depth 3 |
  Set-Content -Encoding UTF8 loadtest/secrets/assets.paths.json
```

在峰值测试中抽取 35% 的公开请求下载静态资源：

```powershell
$env:ASSET_PATHS_FILE = (Resolve-Path loadtest/secrets/assets.paths.json).Path
$env:ASSET_SHARE = "0.35"
$env:PROFILE = "peak"
k6 run --summary-export loadtest/results/peak-assets.json loadtest/k6/capacity.mjs
```

该场景验证源站/CDN 的静态吞吐，但不会模拟浏览器并行下载、解析与渲染。办公室乐斗和游戏的真实首屏体验还应使用浏览器性能测试单独验收 LCP、JS 下载/解析时间和缓存命中；1000 用户集中冷启动时，首先关注 CDN 回源率和出口带宽，而不是业务 API。

## 6. 目标部署拓扑

当前单机部署适合功能上线和小流量验证，不应在未经实测时直接宣称可承载 1000 同时在线。面向本容量目标，按以下顺序演进：

1. 静态资源接 CDN，并为带哈希资源设置长期缓存；让公开页面资源不重复占用 API 和源站带宽。
2. API 保持无状态，部署至少 2 个实例并放在负载均衡后；发布时至少保留 1 个健康实例。
3. PostgreSQL 使用独立实例或托管服务，连接池总额必须小于数据库 `max_connections`，至少保留 20% 给迁移、运维和故障恢复。
4. Redis 只承担聊天室广播、在线状态和可重建的实时协调；账号、内容、关系与游戏资产仍以 PostgreSQL 为唯一真源。
5. 认证邮件服务、内容审核服务和社交核验服务使用独立 HTTPS Provider，并分别设置超时、熔断与失败关闭策略。
6. 压测器使用独立机器；800 RPS 或 1000 VU 若出现压测器 CPU 饱和，应拆成两个 k6 节点后再判断服务端容量。

首轮资源可以从“2 个 API 实例 + 独立 PostgreSQL + Redis + CDN/COS”开始，具体 CPU、内存和连接池数量以 `stable`/`peak` 数据决定，不按用户数拍脑袋定值。

认证邮件与账号注销补偿扩展为多实例前，先在真实 PostgreSQL 上完成租约竞争、超时接管和幂等回放测试；社区部署禁止重新接入遗留 `main.worker.js` / `ActivityProjector`。

## 7. 监控与扩容触发器

上线前至少建立以下面板和告警：

- 边缘/Nginx：RPS、状态码、p50/p95/p99、上游连接与带宽。
- API：每路由延迟/错误、进程 CPU/内存、事件循环延迟、实例重启次数。
- PostgreSQL：活跃连接、连接等待、TPS、锁等待、慢查询、缓存命中率、磁盘与 WAL 增长。
- 后台补偿：认证邮件待处理数/最老年龄/重试，账号注销到期数/租约超时/匿名化失败数。
- 聊天室：WebSocket 连接数、订阅数、发送拒绝率、Redis 重连、广播延迟与在线状态档位查询耗时。
- 主机：CPU、内存、磁盘使用率、inode、网络与容器重启。

满足任一条件就进入扩容或优化评审：

- 连续 10 分钟 p95 超过门槛，或 5xx 超过 0.5%。
- API CPU 连续 10 分钟超过 70%，或内存超过 75%。
- 数据库连接池连续 5 分钟超过 70%，或出现稳定锁等待。
- 认证邮件最老待处理记录超过 60 秒且持续增长，或到期注销任务持续无法取得租约。
- 400 RPS 稳态无法保留至少 30% CPU/连接池余量。

优先顺序是：确认慢查询和缓存命中 → 横向增加无状态 API → 调整数据库资源/索引 → 拆分真正存在独立瓶颈的模块。首期不因 4000 个用户提前拆微服务。

## 8. 发布与演练节奏

- 每次影响查询路径、数据库结构、缓存、Nginx 或容器资源的版本，至少执行 `smoke`。
- 上线前执行 `stable`；重要活动或流量预期变化前执行 `peak` 和 `online`。
- 每月执行一次 2 小时 soak、备份恢复和单实例故障演练。
- 保留 k6 JSON 摘要、应用版本 SHA、镜像标签、环境规格和监控截图，才能比较容量趋势。
- 任一阈值失败时停止放量；先定位服务端或压测器瓶颈，再重复同一档位，不通过降低请求混合掩盖问题。
