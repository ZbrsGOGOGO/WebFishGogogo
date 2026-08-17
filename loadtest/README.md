# WebFish 负载测试

本目录提供面向 4000 个注册用户、1000 个同时在线用户的 k6 基线。脚本默认只访问 `http://127.0.0.1:8080`，默认配置是 2 RPS、30 秒的烟测，不会自行访问线上环境，也不会注册用户或执行写操作。

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

认证流量是可选项。提供 `AUTH_TOKENS_FILE` 后，脚本会从外部 JSON 文件读取测试环境 JWT，并按 `AUTH_SHARE` 将总 RPS 拆分为公开页面和只读认证接口；总 RPS 不会因启用认证场景而增加。还可通过 `ASSET_PATHS_FILE` 加入与当前构建一致的 JS/CSS/图片路径，覆盖游戏首次加载的静态带宽。令牌、结果文件与 `loadtest/secrets/` 都已被本目录的 `.gitignore` 排除。
