# 摸摸公司负载测试

本目录提供面向 4000 个访问用户、1000 个同时在线用户的 k6 基线。脚本默认只访问 `http://127.0.0.1:8080`，默认配置是 2 RPS、30 秒的烟测，不会自行访问线上环境，也不会注册用户或执行写操作。

默认公开流量覆盖首页、`/tower-defense` 摸鱼升职记（工位塔防）页面、11 款工具的目录页、游戏中心、两款单机游戏直达页以及隐私政策和服务条款。k6 只请求公开 HTML Shell 和显式提供的静态资源，不会在浏览器中执行塔防或游戏逻辑；工位塔防只在本机保存最高分与设置，不上传成绩也不提供正式奖励。

完整容量假设、验收阈值、令牌文件格式、执行命令和扩容触发条件见 [`../docs/CAPACITY_4000_USERS.md`](../docs/CAPACITY_4000_USERS.md)。

最小本机验证：

```bash
k6 run loadtest/k6/capacity.mjs
```

可用配置：

| `PROFILE` | 作用 |
|---|---|
| `smoke` | 默认；2 RPS，30 秒 |
| `stable` | 400 RPS，持续 10 分钟 |
| `peak` | 400 RPS 稳态后升至 800 RPS 峰值 |
| `soak` | 400 RPS，持续 30 分钟 |
| `online` | 逐步升至 1000 VU，稳态约 400 RPS |

认证流量是可选项。提供 `AUTH_TOKENS_FILE` 后，脚本会从外部 JSON 文件读取测试环境 JWT，并按 `AUTH_SHARE` 将总 RPS 拆分为公开页面和只读认证接口；总 RPS 不会因启用认证场景而增加。还可通过 `ASSET_PATHS_FILE` 加入与当前构建一致的 JS/CSS/图片路径，覆盖工位塔防和游戏首次加载的静态带宽。令牌、结果文件与 `loadtest/secrets/` 都已被本目录的 `.gitignore` 排除。

## 社区版容量门禁

`capacity.mjs` 只接受 `TARGET_MODE=public`（默认值）。给它设置 `TARGET_MODE=community` 会立即失败；即使遗漏该变量，脚本也会探测社区 Nginx 的 `X-WebFish-Site-Mode: community` 响应头并拒绝运行，因为这个脚本没有社区写请求、消息广播或 WebSocket。

仓库提供了一个故意失败的社区占位门禁：

```bash
k6 run loadtest/k6/community-capacity-gate.mjs
```

在以下内容全部实现并经过评审前，不能删除其 fail-closed 行为，也不能把公开只读脚本的结果写成“社区容量通过”：

- 4000 个合成账号及 PRD 要求的好友、消息和绿植数据基数；已停服的乐斗历史表只验证保留与回滚，不作为工位塔防容量指标；
- 400/800 RPS 的固定混合 HTTP 读写权重；
- 1000 条真实 WebSocket、房间订阅、20/100 消息每秒广播；
- 30% 集中重连、杀单实例、Redis 故障和 ACK 后零丢失验证；
- 2 小时综合 soak、8 小时聊天室内存检查和服务端监控证据；
- 同一隔离环境连续通过三次并保留版本 SHA、配置和原始结果。

社区部署说明见 [`../deploy/COMMUNITY_DEPLOYMENT.md`](../deploy/COMMUNITY_DEPLOYMENT.md)。
