import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('community moderation release flag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keeps the moderation route and header entry closed when content is public but operations are disabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_CONTENT_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_MODERATION_ENABLED', 'false');
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { useCommunityAuthStore }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      pendingRegistration: null,
      user: {
        id: 'moderator-1',
        publicId: 'moderator-1',
        email: 'moderator@example.com',
        displayName: '审核员',
        accountStatus: 'active',
        onboardingCompleted: true,
        socialVerificationStatus: 'verified',
        roles: ['moderator'],
      },
    });

    render(<MemoryRouter initialEntries={['/moderation']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '内容审核台尚未开放' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '内容审核台' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
