import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommunityApiError, communityAuthApi } from '../../api/community';
import {
  CommunityForgotPasswordPage,
  CommunityResetPasswordPage,
} from './PasswordPages';

describe('community password reset pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the same non-enumerating success after a reset request', async () => {
    const user = userEvent.setup();
    const request = vi.spyOn(communityAuthApi, 'forgotPassword').mockResolvedValue();
    render(
      <MemoryRouter>
        <CommunityForgotPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^邮箱/), ' User@Example.COM ');
    await user.click(screen.getByRole('button', { name: '发送重置说明' }));

    expect(request).toHaveBeenCalledWith('user@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      '如果该邮箱对应可用账号，重置说明将会发送',
    );
  });

  it('submits the token and validated newPassword field', async () => {
    const user = userEvent.setup();
    const reset = vi.spyOn(communityAuthApi, 'resetPassword').mockResolvedValue();
    render(
      <MemoryRouter initialEntries={['/password/reset?token=opaque-token']}>
        <CommunityResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^新密码/), 'secure-office-123');
    await user.type(screen.getByLabelText(/^确认新密码/), 'secure-office-123');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(reset).toHaveBeenCalledWith({
      token: 'opaque-token',
      newPassword: 'secure-office-123',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('密码已经更新');
  });

  it('shows rate limiting without revealing whether an email exists', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityAuthApi, 'forgotPassword').mockRejectedValue(
      new CommunityApiError(429, 'server detail'),
    );
    render(<MemoryRouter><CommunityForgotPasswordPage /></MemoryRouter>);

    await user.type(screen.getByLabelText(/^邮箱/), 'user@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置说明' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('操作过于频繁，请稍后再试');
    expect(screen.getByRole('alert')).not.toHaveTextContent('server detail');
  });

  it('turns 409 reset conflicts into a generic invalid-link message', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityAuthApi, 'resetPassword').mockRejectedValue(
      new CommunityApiError(409, 'token was already used'),
    );
    render(
      <MemoryRouter initialEntries={['/password/reset?token=opaque-token']}>
        <CommunityResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^新密码/), 'secure-office-123');
    await user.type(screen.getByLabelText(/^确认新密码/), 'secure-office-123');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('重置链接无效或已失效');
    expect(screen.getByRole('alert')).not.toHaveTextContent('token was already used');
  });
});
