import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 本仓库含多组动态 import 工具组件。单进程顺序执行可避免在低配
    // 开发机/CI 上大量 jsdom worker 同时转换模块导致懒加载断言超时。
    fileParallelism: false,
  },
});
