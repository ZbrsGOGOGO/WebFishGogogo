# 正式公开版部署

正式公开版只运行 Caddy 与静态 Web 容器，开放浏览器本地工具和四款单机游戏。它不启动数据库或业务 API，也不开放注册、登录、上传、农场、竞技场、比大小或用户互动功能。

本文面向已经运行审核版的服务器。所有 Compose 命令必须显式使用同一个项目名 `-p webfish-review`：这样会原地替换现有的 `web`、`gateway` 服务，并复用审核版的 Caddy 数据卷和 HTTPS 证书。省略 `-p webfish-review` 会创建另一个 Compose 项目，既无法复用证书卷，也会与现有服务争用 80、443 和 8080 端口。

## 1. 切换前准备

保留现有 `.env.review` 和审核版镜像，不要删除旧镜像或 Caddy 卷。确认当前项目、容器、镜像和卷均符合预期：

```bash
cd /opt/webfish-review
docker compose ls
docker compose -p webfish-review -f deploy/docker-compose.review.yml --env-file .env.review ps --all
docker image ls 'webfish-review:*'
docker volume ls --filter name=webfish-review_caddy
```

从示例创建正式版环境文件：

```bash
cp deploy/.env.public.example .env.public
chmod 600 .env.public
```

编辑 `.env.public`，填写：

- `IMAGE_TAG`：当前干净 Git 提交的完整 40 位 SHA，必须与 `git rev-parse HEAD` 完全一致；
- `SITE_DOMAIN`：不带协议、端口和路径的真实域名；
- `ACME_EMAIL`：仅用于 HTTPS 证书通知的有效邮箱；
- `ICP_BEIAN_NUMBER`：已经取得的真实 ICP 备案号，正式版不允许留空；
- 公安联网备案编号和官方查询地址：尚未取得时两项都留空，取得后成对填写。

不要把 `.env.public`、邮箱或其他服务器配置提交到 Git。发布前确认仓库干净并执行预检：

```bash
git status --short
git rev-parse HEAD
sh deploy/public-preflight.sh .env.public
```

预检会校验正式版部署文件、完整提交 SHA、干净工作区、域名、证书邮箱、ICP 备案号、环境文件权限、Docker 与 Compose 配置；它不会打印邮箱或其他配置值。

## 2. 构建正式版镜像

构建阶段不会切换正在运行的审核站点：

```bash
docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  config -q

docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  build
```

构建必须通过正式版产物门禁。不要在工作区有未提交修改时绕过预检，也不要用可变标签替代提交 SHA。

## 3. 使用原项目原地切换

确认构建成功、旧审核版镜像仍在本机后，再执行：

```bash
docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  up -d

docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  ps --all
```

`up -d` 会按同一项目中的服务名重建 `web` 和必要的 `gateway`，不会删除 `webfish-review_caddy_data`、`webfish-review_caddy_config` 等命名卷。整个切换过程中不要运行 `docker compose down -v`，不要手工删除 Caddy 卷，也不要执行会清理旧镜像或卷的全局 prune。

## 4. 上线验证

先检查容器、本机健康入口和日志：

```bash
docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  ps --all

docker compose \
  -p webfish-review \
  -f deploy/docker-compose.public.yml \
  --env-file .env.public \
  logs --tail=100 web gateway

curl -fsS http://127.0.0.1:8080/healthz
```

健康检查应返回 `{"status":"ok"}`。随后从公网验证正式域名；以下示例使用当前站点域名：

```bash
PUBLIC_SITE_URL=https://zbrshyyzxx.top

for path in \
  / \
  /tools \
  /games \
  /games/snake \
  /games/tetris \
  /games/tank \
  /games/three-sum \
  /privacy-policy \
  /terms-of-service; do
  curl -fsS -o /dev/null -w "%{http_code} ${path}\n" "${PUBLIC_SITE_URL}${path}"
done

for path in \
  /login \
  /register \
  /library \
  /farm \
  /blog \
  /games/arena \
  /games/high-low; do
  curl -sS -o /dev/null -w "%{http_code} ${path}\n" "${PUBLIC_SITE_URL}${path}"
done

curl -sS -o /dev/null -w "%{http_code} /api/health\n" "${PUBLIC_SITE_URL}/api/health"
curl -I http://zbrshyyzxx.top/
curl -I https://www.zbrshyyzxx.top/
```

预期结果：

- 首页、工具、游戏中心、四款游戏、隐私政策和服务条款均返回 `200`；
- `/api/health` 返回 `404`；
- 登录、注册、文档库、农场、博客、竞技场和比大小入口返回 `302`，且没有使用 `curl -L` 跟随跳转；
- HTTP 跳转到 HTTPS，`www` 跳转到主域名，证书有效；
- 页面底部展示真实 ICP 备案号；工具输入和游戏过程只在浏览器内运行。

最后使用桌面端和手机尺寸各完成一次实际操作：打开一个工具、启动四款游戏、刷新游戏深链，并确认页面没有注册、上传、农场或竞技场入口。

也可以运行仓库内置的串行低流量烟测完成上述路由、公开产物与敏感文案检查：

```bash
sh deploy/public-smoke.sh https://zbrshyyzxx.top
```

## 5. 失败回滚

如果正式版容器不健康、公开路由不符合预期或公网验证失败，立即使用保留的 `.env.review` 和审核版 Compose 文件恢复原服务：

```bash
docker compose \
  -p webfish-review \
  -f deploy/docker-compose.review.yml \
  --env-file .env.review \
  up -d

docker compose \
  -p webfish-review \
  -f deploy/docker-compose.review.yml \
  --env-file .env.review \
  ps --all

curl -fsS http://127.0.0.1:8080/healthz
```

回滚依赖旧审核版镜像仍然存在；因此切换前必须确认镜像，切换完成并稳定运行前不得清理旧镜像。回滚后还应从公网检查首页、工具页、HTTPS 和备案号，并确认 `/games`、`/api/`、登录与注册入口仍被阻止。

不要通过删除卷、`docker compose down -v`、`docker volume prune` 或 `docker system prune --volumes` 处理发布失败。Caddy 卷保存证书与续期状态；删除它们既不是应用回滚，也可能导致重新签发证书和额外停机。

## 6. 后续正式版更新

后续发布继续使用 `.env.public`、`deploy/public-preflight.sh`、`deploy/docker-compose.public.yml` 和同一个 `-p webfish-review` 项目名。每次把 `IMAGE_TAG` 更新为新的完整提交 SHA，依次执行预检、构建、`up -d` 和完整路由验证。静态资源接入 CDN 或调整容量参数后，也必须重新执行缓存、带宽和 1000 活跃会话压测，不能仅根据用户总数推断承载能力。
