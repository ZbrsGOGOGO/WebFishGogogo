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


FROM dependencies AS review-build

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
    VITE_SITE_MODE=review \
    VITE_SITE_NAME=${VITE_SITE_NAME} \
    VITE_SITE_DOMAIN=${VITE_SITE_DOMAIN} \
    VITE_ICP_BEIAN_NUMBER=${VITE_ICP_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_NUMBER=${VITE_PUBLIC_SECURITY_BEIAN_NUMBER} \
    VITE_PUBLIC_SECURITY_BEIAN_URL=${VITE_PUBLIC_SECURITY_BEIAN_URL}

RUN test -n "$VITE_SITE_DOMAIN" \
    && npm run build --workspace @stealth-reader/shared \
    && npm run build --workspace @stealth-reader/frontend \
    && ! grep -R -E '创建本机账户|俄罗斯方块|/api/auth/register' packages/frontend/dist \
    && ! grep -R -E '审核|上线准备|暂未开放|网站主办者|联系渠道' packages/frontend/dist


FROM nginx:1.30.4-alpine AS review-web

COPY deploy/review.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=review-build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80
