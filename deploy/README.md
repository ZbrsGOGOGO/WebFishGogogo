# 部署导航

当前网站「摸摸公司」使用 **community 模式**。已运行站点的维护、发布和回滚请先阅读 [社区部署手册](COMMUNITY_DEPLOYMENT.md)，不要直接使用仓库根目录的旧 full Compose。

## 当前生产基线

以下是最近一次应用发布的已验收记录，不是仓库最新文档提交号：

| 项目 | 已确认值 |
| --- | --- |
| 生产应用 | `f46a765271a55d5708c6f6e0299c149b4183ef11`，2026-09-09 21:54:52（北京时间）上线 |
| 数据库 | schema35，最新迁移 `1700000000035`；36 条迁移历史、146 张 public 表 |
| 该次发布范围 | 仅 API / Web；无迁移，PostgreSQL / Redis / 网关及数据卷保持不变 |
| 应用回滚基线 | `ff6bab4ae5aa68a14f0de0204dbd34b9eb822a82`；保留 schema35 和全部数据 |
| 实际验收证据 | [Paper v2 发布记录](../docs/RELEASE_PAPER_V2_20260909.md) |

**2026-09-10 的 GitHub 主分支与文档整理以已上线的 f46a765 为应用代码基线，不需要重新部署。** Git 分支、文档提交和运行镜像是不同状态；不能因为整理 `main` 就改 `IMAGE_TAG`、重启容器或重跑迁移，也不能据此宣称生产 checkout 已切换到 `main`。后续应用发布须重新核对实际生产状态。

## 按用途选择文档

| 用途 | 入口 | 边界 |
| --- | --- | --- |
| 当前 community 站点更新、回滚、新站初始化 | [COMMUNITY_DEPLOYMENT.md](COMMUNITY_DEPLOYMENT.md) | 优先使用；已运行站点与空站初始化分开执行 |
| 当前 Compose 与环境变量样例 | [docker-compose.community.yml](docker-compose.community.yml)、[.env.community.example](.env.community.example) | 样例只用于新环境；不得覆盖生产环境文件 |
| 静态发布预检 / 指定范围烟测 | [community-preflight.sh](community-preflight.sh)、[community-smoke.sh](community-smoke.sh) | 预检不是部署；烟测含请求限流探针，不能当作纯只读巡检或全站验收 |
| 上一批 schema32 → schema35 发布背景 | [协作补齐发布记录](../docs/RELEASE_COMPLETION_20260909.md) | 历史证据；不是要求再次迁移、授权或发放 VIP |
| 旧 review / public 发布模式 | [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md)、[PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md) | 独立模式，不与 community 混用环境、项目或数据卷 |
| 旧 full 单机部署 / 文档卷备份恢复 | [LEGACY_DEPLOYMENT.md](LEGACY_DEPLOYMENT.md) | 历史参考，不能在现有 community 生产站照搬 |

所有环境文件、密钥、数据库备份、真实用户附件和私有验收材料均不进入 Git。应用发布前必须保留可验证备份与明确回滚版本；仅文档整理不触发生产操作。
