import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { communityAuthApi } from '../../api/community';
import { CommunityLoginPage } from './LoginPage';

describe('CommunityLoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
  });

  it('returns to the original protected page with its query and fragment after login', async () => {
    vi.spyOn(communityAuthApi, 'login').mockResolvedValue({
      accessToken: 'synthetic-login-only',
      user: { id: 'test-person', publicId: 'test-person', email: '', username: 'qa_member', displayName: '测试用户', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified' },
    });
    function Destination() { const location = useLocation(); return <output aria-label="登录后地址">{location.pathname}{location.search}{location.hash}</output>; }
    render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/leaderboards', search: '?tab=games', hash: '#rail' } } }]}><Routes><Route path="/login" element={<CommunityLoginPage />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: '账号' }), { target: { value: 'qa_member' } });
    fireEvent.change(screen.getByLabelText(/^密码/), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByLabelText('登录后地址')).toHaveTextContent('/leaderboards?tab=games#rail');
  });

  it('explains why a password change requires another login', () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/login',
          state: { passwordChanged: true },
        }]}
      >
        <CommunityLoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '密码已更新，请使用新密码重新登录。',
    );
  });
});
