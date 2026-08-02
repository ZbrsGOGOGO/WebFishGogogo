# 单机生产部署

这套部署面向一台 2 核 4 GB Linux 服务器。应用镜像使用 Node.js 24 LTS，Web 容器固定使用已修复当前安全公告的 Nginx stable。PostgreSQL、API 和 Worker 均在 Docker 内网；阅读正文写入 API 专用持久卷。首次启动会先执行 TypeORM 迁移，再启动 API、异步 Worker 和前端。

## 1. 服务器准备

建议使用 Ubuntu 22.04/24.04 或同类 64 位 Linux，并安装 Docker Engine 与 Docker Compose v2.20 或更高版本。防火墙只开放 SSH、HTTP；接入 HTTPS 后再开放 443。

```bash
docker --version
docker compose version
git clone https://github.com/ZbrsGOGOGO/WebFishGogogo.git
cd WebFishGogogo
cp deploy/.env.example .env.production
```

编辑 `.env.production`，把 `IMAGE_TAG` 填为当前 Git commit SHA（可使用 7–40 位十六进制短 SHA），并为 `JWT_SECRET` 和 `DB_PASSWORD` 设置两个独立强密钥。示例文件把这些项留空，未填写时部署会直接失败。可以分别使用下面的命令生成随机值：

```bash
openssl rand -hex 20
chmod 600 .env.production
sh deploy/preflight.sh .env.production
```

预检会拒绝空值、公开占位值、不安全长度、可变镜像标签、非回环 HTTP 绑定和无法渲染的 Compose 配置，但不会打印密钥。`.env.production` 已被仓库的 `.gitignore` 规则覆盖，不要提交生产密钥。

## 2. 构建并启动

```bash
sh deploy/preflight.sh .env.production
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps --all
```

`migrate` 是一次性服务，成功退出（`Exited (0)`）属于正常状态。默认只监听宿主机回环地址；检查入口、进程存活与依赖就绪状态：

```bash
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose --env-file .env.production logs --tail=100 api worker web
```

此时站点还不能通过服务器 IP 直接访问，这是有意的安全默认值。PostgreSQL 和 Nest API 没有映射宿主机端口，文档正文卷也不会对外暴露；完成下一节的域名与 HTTPS 配置后再开放公网访问。

## 3. 域名与 HTTPS

当前容器内 Nginx 提供 HTTP。生产域名建议在宿主机或云负载均衡层终止 TLS：

1. 保持 `.env.production` 中 `HTTP_BIND=127.0.0.1`、`HTTP_PORT=8080`；生产预检会拒绝把容器 HTTP 入口直接绑定公网。
2. 用宿主机 Caddy/Nginx 将 `https://你的域名` 反向代理到 `http://127.0.0.1:8080`，配置证书自动续期与 HSTS。宿主机代理必须覆盖（而不是继承客户端提交的）`X-Forwarded-For`，例如 Nginx 使用 `proxy_set_header X-Forwarded-For $remote_addr;`；容器内会据此对登录和注册接口限流。
3. 云安全组仅开放 22、80、443，不要开放 3000 或 5432。

前后端同域时无需配置 `CORS_ORIGIN`。若另有前端域名直连 API，再将其完整 Origin 写入该变量。

## 4. 更新与回滚

发布前把 `IMAGE_TAG` 改成 Git commit SHA，便于识别版本：

```bash
git pull --ff-only
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$(git rev-parse --short HEAD)/" .env.production
sh deploy/preflight.sh .env.production
QUIESCE=true ENV_FILE=.env.production sh deploy/backup.sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps --all
curl -fsS http://127.0.0.1:8080/api/health/ready
```

每次启动都会先执行尚未运行的数据库迁移。应用镜像可以切回旧标签，但数据库迁移未必可逆；回滚前先恢复已验证备份，不要直接删除持久卷。当前为单机停机发布，没有自动灰度或自动回滚。

## 5. 备份与日常运维

一致性备份（默认短暂停止 Web/API/Worker，避免 PostgreSQL 元数据和文档正文跨存储错位）：

```bash
QUIESCE=true ENV_FILE=.env.production BACKUP_ROOT=/srv/webfish-backups \
  sh deploy/backup.sh
```

每个快照包含 PostgreSQL 自定义格式 dump、压缩后的文档正文卷、版本元数据和 `SHA256SUMS`。`backups/` 已排除在 Git 与 Docker 构建上下文之外。本机备份不是灾备；必须再同步到异机或云存储，并设置保留周期。

恢复会重建业务数据库并清理文档正文卷，必须先另做当前状态备份，并显式确认：

```bash
ENV_FILE=.env.production sh deploy/restore.sh \
  --confirm-restore /srv/webfish-backups/20260726T120000Z

curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose --env-file .env.production logs --tail=100 api worker web
```

恢复脚本先校验 SHA-256，并拒绝包含越界路径、链接或特殊文件的正文归档；随后停止写入进程、完整重建 PostgreSQL 业务库、恢复文档卷、修正卷权限、补跑迁移，并等待 API 的数据库/存储就绪探针通过后才报告成功。任一步骤失败时会保持业务服务停止，等待人工检查。

常用命令：

```bash
docker compose --env-file .env.production logs -f --tail=200 api
docker compose --env-file .env.production logs -f --tail=200 worker
docker compose --env-file .env.production restart api worker
docker compose --env-file .env.production down
```

`down` 不会删除数据；不要在生产环境执行 `docker compose down -v`。

## 6. 必须在真实服务器完成

仓库内无法替代以下验收：

- SSH 登录、Docker 权限、磁盘容量和 4 GB 主机上的实际构建峰值；
- 域名解析、TLS 证书、宿主机反向代理、云安全组和防火墙；
- 首次迁移、持久卷重启保留、上传/阅读/签到/农场/竞技场冒烟；
- 定时执行备份、异机复制、保留策略和至少一次隔离环境恢复演练；
- 外部可用性监控、磁盘/内存告警和 Worker 连续失败告警。

`/healthz` 只证明 Nginx 可响应，`/api/health` 只证明 API 进程存活；`/api/health/ready` 会进一步检查 PostgreSQL 和文档卷。Worker 仍需通过容器状态、连续错误日志与积压指标监控。

## 7. 资源说明

Compose 给 PostgreSQL、API、Worker 和 Nginx 设置了总计约 2.2 GB 的常驻内存上限，为 4 GB 服务器预留系统空间。未引入 Redis；PostgreSQL 是业务事实来源，阅读正文保存在独立命名卷。单机卷不具备节点级高可用，因此异机备份仍是上线前的必要条件；未来扩展多台 API 时再把现有存储适配器切换到维护中的 S3 服务。
