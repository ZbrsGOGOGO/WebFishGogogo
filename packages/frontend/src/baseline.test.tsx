import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { Profession, DEFAULT_PAGE_SIZE } from '@stealth-reader/shared';
import { App } from './App';

// 脚手架基线冒烟测试：验证 Vitest + fast-check + 共享类型 + React 渲染可用。
describe('frontend baseline', () => {
  it('renders the auth entry for unauthenticated users', () => {
    // 未认证用户访问根路径会被 ProtectedRoute 重定向到登录页（Req 1.5）。
    render(<App />);
    expect(
      screen.getByRole('heading', { name: '登录' }),
    ).toBeInTheDocument();
  });

  it('consumes shared constants', () => {
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
  });

  it('fast-check runs against profession set', () => {
    const professions = Object.values(Profession);
    fc.assert(
      fc.property(fc.constantFrom(...professions), (p) => professions.includes(p)),
    );
  });
});
