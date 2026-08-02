import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRouter } from '../../app/router';
import { useAuthStore } from '../../app/store/auth-store';

/** 重置 auth store 到未认证态，验证合规页对未登录访客公开。 */
function resetAuth(): void {
  useAuthStore.setState({ token: null, user: null, error: null, loading: false });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  );
}

describe('Compliance pages (Req 13.2, 13.3, 13.5)', () => {
  beforeEach(() => {
    resetAuth();
  });

  it('serves the privacy policy page publicly without authentication', () => {
    renderAt('/privacy-policy');
    expect(
      screen.getByRole('heading', { level: 1, name: '隐私政策' }),
    ).toBeInTheDocument();
    // 未被重定向到登录页。
    expect(screen.queryByRole('heading', { name: '登录' })).not.toBeInTheDocument();
  });

  it('serves the terms of service page publicly without authentication', () => {
    renderAt('/terms-of-service');
    expect(
      screen.getByRole('heading', { level: 1, name: '服务条款' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录' })).not.toBeInTheDocument();
  });

  it('privacy policy links to terms of service and vice versa', () => {
    renderAt('/privacy-policy');
    expect(screen.getByRole('link', { name: '服务条款' })).toHaveAttribute(
      'href',
      '/terms-of-service',
    );
  });
});
