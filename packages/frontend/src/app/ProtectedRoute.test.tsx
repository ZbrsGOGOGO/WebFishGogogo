import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from './store/auth-store';

/** 重置 auth store 到未认证态。 */
function resetAuth(): void {
  useAuthStore.setState({ token: null, user: null, error: null, loading: false });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>登录页</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/secret" element={<div>机密内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute (Req 1.5)', () => {
  beforeEach(() => {
    resetAuth();
  });

  it('redirects unauthenticated users to login', () => {
    renderAt('/secret');
    expect(screen.getByText('登录页')).toBeInTheDocument();
    expect(screen.queryByText('机密内容')).not.toBeInTheDocument();
  });

  it('renders protected content when authenticated', () => {
    useAuthStore.setState({
      token: 'jwt-token',
      user: { id: 'u1', email: 'a@b.com', displayName: null },
    });
    renderAt('/secret');
    expect(screen.getByText('机密内容')).toBeInTheDocument();
  });
});
