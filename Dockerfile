# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim AS dependencies

WORKDIR /app

# 先复制清单文件，源码变化时仍可复用依赖缓存。
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json

RUN npm ci


FROM dependencies AS build

COPY tsconfig.base.json ./
COPY packages ./packages

# 生产环境由同源 Nginx 代理 /api，避免把域名写死在前端产物中。
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_SITE_MODE=full
ARG VITE_SITE_NAME="ZBRS 技术工具工坊"
ARG VITE_SITE_OPERATOR=
ARG VITE_SITE_CONTACT=
ARG VITE_SITE_DOMAIN=
ARG VITE_ICP_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_URL=
ENV VITE_SITE_MODE=${VITE_SITE_MODE} \
    VITE_SITE_NAME=${VITE_SITE_NAME} \
    VITE_SITE_OPERATOR=${VITE_SITE_OPERATOR} \
    VITE_SITE_CONTACT=${VITE_SITE_CONTACT} \
    VITE_SITE_DOMAIN=${VITE_SITE_DOMAIN} \
    VITE_ICP_BEIAN_NUMBER=${VITE_ICP_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_NUMBER=${VITE_PUBLIC_SECURITY_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_URL=${VITE_PUBLIC_SECURITY_BEIAN_URL}

RUN npm run build --workspace @stealth-reader/shared \
    && npm run build --workspace @stealth-reader/backend \
    && npm run build --workspace @stealth-reader/frontend \
    && npm prune --omit=dev


FROM node:24.18.0-bookworm-slim AS api

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --shell /usr/sbin/nologin --create-home app \
    && install -d -o app -g app /app/data

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=app:app /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build --chown=app:app /app/packages/backend/dist ./packages/backend/dist

USER app

EXPOSE 3000

CMD ["node", "packages/backend/dist/main.js"]


FROM nginx:1.30.4-alpine AS web

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80


FROM dependencies AS site-build-base

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

ARG VITE_API_BASE_URL=/api
ARG VITE_SITE_NAME="ZBRS 技术工具工坊"
ARG VITE_SITE_DOMAIN=
ARG VITE_ICP_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SITE_NAME=${VITE_SITE_NAME} \
    VITE_SITE_DOMAIN=${VITE_SITE_DOMAIN} \
    VITE_ICP_BEIAN_NUMBER=${VITE_ICP_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_NUMBER=${VITE_PUBLIC_SECURITY_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_URL=${VITE_PUBLIC_SECURITY_BEIAN_URL}

RUN printf '%s\n' "$VITE_SITE_DOMAIN" | grep -Eq '[^[:space:]]' \
    && npm run build --workspace @stealth-reader/shared


FROM site-build-base AS review-build

ARG VITE_SITE_MODE=review
ENV VITE_SITE_MODE=${VITE_SITE_MODE}

RUN test "$VITE_SITE_MODE" = review \
    && npm run build --workspace @stealth-reader/frontend \
    && ! grep -R -E '审核|上线准备|暂未开放|网站主办者|联系渠道' packages/frontend/dist \
    && ! grep -R -E '创建本机账户|方块消除|/api/auth/register' packages/frontend/dist


FROM site-build-base AS public-build

ARG VITE_SITE_MODE=public
ARG VITE_SITE_OPERATOR=
ARG VITE_SITE_CONTACT=
ARG PUBLIC_GAME_CLEARANCE_REFERENCE=
ENV VITE_SITE_MODE=${VITE_SITE_MODE} \
    VITE_SITE_OPERATOR=${VITE_SITE_OPERATOR} \
    VITE_SITE_CONTACT=${VITE_SITE_CONTACT}

RUN test "$VITE_SITE_MODE" = public \
    && printf '%s\n' "$VITE_SITE_OPERATOR" | grep -Eq '[^[:space:]]' \
    && printf '%s\n' "$VITE_SITE_CONTACT" | grep -Eq '(^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$)|(^https://[^[:space:]]+$)|(^\+?[0-9][0-9[:space:]-]{6,19}$)' \
    && printf '%s\n' "$PUBLIC_GAME_CLEARANCE_REFERENCE" | grep -Eq '[^[:space:]]' \
    && ! printf '%s\n' "$PUBLIC_GAME_CLEARANCE_REFERENCE" | grep -Eiq 'ICP' \
    && npm run build --workspace @stealth-reader/frontend \
    && ! grep -R -E '审核|上线准备|暂未开放|网站主办者|联系渠道' packages/frontend/dist \
    && ! grep -R -E '创建本机账户|/api/auth|/api/v1|午休竞技场|比大小|用户自行上传|成长农场' packages/frontend/dist \
    && grep -R -q '方块消除' packages/frontend/dist \
    && grep -R -q '贪食蛇' packages/frontend/dist \
    && grep -R -q '办公室乐斗' packages/frontend/dist \
    && grep -R -q '人力资源管理' packages/frontend/dist \
    && grep -R -q '常规访问日志保存期限为 0 天' packages/frontend/dist


FROM nginx:1.30.4-alpine AS review-web

COPY deploy/review.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=review-build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80


FROM nginx:1.30.4-alpine AS public-web

COPY deploy/public.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=public-build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80


# 社区版与 full/public/review 隔离构建。它只允许由 community router 引入的
# 前端能力，并要求后端产出独立的 main.community.js 入口。
FROM dependencies AS community-build

COPY tsconfig.base.json ./
COPY packages ./packages

ARG VITE_API_BASE_URL=/api
ARG VITE_SITE_MODE=community
ARG VITE_SITE_NAME="ZBRS 技术工具工坊"
ARG VITE_SITE_OPERATOR=
ARG VITE_SITE_CONTACT=
ARG VITE_SITE_DOMAIN=
ARG VITE_ICP_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_NUMBER=
ARG VITE_PUBLIC_SECURITY_BEIAN_URL=
ARG PUBLIC_GAME_CLEARANCE_REFERENCE=
ARG VITE_COMMUNITY_REGISTRATION_ENABLED=false
ARG VITE_COMMUNITY_PASSWORD_RESET_ENABLED=false
ARG VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED=false
ARG VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED=false
ARG VITE_COMMUNITY_PROFILE_ENABLED=true
ARG VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED=false
ARG VITE_COMMUNITY_FRIENDS_ENABLED=false
ARG VITE_COMMUNITY_INVITE_ENABLED=false
ARG VITE_COMMUNITY_FEED_ENABLED=false
ARG VITE_COMMUNITY_FARM_ENABLED=false
ARG VITE_COMMUNITY_CONTENT_ENABLED=false
ARG VITE_COMMUNITY_MODERATION_ENABLED=false
ARG VITE_COMMUNITY_CHAT_ENABLED=false
ARG VITE_COMMUNITY_NEWS_ENABLED=false
ARG VITE_COMMUNITY_NEWS_ADMIN_ENABLED=false
ARG VITE_COMMUNITY_LEDOU_ENABLED=true
ARG VITE_COMMUNITY_BATTLE_SERVER_ENABLED=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SITE_MODE=${VITE_SITE_MODE} \
    VITE_SITE_NAME=${VITE_SITE_NAME} \
    VITE_SITE_OPERATOR=${VITE_SITE_OPERATOR} \
    VITE_SITE_CONTACT=${VITE_SITE_CONTACT} \
    VITE_SITE_DOMAIN=${VITE_SITE_DOMAIN} \
    VITE_ICP_BEIAN_NUMBER=${VITE_ICP_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_NUMBER=${VITE_PUBLIC_SECURITY_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_URL=${VITE_PUBLIC_SECURITY_BEIAN_URL} \
    VITE_COMMUNITY_REGISTRATION_ENABLED=${VITE_COMMUNITY_REGISTRATION_ENABLED} \
    VITE_COMMUNITY_PASSWORD_RESET_ENABLED=${VITE_COMMUNITY_PASSWORD_RESET_ENABLED} \
    VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED=${VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED} \
    VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED=${VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED} \
    VITE_COMMUNITY_PROFILE_ENABLED=${VITE_COMMUNITY_PROFILE_ENABLED} \
    VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED=${VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED} \
    VITE_COMMUNITY_FRIENDS_ENABLED=${VITE_COMMUNITY_FRIENDS_ENABLED} \
    VITE_COMMUNITY_INVITE_ENABLED=${VITE_COMMUNITY_INVITE_ENABLED} \
    VITE_COMMUNITY_FEED_ENABLED=${VITE_COMMUNITY_FEED_ENABLED} \
    VITE_COMMUNITY_FARM_ENABLED=${VITE_COMMUNITY_FARM_ENABLED} \
    VITE_COMMUNITY_CONTENT_ENABLED=${VITE_COMMUNITY_CONTENT_ENABLED} \
    VITE_COMMUNITY_MODERATION_ENABLED=${VITE_COMMUNITY_MODERATION_ENABLED} \
    VITE_COMMUNITY_CHAT_ENABLED=${VITE_COMMUNITY_CHAT_ENABLED} \
    VITE_COMMUNITY_NEWS_ENABLED=${VITE_COMMUNITY_NEWS_ENABLED} \
    VITE_COMMUNITY_NEWS_ADMIN_ENABLED=${VITE_COMMUNITY_NEWS_ADMIN_ENABLED} \
    VITE_COMMUNITY_LEDOU_ENABLED=${VITE_COMMUNITY_LEDOU_ENABLED} \
    VITE_COMMUNITY_BATTLE_SERVER_ENABLED=${VITE_COMMUNITY_BATTLE_SERVER_ENABLED}

RUN test "$VITE_SITE_MODE" = community \
    && printf '%s\n' "$VITE_SITE_DOMAIN" | grep -Eq '[^[:space:]]' \
    && printf '%s\n' "$PUBLIC_GAME_CLEARANCE_REFERENCE" | grep -Eq '[^[:space:]]' \
    && ! printf '%s\n' "$PUBLIC_GAME_CLEARANCE_REFERENCE" | grep -Eiq 'ICP' \
    && npm run build --workspace @stealth-reader/shared \
    && npm run build --workspace @stealth-reader/backend \
    && test -f packages/backend/dist/main.community.js \
    && npm run build --workspace @stealth-reader/frontend \
    && test -f packages/frontend/dist/index.html \
    && npm prune --omit=dev


FROM node:24.18.0-bookworm-slim AS community-api

ENV NODE_ENV=production \
    APP_MODE=community \
    PORT=3000

WORKDIR /app

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --shell /usr/sbin/nologin --create-home app \
    && install -d -o app -g app /app/data

# npm workspace prune can remove runtime dependencies that live under a
# workspace manifest. Copy the verified install layer so the API always keeps
# its NestJS/TypeORM runtime graph; the container still runs as the unprivileged
# app user and exposes only the compiled community entrypoint.
COPY --from=dependencies --chown=app:app /app/node_modules ./node_modules
COPY --from=dependencies --chown=app:app /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=community-build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=community-build --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=community-build --chown=app:app /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=community-build --chown=app:app /app/packages/backend/dist ./packages/backend/dist

USER app

EXPOSE 3000

CMD ["node", "packages/backend/dist/main.community.js"]


FROM nginx:1.30.4-alpine AS community-web

COPY deploy/community.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=community-build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80
