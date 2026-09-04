import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const siteMode = process.env.VITE_SITE_MODE;
const routerFile =
  siteMode === 'review'
    ? './src/app/review-router.tsx'
    : siteMode === 'public'
      ? './src/app/public-router.tsx'
      : siteMode === 'community'
        ? './src/app/community-router.tsx'
      : './src/app/full-router.tsx';

const siteName = process.env.VITE_SITE_NAME?.trim() || '摸摸公司';
const siteDescription =
  siteMode === 'public'
    ? `${siteName}：办公室主题轻社区，提供可操控角色的工位塔防、浏览器工具与轻量单机游戏。`
    : siteMode === 'community'
      ? `${siteName}：围绕职业经验、工位塔防、工位绿植与好友互动的轻社区。`
    : siteMode === 'review'
      ? `${siteName}：无需注册即可使用的浏览器本地效率工具。`
      : `${siteName}：集私人文档阅读、实用工具、成长农场与单机小游戏于一体的个人工作台。`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function siteMetadataPlugin() {
  return {
    name: 'site-metadata',
    transformIndexHtml(html: string): string {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(siteName)}</title>`)
        .replace(
          /(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/,
          `$1${escapeHtml(siteDescription)}$2`,
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), siteMetadataPlugin()],
  resolve: {
    alias: {
      '@site-router': fileURLToPath(new URL(routerFile, import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 本仓库含多组动态 import 工具组件。单进程顺序执行可避免在低配
    // 开发机/CI 上大量 jsdom worker 同时转换模块导致懒加载断言超时。
    fileParallelism: false,
  },
});
