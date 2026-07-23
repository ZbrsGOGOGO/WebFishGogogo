// packages/frontend/src/app/router.tsx
// 应用路由表：公开的登录/注册页 + 受保护的应用区（ProtectedRoute 守卫）。

import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage, RegisterPage } from '../features/auth';
import { PrivacyPolicyPage, TermsOfServicePage } from '../features/compliance';
import { HomePage } from '../features/home/HomePage';
import { LibraryPage } from '../features/library';
import { ReaderPage } from '../features/reader';
import { ToolsPage } from '../features/tools';
import { ProtectedLayout } from './ProtectedLayout';

/**
 * 路由结构：
 * - /login, /register：公开认证页。
 * - /（及后续受保护页）：包裹在 ProtectedRoute 内，未认证重定向到 /login（Req 1.5）。
 *
 * 后续任务（15–19）在受保护区内新增 library / reader / tools / memo / 合规页路由。
 */
export function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* 合规页面对所有访客公开，无需认证即可访问（Req 13.2, 13.3, 13.5）。 */}
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms-of-service" element={<TermsOfServicePage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        {/* 阅读页伪装成博客文章路径（Req 5.1）。 */}
        <Route path="/blog/article/:docId" element={<ReaderPage />} />
        <Route path="/tools" element={<ToolsPage />} />
      </Route>

      {/* 未匹配路径回退到首页（由 ProtectedRoute 决定是否需要登录）。 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
