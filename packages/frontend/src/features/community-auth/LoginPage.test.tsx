import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { CommunityLoginPage } from './LoginPage';

describe('CommunityLoginPage', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests();
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
