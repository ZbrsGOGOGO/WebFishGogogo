# 合规审核版部署

审核版是独立的纯静态站点，只公开站点介绍、隐私政策、服务条款和备案状态。它不会启动数据库或业务 API，也不会开放注册、登录、上传、游戏和互动功能。

> 如果服务器位于中国大陆且 ICP 备案尚未通过，只应在接入服务商或审核机构明确要求网站可访问时开放域名。不要填写虚假备案号，也不要把“审核版”当作规避备案或专项许可的方式。

## 1. 准备真实信息

```bash
cp deploy/.env.review.example .env.review
chmod 600 .env.review
```

编辑 `.env.review`：

- `IMAGE_TAG`：当前 Git 提交 SHA；
- `SITE_DOMAIN`：不带协议和路径的真实域名；
- `ACME_EMAIL`：用于 HTTPS 证书到期通知的有效邮箱；
- `ICP_BEIAN_NUMBER`：未取得时留空，取得后填写真实编号；
- 公安联网备案信息：取得编号和官方查询链接后成对填写。

## 2. 预检并启动

```bash
sh deploy/review-preflight.sh .env.review
docker compose -f deploy/docker-compose.review.yml --env-file .env.review build
docker compose -f deploy/docker-compose.review.yml --env-file .env.review up -d
docker compose -f deploy/docker-compose.review.yml --env-file .env.review ps
docker compose -f deploy/docker-compose.review.yml --env-file .env.review logs --tail=100 gateway
curl -fsS http://127.0.0.1:8080/healthz
curl -i http://127.0.0.1:8080/api/health
```

健康检查应返回 `status: ok`，业务 API 应返回 `404`。

## 3. 接入域名与 HTTPS

编排会使用 Caddy 自动申请并续期 HTTPS 证书，公开 80/443，同时保留仅本机可访问的 `127.0.0.1:8080` 健康检查入口。服务器安全组只需开放 SSH、80 和 443，不要公开 8080。

上线后从公网检查真实域名的首页、公开工具、隐私政策、服务条款、HTTPS 证书、HTTP 跳转、`www` 跳转和备案状态；并确认 `/api/`、`/login`、`/register`、`/games`、`/library` 均无法使用。

审核通过且具备正式开放条件后，再停止审核版并按照 `deploy/README.md` 启动完整服务。正式站公开后，应按实际功能及时更新政策、备案信息和必要的安全管理措施。
