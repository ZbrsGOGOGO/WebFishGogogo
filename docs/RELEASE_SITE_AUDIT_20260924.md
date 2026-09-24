# 2026-09-24 站点审核优化发布记录

## 交付边界

- GitHub `main` 应用提交、生产 API/Web 源码与镜像标签：`b0bedd6b58ad7ef554aa87e561e947c5b718d3b5`。
- 反馈总状态保持原有 `done` 存储值；只从可信离线完成审计投影 `owner_closed` / `verified_release` 展示标签。9 月 23 日反馈 `0e8d0f8d-33f0-4a73-8f33-0b8040eecfaf` 为 `done v2`，审计 `owner_closed`，显示“已归档”且不表示附件全部实现。
- 手机游戏目录折叠次要说明、首屏露出搜索、分类不再横向隐藏；桌面和手机仍使用原 27 个入口、相同玩法及奖励规则。2048 随站点深浅主题着色；公开文案改为“轻量工作台 · 休闲社区”。
- 登录页始终提供“忘记密码？”帮助入口。**生产在线找回仍未启用**：`FEATURE_PASSWORD_RESET_ENABLED=false`；当前入口通向明确说明及站点联系渠道，不能称作邮件重置已上线。已有后端重置逻辑、限流、一次性令牌、会话撤销及前端表单通过测试，但真实邮件模板/送达尚无验证，待站长提供可查收的测试邮箱再独立开启。
- 没有新增迁移、改变账号权限、办公币规则、游戏进度或数据清理。API 切换会中断内存临时房间。

## 验证

- 完整 `npm test` 通过；前端 224 文件、1962 测试，后端完整套件通过。最终定向复跑后台 20、前端 31 测试通过；`npm run typecheck`、`npm run build`、`git diff --check` 通过。
- 本地浏览器 390px 暗色目录及 2048 棋盘目视复核；上线后重新检查相同页面、目录 27 项、登录帮助链接、页脚文案。
- 生产候选 Compose 预检及 `config -q` 通过。旧/新 API 镜像均含相同 42 条迁移，迁移名称 SHA-256 相同；未执行迁移。生产上线后迁移 42 条、用户 14、反馈 35，健康与就绪正常。
- 发布前限权备份 `/opt/webfish-backups/site-audit-20260924.7aqZ0T` 含环境、镜像/卷清单、Git bundle、PostgreSQL dump 和 Redis RDB，SHA-256 清单逐项通过。新鲜 dump 在无网络 PostgreSQL 16.14 中完整恢复为 42 条迁移、151 张表、0 个未验证约束。离站 AES-256 加密副本解密后与远端归档 SHA-256 `482ade2297ab2ff9e26efba247cf29f19344e89ec24d6e828415385771fbde92` 一致，密钥与归档分开限权保存。
- 上线匿名 HTTP：`/`、`/games`、`/tools`、`/login`、`/password/forgot`、`/games/office-2048`、`/healthz`、`/api/health`、`/api/health/ready` 均 200；未登录开发反馈和聊天室接口均 401。未使用真实账号做发帖、聊天、房间、钱包或实际邮箱送达测试，不将这些场景冒充已验收。

## 镜像与回退

| 范围 | 发布前 | 发布后 |
| --- | --- | --- |
| API | `2381528a50a9a3de013d3907a2427501fa00a2a7` / `sha256:34fad6d3c1c6f8d2824ea88297814ce9f8817bbdfb3d72e13962e52c46038041` | `b0bedd6b58ad7ef554aa87e561e947c5b718d3b5` / `sha256:1ff63855f260fe5d379a9a3387cf546944b94cae4c1977334678d5dd89ea3453` |
| Web | `b575bf43987a1c00e4143a6cf4a23d9aa90e2de1` / `sha256:990ecd3beeaec278a8cbff2a561dd2868c2642245706c76e0f47e285f56e542f` | `b0bedd6b58ad7ef554aa87e561e947c5b718d3b5` / `sha256:f484ae7ed9b00b0c8bf357dc58f1a3fbe5c1c0bf5f3677d61f17d7462bb28d05` |

只更改 `.env.community` 的 `IMAGE_TAG`；找回密码开关及其他环境字段不变。回退时先恢复本批完整旧环境和上述旧 API/Web 镜像，按 `--no-deps --no-build --pull never --force-recreate --wait` 仅依次切 API/Web，保留 schema41、全部玩家数据、PostgreSQL/Redis/Gateway 容器与数据卷；不运行 DOWN、旧库回灌或全栈重建。回退也会结束内存临时房间。此预案未执行。
